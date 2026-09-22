"""Explicit output routing; an unavailable backend never falls back."""
import threading

import audio_output
import soundpad_output

SOUNDPAD_ID = "soundpad:microphone"


def list_devices():
    devices = audio_output.list_devices()
    try:
        soundpad_output.validate()
        available = True
    except RuntimeError:
        available = False
    return [{"id": SOUNDPAD_ID, "name": "Soundpad — Microphone",
             "available": available, "kind": "soundpad"}] + devices


def validate_device(device_id):
    if device_id == SOUNDPAD_ID:
        return soundpad_output.validate()
    return audio_output.validate_device(device_id)


def validate_monitor(device_id):
    if not device_id or device_id == SOUNDPAD_ID:
        raise RuntimeError("Choose a Local Monitor Device before speaking.")
    return audio_output.validate_device(device_id)


class _CombinedStop:
    def __init__(self, upstream):
        self.upstream = upstream
        self.local = threading.Event()

    def is_set(self):
        return self.local.is_set() or self.upstream.is_set()

    def wait(self, timeout=None):
        if self.is_set():
            return True
        return self.local.wait(timeout) or self.upstream.is_set()

    def set(self):
        self.local.set()


def _play_soundpad_with_monitor(path, stop_event, on_started, monitor_device_id):
    validate_monitor(monitor_device_id)
    combined = _CombinedStop(stop_event)
    errors = []
    started_lock = threading.Lock()
    started = False

    def mark_started():
        nonlocal started
        with started_lock:
            if not started:
                started = True
                on_started()

    def run(label, target):
        try:
            target()
        except Exception as exc:
            errors.append((label, exc))
            combined.set()

    tasks = [
        ("Soundpad microphone", lambda: soundpad_output.play(path, combined, mark_started)),
        ("Local monitor", lambda: audio_output.play(path, monitor_device_id, combined, mark_started)),
    ]
    threads = [threading.Thread(target=run, args=task, daemon=True) for task in tasks]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    if errors and not stop_event.is_set():
        label, error = errors[0]
        raise RuntimeError(f"{label} failed: {error}") from error


def play(path, device_id, stop_event, on_started=lambda: None,
         monitor_enabled=False, monitor_device_id=""):
    if device_id == SOUNDPAD_ID:
        if monitor_enabled:
            return _play_soundpad_with_monitor(path, stop_event, on_started, monitor_device_id)
        return soundpad_output.play(path, stop_event, on_started)
    return audio_output.play(path, device_id, stop_event, on_started)
