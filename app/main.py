import asyncio
import json
from pathlib import Path
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.services.transcript import (
    extract_video_id,
    get_transcript,
    get_video_data,
    sanitize_url,
)
from app.services.llm import LLMClient
from app.db import (
    delete_summary,
    get_summary,
    get_summary_by_video_id,
    init_db,
    list_summaries,
    save_summary,
    update_summary,
)

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


async def generate_and_save(
    video_info: dict,
    queue: asyncio.Queue,
    existing_id: int | None = None,
):
    try:
        await queue.put(
            json.dumps({
                "type": "video_meta",
                "video_id": video_info["video_id"],
                "url": video_info["url"],
                "channel": video_info.get("channel", ""),
                "duration": video_info.get("duration", 0),
            })
            + "\n"
        )
        async for event in llm_client.summarize(
            video_info["transcript"],
            video_info["title"],
            video_info.get("description", ""),
            video_info.get("channel", ""),
        ):
            if event["type"] == "done":
                result = event["data"]
                if existing_id is not None:
                    saved = update_summary(existing_id, result.title, result.summary, result.topics)
                else:
                    saved = save_summary(
                        video_id=video_info["video_id"],
                        url=video_info["url"],
                        title=result.title,
                        summary=result.summary,
                        topics=result.topics,
                        transcript=video_info["transcript"],
                        original_title=video_info["title"],
                        channel=video_info.get("channel", ""),
                        description=video_info.get("description", ""),
                        duration=video_info.get("duration", 0),
                    )
                if saved:
                    await queue.put(
                        json.dumps({
                            "type": "saved",
                            "id": saved["id"],
                            "reading_time": saved["reading_time"],
                        })
                        + "\n"
                    )
            else:
                await queue.put(json.dumps(event) + "\n")
    except Exception as e:
        await queue.put(json.dumps({"type": "error", "message": str(e)}) + "\n")
    finally:
        await queue.put(None)


def _stream_queue_response(video_info: dict, existing_id: int | None = None) -> StreamingResponse:
    queue = asyncio.Queue()
    task = asyncio.create_task(generate_and_save(video_info, queue, existing_id=existing_id))
    background_tasks.add(task)
    task.add_done_callback(background_tasks.discard)

    async def stream():
        while True:
            chunk = await queue.get()
            if chunk is None:
                break
            yield chunk

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.get("/summarize")
async def summarize(url: str):
    try:
        video_id = extract_video_id(url)
        clean_url = sanitize_url(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    existing = get_summary_by_video_id(video_id)
    if existing:
        async def duplicate_stream():
            yield json.dumps({"type": "duplicate", "id": existing["id"], "title": existing["title"]}) + "\n"

        return StreamingResponse(duplicate_stream(), media_type="application/x-ndjson")

    try:
        video_info = get_video_data(clean_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _stream_queue_response(video_info)


@app.post("/summaries/{id}/regenerate")
async def regenerate_summary(id: int):
    existing = get_summary(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Summary not found")
    if not existing.get("transcript"):
        raise HTTPException(status_code=400, detail="No saved transcript available to regenerate")

    video_info = {
        "video_id": existing["video_id"],
        "url": existing["url"],
        "transcript": existing["transcript"],
        "title": existing.get("original_title") or existing["title"],
        "description": existing.get("description", ""),
        "channel": existing.get("channel", ""),
        "duration": existing.get("duration", 0),
    }
    return _stream_queue_response(video_info, existing_id=id)



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