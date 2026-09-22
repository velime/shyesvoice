import os

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import audiomanager
import playback_output
import config as cfgmodule
import state

DASHBOARD_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "discord-tts-dashboard-ui", "dist"
)

app = Flask(__name__)

# Local dashboard and Vite development origins only.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS(app, origins=ALLOWED_ORIGINS)



# ---------------- dashboard (built single-file UI) ----------------
@app.get("/")
def dashboard():
    if not os.path.exists(os.path.join(DASHBOARD_DIST, "index.html")):
        return (
            "Dashboard isn't built yet. Run:\n"
            "  cd discord-tts-dashboard-ui && npm install && npm run build\n"
            "then restart python main.py.",
            200,
            {"Content-Type": "text/plain; charset=utf-8"},
        )
    return send_from_directory(DASHBOARD_DIST, "index.html")

_voices_cache = None


# ---------------- TTS control ----------------
@app.get("/status")
def status():
    cfg = cfgmodule.load()
    device_error = ""
    try:
        name = playback_output.validate_device(cfg["output_device_id"])
    except Exception as exc:
        name = cfg["output_device_name"]
        device_error = str(exc)
    if not device_error and cfg["output_device_id"] == playback_output.SOUNDPAD_ID and cfg["monitor_enabled"]:
        try:
            playback_output.validate_monitor(cfg["monitor_device_id"])
        except Exception as exc:
            device_error = str(exc)
    with state.lock:
        return jsonify({
            "engineStatus": "online" if state.engine_ready else "offline",
            "outputStatus": "unavailable" if device_error else "ready",
            "outputDeviceId": cfg["output_device_id"],
            "outputDeviceName": name,
            "playbackStatus": state.playback_status,
            "activeDeviceId": state.active_device_id,
            "queueSize": len(state.queue),
            "lastMessage": state.last_message,
            "error": state.last_error or device_error,
            "errorId": state.error_id,
            "completedCount": state.completed_count,
        })


@app.post("/speak")
def speak():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    if not isinstance(text, str):
        return jsonify({"ok": False, "error": "text must be a string"}), 400
    text = text.strip()

    if not text:
        return jsonify({"ok": False, "error": "text is required"}), 400

    if len(text) > 500:
        return jsonify({"ok": False, "error": "Maximum message length is 500 characters"}), 400
    try:
        audiomanager.enqueue(text)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    return jsonify({"ok": True})


@app.post("/repeat")
def repeat():
    with state.lock:
        if not state.last_message:
            return jsonify({"ok": False, "error": "nothing to repeat"}), 400
        text = state.last_message
    try:
        audiomanager.enqueue(text)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    return jsonify({"ok": True})


@app.post("/clear")
def clear():
    with state.lock:
        state.queue.clear()

    return jsonify({"ok": True})


@app.post("/rate")
def set_rate():
    data = request.get_json(silent=True) or {}

    try:
        rate = int(data.get("rate", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "rate must be an integer"}), 400

    rate = max(-50, min(50, rate))

    cfgmodule.save({"tts_rate": rate})
    with state.lock:
        state.rate = rate

    return jsonify({"ok": True, "rate": rate})


# ---------------- Windows output / configuration ----------------
@app.get("/devices")
def devices():
    try:
        return jsonify(playback_output.list_devices())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 503


@app.get("/config")
def get_config():
    cfg = cfgmodule.load()
    return jsonify({
        "configured": bool(cfg["output_device_id"]),
        "outputDeviceId": cfg["output_device_id"],
        "outputDeviceName": cfg["output_device_name"],
        "monitorEnabled": cfg["monitor_enabled"],
        "monitorDeviceId": cfg["monitor_device_id"],
        "monitorDeviceName": cfg["monitor_device_name"],
        "ttsVoice": cfg["tts_voice"],
        "ttsRate": cfg["tts_rate"],
    })


@app.post("/config")
def update_config():
    data = request.get_json(silent=True) or {}
    patch = {}
    if "outputDeviceId" in data:
        device_id = data["outputDeviceId"]
        if not isinstance(device_id, str) or not device_id:
            return jsonify({"ok": False, "error": "Choose an Output Device"}), 400
        try:
            patch["output_device_name"] = playback_output.validate_device(device_id)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        patch["output_device_id"] = device_id
    if "monitorEnabled" in data:
        if not isinstance(data["monitorEnabled"], bool):
            return jsonify({"ok": False, "error": "monitorEnabled must be a boolean"}), 400
        patch["monitor_enabled"] = data["monitorEnabled"]
    if "monitorDeviceId" in data:
        monitor_id = data["monitorDeviceId"]
        if not isinstance(monitor_id, str) or not monitor_id:
            return jsonify({"ok": False, "error": "Choose a Local Monitor Device"}), 400
        try:
            patch["monitor_device_name"] = playback_output.validate_monitor(monitor_id)
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        patch["monitor_device_id"] = monitor_id
    if "ttsVoice" in data:
        if not isinstance(data["ttsVoice"], str) or not data["ttsVoice"].strip():
            return jsonify({"ok": False, "error": "ttsVoice is required"}), 400
        patch["tts_voice"] = data["ttsVoice"].strip()
    if "ttsRate" in data:
        try:
            patch["tts_rate"] = max(-50, min(50, int(data["ttsRate"])))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "ttsRate must be an integer"}), 400
    new_cfg = cfgmodule.save(patch)
    with state.lock:
        state.rate = new_cfg["tts_rate"]
    return jsonify({"ok": True})


@app.get("/voices")
def voices():
    global _voices_cache

    if _voices_cache is None:
        import asyncio
        import edge_tts

        async def _fetch():
            return await edge_tts.list_voices()

        try:
            raw = asyncio.run(_fetch())
        except Exception as e:
            return jsonify({"error": str(e)}), 502

        _voices_cache = sorted(
            (
                {"name": v["ShortName"], "locale": v["Locale"], "gender": v["Gender"]}
                for v in raw
            ),
            key=lambda v: (v["locale"], v["name"]),
        )

    return jsonify(_voices_cache)


def run(port: int = 5000):
    # 127.0.0.1 only — never expose this on the LAN or internet. It has no
    # authentication and controls local audio output.
    app.run(host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
