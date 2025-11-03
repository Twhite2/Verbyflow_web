"""
Speech-to-Text module using Whisper
"""
import base64
import io
import logging
import torch
import whisper
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# Global model instance (loaded once)
_whisper_model: Optional[whisper.Whisper] = None


def load_whisper_model(model_size: str = "base"):
    """
    Load Whisper model into memory
    
    Args:
        model_size: One of 'tiny', 'base', 'small', 'medium', 'large'
    """
    global _whisper_model
    
    if _whisper_model is None:
        logger.info(f"Loading Whisper model: {model_size}")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _whisper_model = whisper.load_model(model_size, device=device)
        logger.info(f"Whisper model loaded on {device}")
    
    return _whisper_model


async def process_audio_to_text(audio_base64: str, language: Optional[str] = None) -> str:
    """
    Convert audio to text using Whisper
    
    Args:
        audio_base64: Base64 encoded audio data (raw 16-bit PCM at 16kHz)
        language: Optional language hint (e.g., 'en', 'es', 'fr')
        
    Returns:
        Transcribed text
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
        
        # Transcribe with Whisper
        result = model.transcribe(
            audio_float,
            language=language,
            fp16=torch.cuda.is_available()
        )
        
        transcribed_text = result["text"].strip()
        
        # Only return if there's actual content (not just silence markers)
        if transcribed_text and len(transcribed_text) > 0:
            logger.info(f"Transcribed: '{transcribed_text}' (lang: {language})")
            return transcribed_text
        else:
            return ""
        
    except Exception as e:
        logger.error(f"STT Error: {e}")
        return ""


def transcribe_file(audio_path: str, language: Optional[str] = None) -> dict:
    """
    Transcribe an audio file (for testing)
    
    Args:
        audio_path: Path to audio file
        language: Optional language code
        
    Returns:
        Full Whisper result dict
    """
    model = load_whisper_model()
    result = model.transcribe(audio_path, language=language)
    return result
