import os
from dotenv import load_dotenv


load_dotenv()

# MODELS
DEEPSEEK_V4_FLASH = "deepseek/deepseek-v4-flash-0731"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")