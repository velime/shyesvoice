import base64
import os
import threading

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import botmanager
import config as cfgmodule
import state

DASHBOARD_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "discord-tts-dashboard-ui", "dist"
)

app = Flask(__name__)

# This API controls a real Discord bot (and /config hands back its raw
# token) — it must never be reachable from anything but this machine's own
# browser. Bind to loopback only (see run(), below) and only allow the
# origins the dashboard is actually served from: itself (same-origin, no
# CORS needed, but harmless to list) and the Vite dev server.
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
CORS(app, origins=ALLOWED_ORIGINS)

INVITE_PERMISSIONS = 3146752  # View Channel + Connect + Speak


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


def _client_id_from_token(token: str):
    """A bot token's first '.'-segment is the base64 of its own user id,
    which is the same id Discord uses as the OAuth2 client_id for invite
    links — so we can build the invite link from just the token."""
    try:
        first = token.split(".")[0]
        padded = first + "=" * (-len(first) % 4)
        decoded = base64.urlsafe_b64decode(padded).decode("ascii")
        return decoded if decoded.isdigit() else None
    except Exception:
        return None


# ---------------- TTS control ----------------
@app.get("/status")
def status():
    with state.lock:
        return jsonify({
            "botStatus": "online" if state.bot_ready else "offline",
            "botUsername": state.bot_username,
            "voiceStatus": "connected" if state.voice_connected else "disconnected",
            "voiceChannelId": state.voice_channel_id,
            "queueSize": len(state.queue),
            "lastMessage": state.last_message,
        })


@app.post("/speak")
def speak():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"ok": False, "error": "text is required"}), 400

    with state.lock:
        state.queue.append(text)
        state.last_message = text

    print("QUEUED:", text)

    return jsonify({"ok": True})


@app.post("/repeat")
def repeat():
    with state.lock:
        if not state.last_message:
            return jsonify({"ok": False, "error": "nothing to repeat"}), 400
        state.queue.append(state.last_message)

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

    with state.lock:
        state.rate = rate

    return jsonify({"ok": True, "rate": rate})


# ---------------- voice channel control (manual override) ----------------
@app.get("/channels")
def channels():
    return jsonify(botmanager.list_voice_channels())


@app.post("/join")
def join_channel():
    data = request.get_json(silent=True) or {}
    channel_id = data.get("channelId")

    if not channel_id:
        return jsonify({"ok": False, "error": "channelId is required"}), 400

    ok, err = botmanager.join_channel_sync(str(channel_id))
    if not ok:
        return jsonify({"ok": False, "error": err}), 400

    return jsonify({"ok": True})


@app.post("/leave")
def leave_channel():
    ok, err = botmanager.leave_channel_sync()
    if not ok:
        return jsonify({"ok": False, "error": err}), 400

    return jsonify({"ok": True})


# ---------------- setup / configuration ----------------
@app.get("/config")
def get_config():
    cfg = cfgmodule.load()
    token = cfg["discord_token"]

    return jsonify({
        "configured": bool(token),
        "discordToken": token,
        "targetUserId": cfg["target_user_id"],
        "ttsVoice": cfg["tts_voice"],
        "ttsRate": cfg["tts_rate"],
        "inviteUrl": _invite_url(token) if token else None,
    })


@app.post("/config")
def update_config():
    data = request.get_json(silent=True) or {}
    old_cfg = cfgmodule.load()
    patch = {}

    if "discordToken" in data:
        patch["discord_token"] = str(data["discordToken"]).strip()
    if "targetUserId" in data:
        patch["target_user_id"] = str(data["targetUserId"]).strip()
    if "ttsVoice" in data:
        patch["tts_voice"] = str(data["ttsVoice"]).strip()
    if "ttsRate" in data:
        try:
            patch["tts_rate"] = max(-50, min(50, int(data["ttsRate"])))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "ttsRate must be an integer"}), 400

    new_cfg = cfgmodule.save(patch)

    with state.lock:
        if "tts_rate" in patch:
            state.rate = new_cfg["tts_rate"]

    token_changed = "discord_token" in patch and patch["discord_token"] != old_cfg["discord_token"]
    if token_changed:
        threading.Thread(
            target=botmanager.restart_bot, args=(patch["discord_token"],), daemon=True
        ).start()

    return jsonify({"ok": True, "restarting": token_changed})


def _invite_url(token: str):
    client_id = _client_id_from_token(token)
    if not client_id:
        return None
    return (
        "https://discord.com/api/oauth2/authorize"
        f"?client_id={client_id}&scope=bot&permissions={INVITE_PERMISSIONS}"
    )


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
    # authentication and controls a real Discord bot with its raw token.
    app.run(host="127.0.0.1", port=port)


if __name__ == "__main__":
    run()
