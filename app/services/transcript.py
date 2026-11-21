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


def _parse_json3(raw: str) -> str:
    data = json.loads(raw)
    parts = [
        "".join(seg.get("utf8", "") for seg in event["segs"])
        for event in data.get("events", [])
        if event.get("segs")
    ]
    return re.sub(r"\s+", " ", html.unescape(" ".join(parts))).strip()


def get_video_data(url: str) -> dict:
    clean_url = sanitize_url(url)

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
        "transcript": transcript,
        "title": info.get("title", "Untitled Video"),
        "description": info.get("description") or "",
        "channel": info.get("channel") or info.get("uploader") or "",
    }


def get_transcript(url: str) -> str:
    return get_video_data(url)["transcript"]
