"""Owns the Discord client's lifecycle on a dedicated asyncio event loop
running in a background thread, so Flask (running on the main thread) can
start/stop/restart the bot and query it synchronously without blocking.
"""
import asyncio
import threading

import discord

import config as cfgmodule
import state
import tts

TTS_FILE = "tts.mp3"
BRIDGE_TIMEOUT = 15

_loop: asyncio.AbstractEventLoop | None = None
_client: discord.Client | None = None
_voice_client: discord.VoiceClient | None = None
_manager_lock = threading.Lock()


# ---------------- event loop plumbing ----------------
def start_loop_thread() -> asyncio.AbstractEventLoop:
    global _loop
    _loop = asyncio.new_event_loop()
    threading.Thread(target=_run_loop, args=(_loop,), daemon=True).start()
    return _loop


def _run_loop(loop: asyncio.AbstractEventLoop):
    asyncio.set_event_loop(loop)
    loop.run_forever()


def _call_sync(coro, timeout=BRIDGE_TIMEOUT):
    """Run a coroutine on the bot's loop from any other thread and block
    for the result. Returns (ok, value_or_error)."""
    if _loop is None:
        return False, "bot loop not running"
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    try:
        return True, future.result(timeout=timeout)
    except Exception as e:
        return False, str(e)


# ---------------- discord client ----------------
def _build_client() -> discord.Client:
    intents = discord.Intents.default()
    intents.voice_states = True
    intents.guilds = True
    intents.members = True

    # Explicitly bind to our dedicated background-thread loop — otherwise
    # discord.py grabs whatever loop is "current" on the calling (Flask)
    # thread at construction time, which breaks its internal futures.
    client = discord.Client(intents=intents, loop=_loop)

    @client.event
    async def on_ready():
        state.bot_ready = True
        state.bot_username = str(client.user)
        print("🤖 BOT READY:", client.user)
        client.loop.create_task(_queue_loop(client))

    @client.event
    async def on_voice_state_update(member: discord.Member, before, after):
        cfg = cfgmodule.load()
        target = str(cfg.get("target_user_id") or "").strip()

        if not target or str(member.id) != target:
            return

        if after.channel is not None:
            await _join(after.channel)
        elif before.channel is not None and after.channel is None:
            await _leave()

    return client


async def _join(channel: discord.VoiceChannel):
    global _voice_client
    try:
        if _voice_client and _voice_client.is_connected():
            await _voice_client.disconnect()

        _voice_client = await channel.connect()
        state.voice_connected = True
        state.voice_channel_id = str(channel.id)
        print("✅ JOINED:", channel.name)
    except Exception as e:
        print("JOIN ERROR:", e)
        raise


async def _leave():
    global _voice_client
    if _voice_client:
        await _voice_client.disconnect()

    _voice_client = None
    state.voice_connected = False
    state.voice_channel_id = None
    print("👋 LEFT")


async def _speak(text: str):
    if not _voice_client:
        print("❌ no voice, dropping:", text)
        return

    cfg = cfgmodule.load()
    with state.lock:
        rate = state.rate

    await tts.generate(text, file=TTS_FILE, voice=cfg.get("tts_voice"), rate=rate)

    while _voice_client.is_playing():
        await asyncio.sleep(0.1)

    _voice_client.play(discord.FFmpegPCMAudio(TTS_FILE))


async def _queue_loop(client: discord.Client):
    await client.wait_until_ready()

    while not client.is_closed():
        try:
            if _voice_client and not _voice_client.is_playing():
                with state.lock:
                    text = state.queue.pop(0) if state.queue else None

                if text:
                    print("🔊 SPEAK:", text)
                    await _speak(text)

        except Exception as e:
            print("LOOP ERROR:", e)

        await asyncio.sleep(0.5)


# ---------------- lifecycle (called from Flask thread) ----------------
def start_bot(token: str):
    global _client

    with _manager_lock:
        if not token:
            return

        _client = _build_client()
        asyncio.run_coroutine_threadsafe(_client.start(token), _loop)


def stop_bot():
    global _client

    with _manager_lock:
        state.bot_ready = False
        state.bot_username = ""
        state.voice_connected = False
        state.voice_channel_id = None

        if _client is not None:
            _call_sync(_client.close())

        _client = None


def restart_bot(token: str):
    stop_bot()
    start_bot(token)


# ---------------- Flask-facing bridge ----------------
def list_voice_channels() -> list[dict]:
    if _client is None or not state.bot_ready:
        return []

    channels = []
    for guild in _client.guilds:
        for ch in guild.voice_channels:
            channels.append({
                "id": str(ch.id),
                "name": ch.name,
                "guildId": str(guild.id),
                "guildName": guild.name,
            })
    return channels


def join_channel_sync(channel_id: str):
    if _client is None or not state.bot_ready:
        return False, "bot is not running"

    channel = _client.get_channel(int(channel_id))
    if channel is None or not isinstance(channel, discord.VoiceChannel):
        return False, "voice channel not found"

    ok, result = _call_sync(_join(channel))
    return (True, None) if ok else (False, result)


def leave_channel_sync():
    if _client is None:
        return False, "bot is not running"

    ok, result = _call_sync(_leave())
    return (True, None) if ok else (False, result)
