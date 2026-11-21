import asyncio
import json
from pathlib import Path
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.services.transcript import get_transcript, get_video_data, sanitize_url
from app.services.llm import LLMClient
from app.db import init_db, save_summary, list_summaries, get_summary, delete_summary, update_summary_topics, get_connection

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def backfill_topics_if_needed():
    try:
        conn = get_connection()
        rows = conn.execute("SELECT id, title, summary, topics FROM summaries").fetchall()
        conn.close()
        for row in rows:
            topics = []
            try:
                topics = json.loads(row["topics"] or "[]")
            except Exception:
                pass
            if not topics:
                extracted = await llm_client.extract_topics(row["title"], row["summary"][:1200])
                if extracted:
                    update_summary_topics(row["id"], extracted)
                    print(f"Backfilled topics for #{row['id']} '{row['title']}': {extracted}")
    except Exception as e:
        print(f"Error during topic backfill: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(backfill_topics_if_needed())
    async with httpx.AsyncClient() as client:
        app.state.http_client = client
        yield

llm_client = LLMClient()
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response

@app.get("/health")

def health():
    return {"status": "ok"}


@app.get("/transcript")
def transcript(url: str):
    clean_url = sanitize_url(url)
    print(f"Transcript request received: {clean_url}")
    text = get_transcript(clean_url)
    print(f"Transcript retrieved: {len(text)} chars")
    return {"transcript": text}


background_tasks = set()


async def generate_and_save(url: str, text: str, original_title: str, description: str, channel: str, queue: asyncio.Queue):
    chunks = []
    try:
        async for chunk in llm_client.summarize(text, original_title, description, channel):
            chunks.append(chunk)
            await queue.put(chunk)

        full_output = "".join(chunks)
        ai_title = original_title
        topics = ["General"]
        summary_markdown = full_output

        # Extract Line 1 JSON metadata (AI title & topics)
        lines = full_output.split("\n", 1)
        if lines:
            first_line = lines[0].strip()
            if first_line.startswith("```json"):
                first_line = first_line[7:].strip()
            if first_line.startswith("```"):
                first_line = first_line[3:].strip()
            if first_line.endswith("```"):
                first_line = first_line[:-3].strip()
            try:
                meta = json.loads(first_line)
                if isinstance(meta, dict):
                    if meta.get("title"):
                        ai_title = meta["title"].strip()
                    if meta.get("topics") and isinstance(meta["topics"], list):
                        topics = [str(t).strip() for t in meta["topics"] if str(t).strip()]
                if len(lines) > 1:
                    summary_markdown = lines[1].strip()
            except Exception as e:
                print(f"Failed to parse line 1 metadata: {e}")

        save_summary(url, ai_title, summary_markdown, topics)
    except Exception as e:
        await queue.put(f"\n\n**Error during summarization:** {e}")
    finally:
        await queue.put(None)


@app.get("/summarize")
async def summarize(url: str):
    try:
        clean_url = sanitize_url(url)
        video_info = get_video_data(clean_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    queue = asyncio.Queue()
    task = asyncio.create_task(
        generate_and_save(
            clean_url,
            video_info["transcript"],
            video_info["title"],
            video_info.get("description", ""),
            video_info.get("channel", ""),
            queue,
        )
    )
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)

    async def stream():
        while True:
            chunk = await queue.get()
            if chunk is None:
                break
            yield chunk

    return StreamingResponse(stream(), media_type="text/plain")



@app.get("/summaries")
def get_summaries():
    return list_summaries()


@app.post("/summaries/backfill-topics")
async def trigger_backfill():
    asyncio.create_task(backfill_topics_if_needed())
    return {"status": "started"}


@app.get("/summaries/{id}")
def get_summary_by_id(id: int):
    summary = get_summary(id)
    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")
    return summary


@app.delete("/summaries/{id}")
def delete_summary_by_id(id: int):
    success = delete_summary(id)
    if not success:
        raise HTTPException(status_code=404, detail="Summary not found")
    return {"status": "deleted", "id": id}


@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return FileResponse(index_file)


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

