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
from app.db import init_db, save_summary, list_summaries, get_summary, delete_summary

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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
    try:
        async for event in llm_client.summarize(text, original_title, description, channel):
            if event["type"] == "done":
                result = event["data"]
                save_summary(url, result.title, result.summary, result.topics)
            else:
                await queue.put(json.dumps(event) + "\n")
    except Exception as e:
        await queue.put(json.dumps({"type": "error", "message": str(e)}) + "\n")
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

    return StreamingResponse(stream(), media_type="application/x-ndjson")



@app.get("/summaries")
def get_summaries():
    return list_summaries()


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


@app.get("/favicon.ico")
def serve_favicon():
    return FileResponse(STATIC_DIR / "favicon.svg", media_type="image/svg+xml")


@app.get("/")
def serve_index():
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return FileResponse(index_file)


# Mount static assets
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")