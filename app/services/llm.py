from openai import AsyncOpenAI
from app import config
from app.prompts import SUMMARIZE_PROMPT


class LLMClient:
    def __init__(self):
        self.client = AsyncOpenAI(
            base_url=config.OPENROUTER_BASE_URL,
            api_key=config.OPENROUTER_API_KEY,
        )
        self.model = config.DEEPSEEK_V4_FLASH


    async def summarize(self, transcript: str, original_title: str, description: str = "", channel: str = ""):
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
            extra_body={"reasoning": {"effort": "low"}},
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


    async def extract_topics(self, title: str, summary: str) -> list[str]:
        import json
        prompt = (
            "You are an expert content categorizer. Given the video title and summary excerpt, "
            "provide 1 or 2 concise, broad topic tags that best categorize this content.\n"
            "Examples of high-level topics: 'Artificial Intelligence', 'Software Engineering', "
            "'Investing & Finance', 'Autonomous Vehicles', 'Startups & Business', 'Science & Technology', "
            "'Economics & Geopolitics', 'Health & Medicine', 'Philosophy & Culture'.\n"
            "Format rule: Return ONLY a valid JSON list of 1 to 2 strings, e.g. [\"Artificial Intelligence\", \"Software Engineering\"]. "
            "Do not include explanation or additional text."
        )
        sample = summary[:1200]
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"Title: {title}\n\nSummary excerpt:\n{sample}"},
                ],
                temperature=0.2,
            )
            raw = response.choices[0].message.content.strip()
            if "```" in raw:
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            tags = json.loads(raw.strip())
            if isinstance(tags, list):
                cleaned = [str(t).strip() for t in tags if str(t).strip()]
                if cleaned:
                    return cleaned[:2]
        except Exception as e:
            print(f"Error extracting topics: {e}")
        return ["General"]

        


