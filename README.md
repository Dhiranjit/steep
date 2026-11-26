# Steep

Steep is a local-first web app for turning long-form YouTube videos, podcasts, interviews, and lectures into dense, structured notes. Paste a YouTube link, and Steep pulls the timestamped transcript, streams a structured markdown report in real time, and saves everything locally in SQLite for offline browsing.

I built Steep because most AI video summarizers either flatten hours of nuance into generic five-bullet recaps or hide your notes behind a SaaS paywall. Steep aims to preserve the actual substance—numbers, arguments, technical terms, and stories—while cutting out small talk, filler, and sponsor reads.

## Features

- **Dense, timestamped summaries:** Generates structured markdown notes with a "Best Parts to Watch" section and inline `[MM:SS]` / `[H:MM:SS]` citations. Timestamps in the UI are automatically linkified to jump straight to that moment on YouTube.
- **Live streaming with structured output:** Streams the summary token-by-token to the browser while still enforcing a strict JSON schema (`title`, `topics`, `summary`).
- **Local SQLite library:** Automatically saves summaries, video metadata (channel, duration, estimated reading time), topic tags, and raw transcripts to `steep.db`.
- **Browse, search, and filter:** Search saved notes by title or channel, or switch to the All Notes library to group summaries by topic, channel, or grid view.
- **Deduplication & regeneration:** Detects if a video has already been summarized to avoid duplicate work, and lets you regenerate a summary directly from the stored transcript without re-fetching from YouTube.
- **One-click Markdown export:** Copy raw markdown from any note for Obsidian, Notion, or plain-text workflows.

## How It Works

Steep runs as a single FastAPI service with no frontend build step:

1. **Transcript extraction (`app/services/transcript.py`):** Uses `yt-dlp` (with Chrome impersonation via `curl-cffi`) to fetch YouTube's `json3` English subtitles without downloading media files. Subtitle events are cleaned and grouped into 30-second timestamped blocks.
2. **Streaming structured LLM output (`app/services/llm.py`):** Queries OpenRouter (`deepseek/deepseek-v4.1-flash-1017` via the OpenAI Python SDK) with a strict Pydantic-backed JSON schema. A custom incremental JSON stream parser extracts `title` and `topics` as soon as they arrive and streams unescaped `summary` characters over NDJSON (`application/x-ndjson`), then validates the complete payload before persisting.
3. **Persistence & background completion (`app/db.py`, `app/main.py`):** Generation runs in an `asyncio` task feeding a queue, so summaries finish saving to SQLite even if the browser disconnects mid-stream.
4. **Vanilla frontend (`static/`):** Pure HTML5, CSS3, and ES6+ JavaScript served directly by FastAPI, using Marked.js to render streaming markdown.

## Tech Stack

- **Backend:** Python 3.12+, FastAPI, Uvicorn, Pydantic, SQLite
- **Transcripts:** `yt-dlp`, `curl-cffi`
- **LLM:** `openai` SDK targeting OpenRouter (`DeepSeek V4 Flash`)
- **Frontend:** Vanilla HTML/CSS/JS, Marked.js
- **Package Management:** `uv`

## Getting Started

```bash
uv run uvicorn app.main:app --reload
```

## Project Structure

```text
steep/
├── app/
│   ├── main.py              # FastAPI routes, NDJSON streaming, static file serving
│   ├── config.py            # Environment settings, model config, canonical topics
│   ├── db.py                # SQLite schema and CRUD helpers
│   ├── prompts.py           # Summarization system prompt
│   └── services/
│       ├── llm.py           # OpenRouter client and incremental JSON stream parser
│       └── transcript.py    # yt-dlp metadata and json3 transcript extraction
├── static/
│   ├── index.html           # App shell
│   ├── css/                 # Core UI and rendered markdown styles
│   └── js/                  # UI state, API/NDJSON client, markdown & timestamp helpers
└── pyproject.toml
```
