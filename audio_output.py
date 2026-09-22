"""Windows endpoint discovery and playback. Never fall back to another endpoint."""
import asyncio
from contextlib import contextmanager
import ctypes
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time

import numpy as np
import soundcard as sc
from soundcard import mediafoundation as wasapi


@contextmanager
def audio_context():
    # COM initialization is per-thread (Flask and playback use different threads).
    ole32 = ctypes.OleDLL("ole32")
    result = ole32.CoInitializeEx(None, 0)
    if result not in (0, 1, -2147417850):  # S_OK, S_FALSE, already STA
        raise RuntimeError(f"Windows audio initialization failed: {result}")
    try:
        yield
    finally:
        if result in (0, 1):
            ole32.CoUninitialize()


def list_devices():
    with audio_context():
        return [{"id": s.id, "name": s.name} for s in sc.all_speakers()]


def resolve_device(device_id):
    if not device_id:
        raise RuntimeError("Choose an Output Device before speaking.")
    # get_speaker also accepts fuzzy names. Exact endpoint IDs prevent a
    # removed cable from ever redirecting speech to the default speakers.
    for speaker in sc.all_speakers():
        if speaker.id == device_id:
            return speaker
    raise RuntimeError("Selected Output Device is unavailable. Reconnect it or choose another device.")


def validate_device(device_id):
    with audio_context():
        return resolve_device(device_id).name


def _ffmpeg_executable():
    local = Path(__file__).resolve().parent / "ffmpeg.exe"
    executable = str(local) if local.exists() else shutil.which("ffmpeg")
    if not executable:
        raise RuntimeError("FFmpeg was not found. Put ffmpeg.exe beside main.py or add it to PATH.")
    return executable


def decode_mp3(path):
    executable = _ffmpeg_executable()
    result = subprocess.run(
        [executable, "-nostdin", "-v", "error",
         "-f", "mp3", "-analyzeduration", "0", "-probesize", "32", "-i", str(path),
         "-f", "f32le", "-ar", "48000", "-ac", "1", "pipe:1"],
        capture_output=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW,
    )
    if result.returncode:
        raise RuntimeError("Audio decoding failed: " + result.stderr.decode("utf-8", errors="replace")[:300])
    samples = np.frombuffer(result.stdout, dtype="<f4")
    if not samples.size:
        raise RuntimeError("Edge TTS returned empty audio.")
    return samples


def _write_pcm(player, samples, stop_event):
    # SoundCard 0.4.6 play() releases the entire available buffer even when
    # the final slice is shorter. Limit GetBuffer/ReleaseBuffer to the actual
    # frame count to avoid an uninitialized tail. Keep this adapter isolated
    # against the pinned WASAPI implementation.
    channels = len(player.channelmap)
    data = np.repeat(samples[:, None], channels, axis=1).astype(np.float32)
    offset = 0
    deadline = time.monotonic() + 2
    while offset < len(data):
        if stop_event.is_set():
            return
        available = player._render_available_frames()
        if available <= 0:
            if time.monotonic() > deadline:
                raise RuntimeError("Output Device stopped responding during playback.")
            stop_event.wait(0.001)
            continue
        count = min(available, len(data) - offset)
        chunk = data[offset:offset + count].tobytes()
        buffer = player._render_buffer(count)
        wasapi._ffi.memmove(buffer[0], chunk, len(chunk))
        player._render_release(count)
        offset += count
        deadline = time.monotonic() + 2


@contextmanager
def _player(speaker):
    player = speaker.player(samplerate=48000, channels=min(2, speaker.channels), blocksize=960)
    try:
        with player:
            yield player
    finally:
        # SoundCard's __exit__ can raise on Stop() after unplugging a device.
        # Release both COM interfaces even in that case (release is idempotent).
        if hasattr(player, '_ppRenderClient'):
            wasapi._com.release(player._ppRenderClient)
        wasapi._com.release(player._ptr)


