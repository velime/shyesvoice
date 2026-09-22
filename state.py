import threading

lock = threading.RLock()
changed = threading.Condition(lock)

queue: list[dict] = []
last_message: str = ""
rate: int = 0

engine_ready = False
playback_status = "idle"
active_device_id = ""
last_error = ""
error_id = 0
completed_count = 0
