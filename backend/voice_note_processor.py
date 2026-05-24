"""
Voice Note Processing - Transcription and Translation
Handles voice note STT using Whisper for transcription only.
No voice cloning - TTS uses predefined voices selected by language and gender.
"""

import base64
import logging
import numpy as np
import io
from typing import Optional, Tuple
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Global Whisper model for voice notes
_whisper_model: Optional[WhisperModel] = None


def load_whisper_for_voice_notes():
    """Load Whisper model specifically for voice note transcription"""
    global _whisper_model
    
    if _whisper_model is None:
        logger.info("Loading Whisper model for voice note processing")
        try:
            # CRITICAL: Use CPU to avoid OOM (real-time audio already uses GPU)
            # Voice notes are async, so slight CPU slowdown is acceptable
            device = "cpu"
            compute_type = "int8"
            
            _whisper_model = WhisperModel(
                "base",
                device=device,
                compute_type=compute_type,
                num_workers=2  # Reduced for CPU efficiency
            )
            logger.info(f"Whisper loaded on {device} for voice notes (CPU mode to prevent OOM)")
        except Exception as e:
            logger.error(f"Failed to load Whisper for voice notes: {e}")
            raise
    
    return _whisper_model


async def transcribe_voice_note(audio_base64: str, language: str) -> Tuple[str, bytes]:
    """
    Transcribe voice note audio (webm format from browser)
    
    Args:
        audio_base64: Base64 encoded webm audio
        language: Source language code
        
    Returns:
        Tuple of (transcribed_text, empty bytes placeholder for backward compat)
    """
    try:
        # Decode base64
        audio_bytes = base64.b64decode(audio_base64)
        
        # Convert webm to wav using ffmpeg
        import subprocess
        import tempfile
        
        # Write webm to temp file
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_path = webm_file.name
            webm_file.write(audio_bytes)
        
        # Convert to 16kHz mono wav for Whisper
        wav_path = webm_path.replace('.webm', '_whisper.wav')
        subprocess.run([
            'ffmpeg', '-i', webm_path,
            '-ar', '16000',  # 16kHz for Whisper
            '-ac', '1',      # Mono
            '-f', 'wav',
            wav_path,
            '-y'
        ], capture_output=True, check=True)
        
        # Load Whisper model
        model = load_whisper_for_voice_notes()
        
        # Clear GPU cache before transcription (in case real-time model is on GPU)
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.info("🧹 Cleared GPU cache before voice note transcription")
        except Exception:
            pass
        
        # Transcribe with aggressive filtering
        logger.info(f"🎤 Transcribing voice note (language: {language})")
        segments, info = model.transcribe(
            wav_path,
            language=language,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200
            ),
            temperature=0.0,
            beam_size=1,
            condition_on_previous_text=False
        )
        
        # Extract text
        text_parts = []
        for segment in segments:
            segment_text = segment.text.strip()
            if segment_text:
                # Filter very low confidence
                avg_logprob = getattr(segment, 'avg_logprob', 0)
                no_speech_prob = getattr(segment, 'no_speech_prob', 0)
                
                if avg_logprob > -1.0 and no_speech_prob < 0.6:
                    text_parts.append(segment_text)
        
        transcribed_text = " ".join(text_parts).strip()
        
        # Cleanup temp files
        import os
        os.unlink(webm_path)
        os.unlink(wav_path)
        
        logger.info(f"✅ Voice note transcribed: '{transcribed_text}' (duration: {info.duration:.1f}s)")
        
        # Clear GPU cache after transcription
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        
        return transcribed_text, b''
        
    except Exception as e:
        logger.error(f"Voice note transcription error: {e}", exc_info=True)
        
        # Clear GPU cache on error
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        
        raise
