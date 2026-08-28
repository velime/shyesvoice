import threading

lock = threading.Lock()

queue: list[str] = []
last_message: str = ""
rate: int = 0

bot_ready: bool = False
bot_username: str = ""
voice_connected: bool = False
voice_channel_id: str | None = None
