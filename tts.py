import edge_tts

VOICE = "uk-UA-OstapNeural"


async def generate(text: str, file: str = "tts.mp3", voice: str = VOICE, rate: int = 0) -> str:
    rate_str = f"{rate:+d}%"
    tts = edge_tts.Communicate(text, voice, rate=rate_str)
    await tts.save(file)
    return file