def play(path, device_id, stop_event, on_started=lambda: None):
    samples = decode_mp3(path)
    if stop_event.is_set():
        return
    with audio_context():
        speaker = resolve_device(device_id)
        with _player(speaker) as player:
            on_started()
            for offset in range(0, len(samples), 4800):
                if stop_event.is_set():
                    return
                _write_pcm(player, samples[offset:offset + 4800], stop_event)
            # play() returns with audio still buffered. Drain the final syllable.
            deadline = time.monotonic() + 2
            while player.currentpadding:
                if stop_event.wait(0.005):
                    return
                if time.monotonic() > deadline:
                    raise RuntimeError("Output Device stopped responding during playback.")


_STREAM_CHUNK_BYTES = 4800 * 4  # 4800 float32 frames, matching the WASAPI write block size


def play_stream(fetch_audio, device_id, stop_event, on_started=lambda: None):
    """Decode and play audio as it arrives, instead of waiting for the whole
    clip. fetch_audio(write) must call write(mp3_bytes) for each chunk as it
    becomes available and return once the source is exhausted (or stopped).
    Runs entirely on its own threads; this call blocks until playback ends."""
    executable = _ffmpeg_executable()
    proc = subprocess.Popen(
        [executable, "-nostdin", "-v", "error",
         "-f", "mp3", "-analyzeduration", "0", "-probesize", "32", "-i", "pipe:0",
         "-f", "f32le", "-ar", "48000", "-ac", "1", "pipe:1"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    feed_errors = []
    stderr_chunks = []
    pcm_queue = queue.Queue(maxsize=32)

    def feed():
        try:
            def write(chunk):
                if not stop_event.is_set():
                    proc.stdin.write(chunk)
            fetch_audio(write)
        except asyncio.CancelledError:
            pass
        except (BrokenPipeError, OSError):
            pass
        except Exception as exc:
            feed_errors.append(exc)
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass

    def pump_stdout():
        try:
            while True:
                data = proc.stdout.read(_STREAM_CHUNK_BYTES)
                if not data:
                    return
                pcm_queue.put(data)
        finally:
            pcm_queue.put(None)

    def pump_stderr():
        try:
            stderr_chunks.append(proc.stderr.read())
        except Exception:
            pass

    threads = [threading.Thread(target=fn, daemon=True) for fn in (feed, pump_stdout, pump_stderr)]
    for thread in threads:
        thread.start()

    started = False
    leftover = b""
    try:
        with audio_context():
            speaker = resolve_device(device_id)
            with _player(speaker) as player:
                while True:
                    if stop_event.is_set():
                        break
                    try:
                        item = pcm_queue.get(timeout=0.1)
                    except queue.Empty:
                        continue
                    if item is None:
                        break
                    leftover += item
                    usable = len(leftover) - (len(leftover) % 4)
                    if usable == 0:
                        continue
                    block, leftover = leftover[:usable], leftover[usable:]
                    samples = np.frombuffer(block, dtype="<f4")
                    if not started:
                        started = True
                        on_started()
                    for offset in range(0, len(samples), 4800):
                        if stop_event.is_set():
                            break
                        _write_pcm(player, samples[offset:offset + 4800], stop_event)
                if started and not stop_event.is_set():
                    # The device returns with audio still buffered. Drain the final syllable.
                    deadline = time.monotonic() + 2
                    while player.currentpadding:
                        if stop_event.wait(0.005):
                            break
                        if time.monotonic() > deadline:
                            raise RuntimeError("Output Device stopped responding during playback.")
    finally:
        try:
            proc.stdin.close()
        except OSError:
            pass
        for thread in threads:
            thread.join(timeout=5)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    if feed_errors and not stop_event.is_set():
        raise feed_errors[0]
    if proc.returncode and not stop_event.is_set():
        raise RuntimeError("Audio decoding failed: " +
                            b"".join(stderr_chunks).decode("utf-8", errors="replace")[:300])
    if not started and not stop_event.is_set():
        raise RuntimeError("Edge TTS returned empty audio.")
