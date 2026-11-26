import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "steep.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def estimate_reading_time(text: str) -> int:
    words = len((text or "").split())
    return max(1, round(words / 225))


def _deserialize_row(row) -> dict:
    item = dict(row)
    try:
        item["topics"] = json.loads(item.get("topics") or "[]")
    except Exception:
        item["topics"] = []
    return item


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            original_title TEXT NOT NULL DEFAULT '',
            channel TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 0,
            reading_time INTEGER NOT NULL DEFAULT 1,
            transcript TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            topics TEXT DEFAULT '[]'
        )
    """)
    conn.commit()
    conn.close()


def save_summary(
    video_id: str,
    url: str,
    title: str,
    summary: str,
    topics: list = None,
    transcript: str = "",
    original_title: str = "",
    channel: str = "",
    description: str = "",
    duration: int = 0,
) -> dict:
    conn = get_connection()
    topics_json = json.dumps(topics or [])
    reading_time = estimate_reading_time(summary)
    cursor = conn.execute(
        """
        INSERT INTO summaries (
            video_id, url, title, original_title, channel, description,
            duration, reading_time, transcript, summary, topics
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            video_id,
            url,
            title,
            original_title,
            channel,
            description,
            duration,
            reading_time,
            transcript,
            summary,
            topics_json,
        ),
    )
    row_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM summaries WHERE id = ?", (row_id,)).fetchone()
    conn.close()
    return _deserialize_row(row)


def update_summary(id: int, title: str, summary: str, topics: list = None) -> dict | None:
    conn = get_connection()
    topics_json = json.dumps(topics or [])
    reading_time = estimate_reading_time(summary)
    cursor = conn.execute(
        """
        UPDATE summaries
        SET title = ?, summary = ?, topics = ?, reading_time = ?
        WHERE id = ?
        """,
        (title, summary, topics_json, reading_time, id),
    )
    conn.commit()
    if cursor.rowcount == 0:
        conn.close()
        return None
    row = conn.execute("SELECT * FROM summaries WHERE id = ?", (id,)).fetchone()
    conn.close()
    return _deserialize_row(row)


def list_summaries():
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT id, video_id, url, title, channel, duration, reading_time, summary, created_at, topics
        FROM summaries
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()
    conn.close()
    return [_deserialize_row(row) for row in rows]


def get_summary(id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM summaries WHERE id = ?", (id,)).fetchone()
    conn.close()
    return _deserialize_row(row) if row else None


def get_summary_by_video_id(video_id: str):
    conn = get_connection()
    row = conn.execute("SELECT * FROM summaries WHERE video_id = ?", (video_id,)).fetchone()
    conn.close()
    return _deserialize_row(row) if row else None


def delete_summary(id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM summaries WHERE id = ?", (id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


