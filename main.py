import sys

# Windows consoles (and any redirected/piped output) often default to a
# non-UTF-8 codepage, which crashes on the emoji used in log messages.
# Force UTF-8 everywhere so the bot never dies on a print().
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import botmanager
import config as cfgmodule
import server
import state


def main():
    cfg = cfgmodule.load()
    state.rate = cfg["tts_rate"]

    botmanager.start_loop_thread()

    if cfg["discord_token"]:
        botmanager.start_bot(cfg["discord_token"])
    else:
        print("⚠️  Бот не настроен. Открой дашборд и заполни Settings → Discord Token.")

    print(f"🌐 API listening on http://127.0.0.1:{cfg['flask_port']}")
    server.run(cfg["flask_port"])


if __name__ == "__main__":
    main()
