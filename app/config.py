import os
from dotenv import load_dotenv


load_dotenv()

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

TOPICS = [
    "AI",
    "Engineering & Tech",
    "Business & Finance",
    "Science & Math",
    "Geopolitics & History",
    "Philosophy",
    "Psychology",
    "General",
]

# MODELS
DEEPSEEK_V4_FLASH = "deepseek/deepseek-v4.1-flash-1017"