from pathlib import Path
import os
import yaml
from dotenv import load_dotenv

load_dotenv()

def load_config(path: str | Path = "configs/config.yaml") -> dict:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    config["_config_path"] = str(path)
    return config

def database_url() -> str:
    value = os.getenv("DATABASE_URL")
    if value:
        return value
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "retail_anomaly")
    user = os.getenv("POSTGRES_USER", "retail_user")
    password = os.getenv("POSTGRES_PASSWORD", "change_me_locally")
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{db}"
