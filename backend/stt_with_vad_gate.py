"""
Speech-to-Text module using Faster-Whisper with VAD Gate
Implements "soft pause" - model stays loaded, only transcribes when speech detected
Eliminates hallucinations during silence
"""

import base64
import logging
import numpy as np
import time
from typing import Optional
from faster_whisper import WhisperModel
from vad_gate import VADGate, HallucinationFilter

logger = logging.getLogger(__name__)

# Global model instance (loaded once - SOFT PAUSE mode)
_whisper_model: Optional[WhisperModel] = None

# Global VAD gate instance
_vad_gate: Optional[VADGate] = None

# Track last context reset
_last_context_reset_time = 0


def load_whisper_model(model_size: str = "base"):
    """
    Load Faster-Whisper model into memory with GPU support.
    Model stays loaded (soft pause) for zero reload latency.
    
    Args:
        model_size: One of 'tiny', 'base', 'small', 'medium', 'large'
    """
    global _whisper_model, _vad_gate

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
            logger.info("🚀 Model stays loaded (SOFT PAUSE mode) - zero reload latency!")
        except Exception as e:
            logger.error(f"Failed to load Faster-Whisper model: {e}")
            raise

    # Initialize VAD gate if not already done
    if _vad_gate is None:
        _vad_gate = VADGate(
            silence_threshold=0.01,  # RMS threshold
            min_speech_duration_ms=300,  # Skip very short speech
            max_pause_duration_ms=1500,  # Natural pause tolerance (1.5s)
            trailing_silence_ms=500,  # Keep 0.5s audio before speech
            prolonged_silence_threshold_ms=8000,  # Reset context after 8s
            token_confidence_threshold=0.4  # Filter low confidence tokens
        )
        logger.info("✅ VAD Gate initialized with soft pause")

    return _whisper_model


async def process_audio_to_text(audio_base64: str, language: Optional[str] = None) -> str:
    """
    Convert audio to text using VAD-gated Faster-Whisper with soft pause.
    Only transcribes when VAD detects complete speech segment.
    
    Args:
        audio_base64: Base64 encoded audio data (raw 16-bit PCM at 16kHz)
        language: Optional language hint (e.g., 'en', 'es', 'fr')
        
    Returns:
        Transcribed text (empty if no speech detected or still speaking)
    """
    global _vad_gate, _whisper_model, _last_context_reset_time
    
    try:
        # Load model and VAD gate if not already loaded
        model = load_whisper_model()
        
        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)
        
        # Check if audio is too small
        if len(audio_bytes) < 16000:  # Less than 0.5s at 16kHz
            return ""
        
        # Convert bytes to numpy array (16-bit PCM)
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # Normalize to float32 between -1 and 1
        audio_float = audio_array.astype(np.float32) / 32768.0
        
        # Pass through VAD gate - this is the KEY to preventing hallucinations!
        current_time_ms = int(time.time() * 1000)
        audio_to_transcribe, state = _vad_gate.process_chunk(audio_float, current_time_ms)
        
        # Only transcribe when speech segment ends (soft pause gate)
        if state == "speech_ended" and audio_to_transcribe is not None:
            logger.debug(f"📤 Transcribing speech segment ({len(audio_to_transcribe)} samples)")
            
            # Check if context reset is needed (prolonged silence > 8s)
            needs_reset = _vad_gate.should_reset_context()
            
            # Transcribe with Faster-Whisper (model stays loaded!)
            segments, info = model.transcribe(
                audio_to_transcribe,
                language=language,
                vad_filter=True,  # Additional backend VAD layer (defense in depth)
                vad_parameters=dict(
                    min_silence_duration_ms=300,
                    speech_pad_ms=200,
                    threshold=0.6
                ),
                condition_on_previous_text=(not needs_reset),  # Reset if prolonged silence
                temperature=0.0,  # Deterministic
                beam_size=1,  # Fast greedy decoding
                best_of=1,
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
                no_speech_threshold=0.7,
                initial_prompt=None if needs_reset else ""  # Clear context if needed
            )
            
            # Filter low-confidence segments (token confidence threshold)
            segments_list = list(segments)
            filtered_segments = _vad_gate.filter_low_confidence_tokens(segments_list)
            
            # Combine segments into text
            transcribed_segments = []
            for segment in filtered_segments:
                text = segment.text.strip()
                if text:
                    transcribed_segments.append(text)
            
            transcribed_text = " ".join(transcribed_segments).strip()
            
            # Post-processing filters
            if transcribed_text:
                # Check for repetition (hallucination indicator)
                if _vad_gate.detect_repetition(transcribed_text):
                    logger.debug(f"🚫 Filtered repetitive text: '{transcribed_text}'")
                    return ""
                
                # Check for known hallucination patterns
                if HallucinationFilter.is_hallucination(transcribed_text):
                    logger.debug(f"🚫 Filtered hallucination pattern: '{transcribed_text}'")
                    return ""
                
                # Clean text (normalize whitespace, etc.)
                transcribed_text = HallucinationFilter.clean_text(transcribed_text)
                
                # Reset context flag if used
                if needs_reset:
                    _last_context_reset_time = current_time_ms
                    logger.debug("♻️ Context reset after prolonged silence")
                
                logger.info(f"✅ Transcribed: '{transcribed_text}' (lang: {info.language}, "
                          f"duration: {info.duration:.1f}s)")
                return transcribed_text
            else:
                logger.debug(f"No valid transcription from speech segment")
                return ""
        
        elif state == "speech_started":
            logger.debug("🎤 Speech started, accumulating...")
            return ""
        
        elif state == "speaking":
            # Still speaking, don't transcribe yet (waiting for pause)
            return ""
        
        else:  # silence
            # Pure silence, don't process at all
            # This is what prevents hallucinations!
            return ""
        
    except Exception as e:
        logger.error(f"STT Error: {e}", exc_info=True)
        return ""


def reset_vad_gate():
    """
    Reset VAD gate state (call when user disconnects or starts new session)
    """
    global _vad_gate
    if _vad_gate:
        _vad_gate.reset()
        logger.info("VAD gate reset")


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
