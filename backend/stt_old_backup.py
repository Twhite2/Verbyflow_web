"""
Speech-to-Text module using Faster-Whisper
Provides 4x faster transcription with built-in VAD
"""

import base64
import logging
import numpy as np
from typing import Optional
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Global model instance (loaded once)
_whisper_model: Optional[WhisperModel] = None


def load_whisper_model(model_size: str = "base"):
    """
    Load Faster-Whisper model into memory with GPU support

    Args:
        model_size: One of 'tiny', 'base', 'small', 'medium', 'large'
    """
    global _whisper_model

    if _whisper_model is None:
        logger.info(f"Loading Faster-Whisper model: {model_size}")

        try:
            # Check if CUDA is available
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"

            if device == "cuda":
                # Use int8 quantization for 4x less VRAM, same accuracy
                compute_type = "int8_float16"
                logger.info(f"Using GPU with int8 quantization")
            else:
                compute_type = "int8"
                logger.info(f"Using CPU with int8")

            _whisper_model = WhisperModel(
                model_size,
                device=device,
                compute_type=compute_type,
                num_workers=4  # Parallel processing
            )

            logger.info(f"Faster-Whisper model loaded on {device} with {compute_type}")
        except Exception as e:
            logger.error(f"Failed to load Faster-Whisper model: {e}")
            raise

    return _whisper_model


async def process_audio_to_text(audio_base64: str, language: Optional[str] = None) -> str:
    """
    Convert audio to text using Faster-Whisper with built-in VAD

    Args:
        audio_base64: Base64 encoded audio data (raw 16-bit PCM at 16kHz)
        language: Optional language hint (e.g., 'en', 'es', 'fr')

    Returns:
        Transcribed text (empty if no speech detected)
    """
    try:
        # Load model if not already loaded
        model = load_whisper_model()

        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)

        # Check if audio is too small (less than 0.5 seconds at 16kHz)
        if len(audio_bytes) < 16000:  # 16000 samples/sec * 2 bytes/sample * 0.5 sec
            return ""

        # Convert bytes to numpy array (16-bit PCM)
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)

        # Normalize to float32 between -1 and 1
        audio_float = audio_array.astype(np.float32) / 32768.0

        # Transcribe with Faster-Whisper's built-in VAD
        # This automatically filters silence and prevents hallucinations!
        segments, info = model.transcribe(
            audio_float,
            language=language,
            vad_filter=True,  # KEY: Built-in VAD filters silence automatically!
            vad_parameters=dict(
                min_silence_duration_ms=300,  # Filter silence longer than 300ms (stricter)
                speech_pad_ms=200,  # Less padding (tighter detection)
                threshold=0.6  # Higher threshold = stricter (was 0.5)
            ),
            condition_on_previous_text=False,  # Reduce hallucinations
            temperature=0.0,  # More deterministic
            beam_size=1,  # Faster for real-time (greedy decoding)
            best_of=1,  # Faster
            compression_ratio_threshold=2.4,  # Filter repetitive text
            log_prob_threshold=-1.0,  # Filter low-confidence
            no_speech_threshold=0.7  # STRICTER silence detection (was 0.6)
        )

        # Combine all segments into text
        # segments is a generator, so we iterate and collect
        transcribed_segments = []
        for segment in segments:
            text = segment.text.strip()
            if text:
                transcribed_segments.append(text)

        transcribed_text = " ".join(transcribed_segments).strip()

        # Additional filter: Check for repetitive hallucinations
        if transcribed_text:
            words = transcribed_text.lower().split()
            if len(words) > 3:
                # Check for excessive repetition
                unique_ratio = len(set(words)) / len(words)
                if unique_ratio < 0.5:  # More than 50% repeated words
                    logger.debug(f"Detected repetitive text (hallucination), skipping: '{transcribed_text}'")
                    return ""

        # Log and return
        if transcribed_text:
            logger.info(f"Transcribed: '{transcribed_text}' (lang: {info.language}, duration: {info.duration:.1f}s)")
            return transcribed_text
        else:
            logger.debug(f"No speech detected in audio")
            return ""

    except Exception as e:
        logger.error(f"STT Error: {e}")
        return ""


def transcribe_file(audio_path: str, language: Optional[str] = None) -> list:
    """
    Transcribe an audio file (for testing)

    Args:
        audio_path: Path to audio file
        language: Optional language code

    Returns:
        List of transcribed segments
    """
    model = load_whisper_model()
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True
    )
    return list(segments)
