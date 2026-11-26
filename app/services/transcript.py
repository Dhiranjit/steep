import html
import json
import re
from urllib.parse import parse_qs, urlparse
from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget


YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
    "writesubtitles": True,
    "writeautomaticsub": True,
    "subtitleslangs": ["en", "en-.*"],
    "subtitlesformat": "json3",
    "impersonate": ImpersonateTarget("chrome"),
    "extractor_args": {"youtube": {"skip": ["hls", "dash"]}},
}


def extract_video_id(url: str) -> str:
    url = url.strip()
    if re.fullmatch(r"[a-zA-Z0-9_-]{11}", url):
        return url

    parsed = urlparse(url)
    if parsed.hostname == "youtu.be":
        if video_id := parsed.path.lstrip("/").split("/")[0]:
            return video_id

    if parsed.hostname in ("www.youtube.com", "youtube.com", "m.youtube.com"):
        if parsed.path == "/watch":
            if v := parse_qs(parsed.query).get("v"):
                return v[0]
        parts = parsed.path.strip("/").split("/")
        if len(parts) >= 2 and parts[0] in ("shorts", "live", "embed"):
            return parts[1]

    raise ValueError(f"Could not extract video ID from URL: {url}")


def sanitize_url(url: str) -> str:
    return f"https://www.youtube.com/watch?v={extract_video_id(url)}"


def _format_timestamp(ms: int) -> str:
    total_sec = max(0, int(ms // 1000))
    hours, rem = divmod(total_sec, 3600)
    minutes, seconds = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def _parse_json3(raw: str, interval_ms: int = 30_000) -> str:
    data = json.loads(raw)
    chunks = []
    current_texts = []
    block_start_ms = None

    for event in data.get("events", []):
        segs = event.get("segs")
        if not segs:
            continue
        text = re.sub(
            r"\s+", " ", html.unescape("".join(seg.get("utf8", "") for seg in segs))
        ).strip()
        if not text:
            continue

        start_ms = event.get("tStartMs", 0)
        if block_start_ms is None:
            block_start_ms = start_ms
        elif start_ms - block_start_ms >= interval_ms and current_texts:
            chunks.append(f"[{_format_timestamp(block_start_ms)}] {' '.join(current_texts)}")
            current_texts = []
            block_start_ms = start_ms

        current_texts.append(text)

    if current_texts and block_start_ms is not None:
        chunks.append(f"[{_format_timestamp(block_start_ms)}] {' '.join(current_texts)}")

    return "\n".join(chunks)


def get_video_data(url: str) -> dict:
    video_id = extract_video_id(url)
    clean_url = f"https://www.youtube.com/watch?v={video_id}"

    with YoutubeDL(YDL_OPTS) as ydl:
        info = ydl.extract_info(clean_url, download=False)
        subs = list((info.get("requested_subtitles") or {}).values())
        sub = next((s for s in subs if "tlang=" not in s.get("url", "")), None)
        if not sub or not sub.get("url"):
            raise ValueError("No English transcript available for this video")
        with ydl.urlopen(sub["url"]) as resp:
            transcript = _parse_json3(resp.read().decode("utf-8"))

    if not transcript:
        raise ValueError("Transcript track was empty")

    return {
        "video_id": video_id,
        "url": clean_url,
        "transcript": transcript,
        "title": info.get("title", "Untitled Video"),
        "description": info.get("description") or "",
        "channel": info.get("channel") or info.get("uploader") or "",
        "duration": int(info.get("duration") or 0),
    }


def get_transcript(url: str) -> str:
    return get_video_data(url)["transcript"]
