"""Local TTS configuration; voice/rate survive migration from the bot version."""
import json
import os
import threading

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

DEFAULTS = {
    "output_device_id": "",
    "output_device_name": "",
    "monitor_enabled": True,
    "monitor_device_id": "",
    "monitor_device_name": "",
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
    if os.environ.get("TTS_VOICE"):
        seeded["tts_voice"] = os.environ["TTS_VOICE"]
    if os.environ.get("FLASK_PORT"):
        try:
            seeded["flask_port"] = int(os.environ["FLASK_PORT"])
        except ValueError:
            pass
    return seeded


def _write(data: dict):
    temporary = CONFIG_PATH + ".tmp"
    with open(temporary, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(temporary, CONFIG_PATH)


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
        if merged != raw:
            _write(merged)  # Also discard legacy bot credentials.
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
