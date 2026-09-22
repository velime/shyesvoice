import edge_tts

VOICE = "uk-UA-OstapNeural"


async def generate(text: str, file: str = "tts.mp3", voice: str = VOICE, rate: int = 0) -> str:
    rate_str = f"{rate:+d}%"
    tts = edge_tts.Communicate(text, voice, rate=rate_str)
    await tts.save(file)
    return file


async def stream(text: str, voice: str = VOICE, rate: int = 0):
    rate_str = f"{rate:+d}%"
    communicate = edge_tts.Communicate(text, voice, rate=rate_str)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
