"""Local, user-editable bot configuration.

Settings live in config.json next to this file (never committed — see
.gitignore) and are readable/writable both from the Flask API (so the
dashboard's Settings screen can change them) and from the bot manager.

On first run, if no config.json exists yet but a legacy .env is present,
values are migrated in automatically so nothing is lost.
"""
import json
import os
import threading

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

DEFAULTS = {
    "discord_token": "",
    "target_user_id": "",   # empty = auto-follow disabled, use manual join/leave
    "tts_voice": "uk-UA-OstapNeural",
    "tts_rate": 0,
    "flask_port": 5000,
}

_lock = threading.Lock()


def _seed_from_env() -> dict:
    """One-time migration path for people still using the old .env file."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    seeded = {}
    if os.environ.get("DISCORD_TOKEN"):
        seeded["discord_token"] = os.environ["DISCORD_TOKEN"]
    if os.environ.get("TARGET_USER_ID"):
        seeded["target_user_id"] = os.environ["TARGET_USER_ID"]
    if os.environ.get("TTS_VOICE"):
        seeded["tts_voice"] = os.environ["TTS_VOICE"]
    if os.environ.get("FLASK_PORT"):
        try:
            seeded["flask_port"] = int(os.environ["FLASK_PORT"])
        except ValueError:
            pass
    return seeded


def _write(data: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load() -> dict:
    with _lock:
        if not os.path.exists(CONFIG_PATH):
            data = dict(DEFAULTS)
            data.update(_seed_from_env())
            _write(data)
            return data

        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except (json.JSONDecodeError, OSError):
            raw = {}

        merged = dict(DEFAULTS)
        merged.update({k: v for k, v in raw.items() if k in DEFAULTS})
        return merged


def save(patch: dict) -> dict:
    with _lock:
        current = dict(DEFAULTS)
        if os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    current.update({k: v for k, v in json.load(f).items() if k in DEFAULTS})
            except (json.JSONDecodeError, OSError):
                pass

        current.update({k: v for k, v in patch.items() if k in DEFAULTS})
        _write(current)
        return current
