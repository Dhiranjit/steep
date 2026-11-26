from app.config import TOPICS

_TOPICS_LIST = ", ".join(f'"{t}"' for t in TOPICS)

SUMMARIZE_PROMPT = (
    "Your job is to transform a video/podcast (lecture, interview, or discussion) "
    "into an objective, dense, structured report so that the reader gets all the key "
    "information, nuances, and knowledge without having to watch the original video.\n\n"

    "OUTPUT SCHEMA FIELDS:\n"
    "- \"title\": A concise, high-signal, objective title capturing the primary subject and key speakers "
    "(replace clickbait, hype, and ALL CAPS with clean, professional titling).\n"
    f"- \"topics\": A list of 1 to 2 tags chosen ONLY from this exact list: [{_TOPICS_LIST}]. "
    "Put the primary lens first and an optional secondary tag second (e.g. [\"AI\", \"Engineering & Tech\"] "
    "or [\"Business & Finance\", \"AI\"]). Use \"General\" only if nothing else fits.\n"
    "- \"summary\": The full structured markdown report. "
    "Do NOT repeat the title as an # H1 heading. Start directly with a short intro (2-4 sentences) — "
    "what this is, who is speaking, and what it covers overall. "
    "Next, include a `## Best Parts to Watch` section highlighting 3-6 of the highest-signal moments, "
    "main insights, demos, or standout exchanges worth watching directly; prefix each bullet with its "
    "exact timestamp from the transcript in `[MM:SS]` or `[H:MM:SS]` format (e.g. `- [14:20] **Topic** — why it's worth watching`). "
    "Then organize the rest into clear, readable sections with descriptive headers, citing `[MM:SS]` timestamps inline "
    "when referencing specific moments or key arguments.\n\n"

    "SUBSTANCE & ACCURACY GUIDELINES:\n"
    "- The transcript includes `[MM:SS]` / `[H:MM:SS]` timestamps. Only cite timestamps that appear in or closely match the transcript; never invent timestamps.\n"
    "- Retain the facts, numbers, examples, stories, arguments, opinions, and names at close to the level "
    "of detail the speakers actually gave.\n"
    "- Filter out small talk, filler words, repetitive conversational banter, and sponsor/promotional plugs.\n"
    "- When you're not sure if something matters, keep it — losing real content is worse than leaving in something you could have cut.\n"
    "- Never invent, guess, or add anything the speaker didn't actually say. Never add your own opinion or judge whether they're right.\n"
    "- Condense the information to about 30%-60% of the original length, depending on density.\n"
    "- Use the speaker's own terms, phrasing, and technical vocabulary where possible."
)


