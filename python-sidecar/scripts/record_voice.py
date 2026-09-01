#!/usr/bin/env python3
"""Record a voice sample off the running sidecar's /ws/audio stream.

Captures exactly what the pipeline hears — same mic, same gain, same room — so
transcription settings can be tuned against real speech offline instead of
guessing from synthetic audio.

  python scripts/record_voice.py [seconds] [outfile]

Then transcribe the result with different models/settings:
  python scripts/accuracy_eval.py  (or the ad-hoc benchmarks in scripts/)
"""

from __future__ import annotations

import asyncio
import sys
import wave

try:
    import websockets
except ImportError:  # pragma: no cover
    sys.exit("pip install websockets")

WS_URL = "ws://127.0.0.1:8000/ws/audio"


async def record(seconds: float, out: str) -> None:
    pcm = bytearray()
    print(f"Connecting to {WS_URL} ...")
    async with websockets.connect(WS_URL, max_size=None) as ws:
        loop = asyncio.get_running_loop()
        end = loop.time() + seconds
        print(f"\n>>> SPEAK NOW — recording {seconds:.0f}s <<<\n")
        last_report = 0.0
        while loop.time() < end:
            remaining = end - loop.time()
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=max(0.1, remaining))
            except asyncio.TimeoutError:
                break
            if isinstance(msg, bytes):
                pcm.extend(msg)
                elapsed = seconds - remaining
                if elapsed - last_report >= 1.0:
                    last_report = elapsed
                    print(f"  {elapsed:4.0f}s / {seconds:.0f}s", end="\r", flush=True)

    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(bytes(pcm))
    print(f"\n\nSaved {len(pcm) / 32000:.1f}s to {out}")


if __name__ == "__main__":
    secs = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0
    path = sys.argv[2] if len(sys.argv) > 2 else "voice_sample.wav"
    asyncio.run(record(secs, path))
