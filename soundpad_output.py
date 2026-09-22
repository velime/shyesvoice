"""Soundpad's documented local remote-control API, microphone-only playback."""
from pathlib import Path
import os
import threading
import time
import wave
import xml.etree.ElementTree as ET

import numpy as np
import pywintypes
import win32file
import win32pipe

import audio_output

PIPE = r"\\.\pipe\sp_remote_control"
SLOT = Path(__file__).resolve().parent / "data" / "soundpad" / "shyesvoice-live-tts.wav"
_request_lock = threading.Lock()
_play_lock = threading.Lock()


def request(command, timeout=2):
    """One bounded request per connection; no shell or executable required."""
    with _request_lock:
        handle = None
        try:
            win32pipe.WaitNamedPipe(PIPE, int(timeout * 1000))
            handle = win32file.CreateFile(PIPE, 0xC0000000, 0, None, 3, 0, None)
            win32file.WriteFile(handle, command.encode("utf-8"))
            deadline = time.monotonic() + timeout
            while True:
                available = win32pipe.PeekNamedPipe(handle, 0)[1]
                if available:
                    if available > 8 * 1024 * 1024:
                        raise RuntimeError("Soundpad response is too large.")
                    return win32file.ReadFile(handle, available)[1].decode("utf-8").strip()
                if time.monotonic() >= deadline:
                    raise RuntimeError("Soundpad is not responding. Close its dialogs and try again.")
                time.sleep(0.01)
        except pywintypes.error as exc:
            raise RuntimeError("Cannot connect to Soundpad. Start Soundpad and try again.") from exc
        finally:
            if handle is not None:
                handle.Close()
            # Soundpad documents that requests within the same millisecond
            # can break its pipe; serialize and space out all callers.
            time.sleep(0.002)


def _ok(command):
    response = request(command)
    if not response.startswith("R-200"):
        detail = " Adding TTS sounds requires the full version of Soundpad." if command.startswith('DoAddSound(') else ""
        raise RuntimeError(f"Soundpad rejected {command.split('(')[0]}: {response}.{detail}")


def validate():
    _ok("IsAlive()")
    return "Microphone via Soundpad"


def _write_wave(samples):
    SLOT.parent.mkdir(parents=True, exist_ok=True)
    temporary = SLOT.with_suffix('.tmp.wav')
    try:
        with wave.open(str(temporary), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(48000)
            output.writeframes((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
        os.replace(temporary, SLOT)
    finally:
        temporary.unlink(missing_ok=True)


def _find_slot():
    response = request("GetSoundlist()")
    try:
        root = ET.fromstring(response)
    except ET.ParseError as exc:
        raise RuntimeError("Soundpad did not return its sound list.") from exc
    for sound in root.iter("Sound"):
        # Remote-control XML escapes each backslash twice (including old 1.0).
        url = sound.get("url", "").replace("\\\\", "\\")
        if os.path.normcase(os.path.normpath(str(SLOT))) == os.path.normcase(os.path.normpath(url)):
            return int(sound.attrib["index"])
    return None


def _own_playback():
    return SLOT.stem.casefold() in request("GetTitleText()").casefold()


def play(path, stop_event, on_started=lambda: None):
    validate()
    samples = audio_output.decode_mp3(path)
    with _play_lock:
        # Do not interrupt another sound currently being played in Soundpad.
        deadline = time.monotonic() + 30
        while request("GetPlayStatus()") in ("PLAYING", "SEEKING"):
            if stop_event.wait(.05):
                return
            if time.monotonic() > deadline:
                raise RuntimeError("Soundpad is busy playing another sound. Stop it, then press Repeat.")
        if stop_event.is_set():
            return
        _write_wave(samples)
        started = False
        try:
            index = _find_slot()
            if index is None:
                # One dedicated entry only; never select/remove user entries.
                _ok(f'DoAddSound("{SLOT}")')
                index = _find_slot()
            if index is None:
                raise RuntimeError("Soundpad could not add the TTS playback entry.")
            _ok(f"DoPlaySound({index},false,true)")
            started = True
            on_started()
            deadline = time.monotonic() + len(samples) / 48000 + 10
            while True:
                status = request("GetPlayStatus()")
                if status == "STOPPED":
                    break
                if status not in ("PLAYING", "PAUSED", "SEEKING"):
                    raise RuntimeError(f"Unexpected Soundpad playback status: {status}")
                if not _own_playback():
                    # The file can finish between the two API calls.
                    if request("GetPlayStatus()") == "STOPPED":
                        break
                    raise RuntimeError("TTS playback was replaced by another sound in Soundpad.")
                if stop_event.wait(.05):
                    break
                if time.monotonic() > deadline:
                    raise RuntimeError("Soundpad playback timed out. Disable repeat/continuous playback in Soundpad.")
        finally:
            if started:
                try:
                    if _own_playback() and request("GetPlayStatus()") != "STOPPED":
                        _ok("DoStopSound()")
                except RuntimeError:
                    pass
            # Keep the dedicated list entry valid, but erase the speech itself.
            # No accumulating files or modifications to the user's sound list.
            _write_wave(np.zeros(960, dtype=np.float32))
