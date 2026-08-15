import io
import math
import os
import threading
from dataclasses import dataclass
from functools import lru_cache

from faster_whisper import WhisperModel

# Benchmarked tiny/base/small on CPU (see PLAN.md's "known tradeoffs"):
# tiny/base are faster but frequently mis-script Hindi into Persian/Urdu-like
# gibberish; "small" reliably produces correct Devanagari. Bumped to
# "medium" for better accuracy given real RAM is available (self-hosted
# deploy, 16GB+) -- this is the single default used everywhere (no per-host
# override anywhere in this repo), so hosts without enough RAM/CPU for
# "medium" (e.g. Render's free tier) will be slow or fail to load it. That's
# an accepted, documented tradeoff of those hosts now -- see README.md's
# "Hosting decision, honestly" -- not something routed around with a
# quieter, smaller model substituted only there.
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "medium")


@dataclass
class TranscribedSegment:
    text: str
    start_ts: float
    end_ts: float
    confidence: float


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    return WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


# There's exactly one WhisperModel instance for the whole process (see
# get_model() above), and ctranslate2 isn't designed for concurrent calls
# into the same model — running two CPU-bound transcriptions at once doesn't
# parallelize usefully, it just makes both slower via contention. Every
# WebSocket connection calls transcribe_chunk() from its own thread (via
# asyncio.to_thread), so without this lock, two sessions transcribing at the
# same time (multiple tabs, or a leaked/orphaned connection from a client
# bug) would visibly slow each other down instead of one simply finishing
# before the other starts. Chunks now just queue up and process one at a
# time, server-wide — slower under load, but predictable instead of thrashing.
_inference_lock = threading.Lock()


def transcribe_chunk(audio_bytes: bytes, language_hint: str | None = None) -> list[TranscribedSegment]:
    """Transcribe one self-contained audio chunk (e.g. a WAV/WebM blob).

    `language_hint` forces decoding to a single language (e.g. "hi") when the
    session specifies one; otherwise Whisper auto-detects per chunk, which is
    more flexible for Hindi/English code-switching but less stable across
    chunk boundaries.
    """
    model = get_model()
    with _inference_lock:
        # faster-whisper's `segments` is a lazy generator — the actual
        # decode work happens while iterating it below, so that has to stay
        # inside the lock too, not just the transcribe() call itself.
        segments, _info = model.transcribe(
            io.BytesIO(audio_bytes),
            language=language_hint,
            beam_size=1,
            vad_filter=True,
        )

        results = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            # avg_logprob is a log-probability (<= 0); exp() maps it to a rough
            # 0-1 confidence proxy. This is an approximation, not a calibrated score.
            confidence = max(0.0, min(1.0, math.exp(segment.avg_logprob)))
            results.append(
                TranscribedSegment(
                    text=text,
                    start_ts=segment.start,
                    end_ts=segment.end,
                    confidence=confidence,
                )
            )
    return results
