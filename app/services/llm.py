import json
from typing import Literal
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict
from app import config
from app.prompts import SUMMARIZE_PROMPT

_TOPIC_LOOKUP = {t.lower(): t for t in config.TOPICS}
TopicLiteral = Literal[tuple(config.TOPICS)]


class SummaryOutput(BaseModel):
    """Schema enforced for structured LLM summarization output."""

    model_config = ConfigDict(extra="forbid")
    title: str
    topics: list[TopicLiteral]
    summary: str


_SUMMARY_RESPONSE_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "summary_output",
        "strict": True,
        "schema": SummaryOutput.model_json_schema(),
    },
}

_DECODER = json.JSONDecoder()
_ESCAPE_MAP = {
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "b": "\b",
    "f": "\f",
    '"': '"',
    "\\": "\\",
    "/": "/",
}


def validate_topics(raw_topics) -> list[str]:
    """Normalize and constrain topic tags to at most 2 canonical entries."""
    if not isinstance(raw_topics, list):
        return ["General"]
    valid = []
    for item in raw_topics:
        canonical = _TOPIC_LOOKUP.get(str(item).strip().lower())
        if canonical and canonical not in valid:
            valid.append(canonical)
    if len(valid) > 1 and "General" in valid:
        valid = [t for t in valid if t != "General"]
    return valid[:2] if valid else ["General"]


class _JsonSummaryStreamParser:
    """Incrementally extracts metadata and unescaped summary text from a streamed JSON object."""

    def __init__(self, fallback_title: str):
        self.fallback_title = fallback_title
        self.buf = ""
        self.pos = 0
        self.stage = "init"
        self.current_key: str | None = None
        self.meta: dict = {}
        self.meta_emitted = False
        self.escape = False
        self.unicode_buf: str | None = None
        self.high_surrogate: int | None = None

    def _skip_ws(self):
        while self.pos < len(self.buf) and self.buf[self.pos] in " \t\r\n":
            self.pos += 1

    def _maybe_emit_meta(self, events: list[dict], force: bool = False):
        if self.meta_emitted:
            return
        if force or ("title" in self.meta and "topics" in self.meta):
            raw_title = str(self.meta.get("title") or "").strip()
            events.append({
                "type": "meta",
                "title": raw_title or self.fallback_title,
                "topics": validate_topics(self.meta.get("topics")),
            })
            self.meta_emitted = True

    def _read_summary_chars(self) -> str:
        out: list[str] = []
        while self.pos < len(self.buf):
            ch = self.buf[self.pos]
            self.pos += 1

            if self.unicode_buf is not None:
                self.unicode_buf += ch
                if len(self.unicode_buf) == 4:
                    code = int(self.unicode_buf, 16)
                    self.unicode_buf = None
                    if 0xD800 <= code <= 0xDBFF:
                        self.high_surrogate = code
                    elif self.high_surrogate is not None and 0xDC00 <= code <= 0xDFFF:
                        combined = 0x10000 + ((self.high_surrogate - 0xD800) << 10) + (code - 0xDC00)
                        self.high_surrogate = None
                        out.append(chr(combined))
                    else:
                        self.high_surrogate = None
                        out.append(chr(code))
                continue

            if self.escape:
                self.escape = False
                if ch == "u":
                    self.unicode_buf = ""
                else:
                    out.append(_ESCAPE_MAP.get(ch, ch))
                continue

            if ch == "\\":
                self.escape = True
                continue
            if ch == '"':
                self.stage = "key"
                break
            out.append(ch)
        return "".join(out)

    def feed(self, chunk: str) -> list[dict]:
        self.buf += chunk
        events: list[dict] = []

        while self.pos < len(self.buf) and self.stage != "done":
            if self.stage == "summary_str":
                delta = self._read_summary_chars()
                if delta:
                    events.append({"type": "chunk", "delta": delta})
                continue

            self._skip_ws()
            if self.pos >= len(self.buf):
                break

            if self.stage == "init":
                if self.buf[self.pos] == "{":
                    self.pos += 1
                    self.stage = "key"
                else:
                    break
            elif self.stage == "key":
                if self.buf[self.pos] == ",":
                    self.pos += 1
                    self._skip_ws()
                    if self.pos >= len(self.buf):
                        break
                if self.buf[self.pos] == "}":
                    self.pos += 1
                    self.stage = "done"
                    break
                try:
                    key, next_pos = _DECODER.raw_decode(self.buf, self.pos)
                except json.JSONDecodeError:
                    break
                self.current_key = str(key)
                self.pos = next_pos
                self.stage = "colon"
            elif self.stage == "colon":
                if self.buf[self.pos] == ":":
                    self.pos += 1
                    self.stage = "value"
                else:
                    break
            elif self.stage == "value":
                if self.current_key == "summary" and self.buf[self.pos] == '"':
                    if self.meta:
                        self._maybe_emit_meta(events, force=True)
                    self.pos += 1
                    self.stage = "summary_str"
                else:
                    try:
                        val, next_pos = _DECODER.raw_decode(self.buf, self.pos)
                    except json.JSONDecodeError:
                        break
                    if self.current_key:
                        self.meta[self.current_key] = val
                    self.pos = next_pos
                    self.stage = "key"
                    self._maybe_emit_meta(events)

        return events


class LLMClient:
    def __init__(self):
        self.client = AsyncOpenAI(
            base_url=config.OPENROUTER_BASE_URL,
            api_key=config.OPENROUTER_API_KEY,
        )
        self.model = config.DEEPSEEK_V4_FLASH

    async def summarize(self, transcript: str, original_title: str, description: str = "", channel: str = ""):
        """Stream structured summary events ('meta', 'chunk', and final validated 'done')."""
        context_parts = []
        if channel:
            context_parts.append(f"Channel / Creator: {channel}")
        if original_title:
            context_parts.append(f"Original Video Title: {original_title}")
        if description:
            context_parts.append(f"Video Description / Chapters:\n{description.strip()}")

        context_str = "\n".join(context_parts) if context_parts else f"Original Title: {original_title}"
        user_content = (
            f"--- VIDEO CONTEXT ---\n"
            f"{context_str}\n\n"
            f"--- TRANSCRIPT ---\n"
            f"{transcript}"
        )

        messages = [
            {"role": "system", "content": SUMMARIZE_PROMPT},
            {"role": "user", "content": user_content},
        ]

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format=_SUMMARY_RESPONSE_FORMAT,
            extra_body={"reasoning": {"effort": "low"}},
            stream=True,
        )

        parser = _JsonSummaryStreamParser(fallback_title=original_title)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                for event in parser.feed(delta):
                    yield event

        validated = SummaryOutput.model_validate_json(parser.buf.strip())
        normalized = SummaryOutput(
            title=validated.title.strip() or original_title,
            topics=validate_topics(validated.topics),
            summary=validated.summary.strip(),
        )
        if not parser.meta_emitted:
            yield {
                "type": "meta",
                "title": normalized.title,
                "topics": normalized.topics,
            }
        yield {"type": "done", "data": normalized}

