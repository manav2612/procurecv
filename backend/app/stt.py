import io
import math
import os
from dataclasses import dataclass
from functools import lru_cache

from faster_whisper import WhisperModel

# Benchmarked tiny/base/small on this CPU (see PLAN.md's "known tradeoffs"):
# tiny/base are faster but frequently mis-script Hindi into Persian/Urdu-like
# gibberish; "small" reliably produces correct Devanagari, at the cost of a
# few seconds of lag per chunk (near-real-time, not sub-second). Since
# transcription correctness is the actual assignment requirement, "small" is
# the default — override via env var if deploying with a GPU or want lower
# latency instead.
WHISPER_MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")


@dataclass
class TranscribedSegment:
    text: str
    start_ts: float
    end_ts: float
    confidence: float


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    return WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")


def transcribe_chunk(audio_bytes: bytes, language_hint: str | None = None) -> list[TranscribedSegment]:
    """Transcribe one self-contained audio chunk (e.g. a WAV/WebM blob).

    `language_hint` forces decoding to a single language (e.g. "hi") when the
    session specifies one; otherwise Whisper auto-detects per chunk, which is
    more flexible for Hindi/English code-switching but less stable across
    chunk boundaries.
    """
    model = get_model()
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
