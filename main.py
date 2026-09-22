import sys

# Windows consoles (and any redirected/piped output) often default to a
# non-UTF-8 codepage, which crashes on the emoji used in log messages.
# Force UTF-8 everywhere so logging never fails on device names.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import audiomanager
import config as cfgmodule
import server
import state


def main():
    cfg = cfgmodule.load()
    state.rate = cfg["tts_rate"]

    audiomanager.start()
    print(f"🌐 API listening on http://127.0.0.1:{cfg['flask_port']}")
    try:
        server.run(cfg["flask_port"])
    finally:
        audiomanager.stop()


if __name__ == "__main__":
    main()
