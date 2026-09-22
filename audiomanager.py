"""Single FIFO worker for the existing Edge TTS generator and Windows output."""
import asyncio
from pathlib import Path
import tempfile
import threading

import audio_output
import playback_output
import config as cfgmodule
import state
import tts

_thread = None
_stop = threading.Event()
_lifecycle_lock = threading.Lock()
_generation_loop = None
_generation_task = None


def enqueue(text):
    cfg = cfgmodule.load()
    playback_output.validate_device(cfg["output_device_id"])
    if cfg["output_device_id"] == playback_output.SOUNDPAD_ID and cfg["monitor_enabled"]:
        playback_output.validate_monitor(cfg["monitor_device_id"])
    with state.changed:
        if not state.engine_ready:
            raise RuntimeError("Audio engine is not running.")
        # Routing/settings are captured per message, including queued messages.
        state.queue.append({"text": text, "device_id": cfg["output_device_id"],
                            "voice": cfg["tts_voice"], "rate": state.rate,
                            "monitor_enabled": cfg["monitor_enabled"],
                            "monitor_device_id": cfg["monitor_device_id"]})
        state.last_message = text
        state.changed.notify()


async def _generate(job, path):
    global _generation_loop, _generation_task
    with _lifecycle_lock:
        _generation_loop = asyncio.get_running_loop()
        _generation_task = asyncio.current_task()
    try:
        if not _stop.is_set():
            await asyncio.wait_for(tts.generate(job["text"], file=str(path),
                                               voice=job["voice"], rate=job["rate"]), 60)
    finally:
        with _lifecycle_lock:
            _generation_loop = _generation_task = None


def _playing():
    with state.lock:
        state.playback_status = "playing"


def _stream_and_play(job):
    def fetch_audio(write):
        async def run():
            global _generation_loop, _generation_task
            with _lifecycle_lock:
                _generation_loop = asyncio.get_running_loop()
                _generation_task = asyncio.current_task()
            try:
                async for chunk in tts.stream(job["text"], voice=job["voice"], rate=job["rate"]):
                    write(chunk)
            finally:
                with _lifecycle_lock:
                    _generation_loop = _generation_task = None

        asyncio.run(run())

    audio_output.play_stream(fetch_audio, job["device_id"], _stop, _playing)


def _worker():
    try:
        while True:
            with state.changed:
                state.changed.wait_for(lambda: state.queue or _stop.is_set())
                if _stop.is_set():
                    return
                job = state.queue.pop(0)
                state.playback_status = "generating"
                state.active_device_id = job["device_id"]
            try:
                playback_output.validate_device(job["device_id"])
                if job["device_id"] == playback_output.SOUNDPAD_ID:
                    # Soundpad is an external app driven through a named pipe —
                    # it can only be told to play a complete file, so it keeps
                    # the old generate-to-file-then-play flow.
                    with tempfile.TemporaryDirectory(prefix="shyesvoice-") as folder:
                        path = Path(folder) / "tts.mp3"
                        asyncio.run(_generate(job, path))
                        if _stop.is_set():
                            return
                        playback_output.play(path, job["device_id"], _stop, _playing,
                                             job["monitor_enabled"], job["monitor_device_id"])
                else:
                    _stream_and_play(job)
                with state.lock:
                    if not _stop.is_set():
                        state.completed_count += 1
                        state.last_error = ""
            except asyncio.CancelledError:
                if not _stop.is_set():
                    raise
            except Exception as exc:
                with state.lock:
                    state.last_error = str(exc) or type(exc).__name__
                    state.error_id += 1
                print("TTS ERROR:", state.last_error)
            finally:
                with state.lock:
                    state.playback_status = "idle"
                    state.active_device_id = ""
    finally:
        with state.lock:
            state.engine_ready = False


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    with state.lock:
        state.engine_ready = True
    _thread = threading.Thread(target=_worker, name="tts-output", daemon=True)
    _thread.start()


def stop():
    _stop.set()
    with state.changed:
        state.queue.clear()
        state.changed.notify_all()
    with _lifecycle_lock:
        if _generation_loop and _generation_task:
            _generation_loop.call_soon_threadsafe(_generation_task.cancel)
    if _thread:
        _thread.join(timeout=35)
