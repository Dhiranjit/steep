import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "steep.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            topics TEXT DEFAULT '[]'
        )
    """)
    # Ensure topics column exists if table was created previously without it
    cursor = conn.execute("PRAGMA table_info(summaries)")
    columns = [row["name"] for row in cursor.fetchall()]
    if "topics" not in columns:
        conn.execute("ALTER TABLE summaries ADD COLUMN topics TEXT DEFAULT '[]'")
    conn.commit()
    conn.close()


def save_summary(url: str, title: str, summary: str, topics: list = None) -> int:
    conn = get_connection()
    topics_json = json.dumps(topics or [])
    cursor = conn.execute(
        "INSERT INTO summaries (url, title, summary, topics) VALUES (?, ?, ?, ?)",
        (url, title, summary, topics_json),
    )
    conn.commit()
    conn.close()
    return cursor.lastrowid


def update_summary_topics(id: int, topics: list) -> bool:
    conn = get_connection()
    topics_json = json.dumps(topics or [])
    cursor = conn.execute(
        "UPDATE summaries SET topics = ? WHERE id = ?",
        (topics_json, id),
    )
    conn.commit()
    updated = cursor.rowcount > 0
    conn.close()
    return updated


def list_summaries():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, url, title, summary, created_at, topics FROM summaries ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["topics"] = json.loads(item.get("topics") or "[]")
        except Exception:
            item["topics"] = []
        result.append(item)
    return result


def get_summary(id: int):
    conn = get_connection()
    row = conn.execute("SELECT * FROM summaries WHERE id = ?", (id,)).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    try:
        item["topics"] = json.loads(item.get("topics") or "[]")
    except Exception:
        item["topics"] = []
    return item


def delete_summary(id: int) -> bool:
    conn = get_connection()
    cursor = conn.execute("DELETE FROM summaries WHERE id = ?", (id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


