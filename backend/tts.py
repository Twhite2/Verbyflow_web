"""
Text-to-Speech module using Coqui TTS with Predefined Voice System
Uses XTTS v2 built-in speakers mapped by language and gender.
No voice cloning - consistent, low-latency predefined voices.
"""
import base64
import logging
import numpy as np
import io
import os
from typing import Optional, AsyncGenerator, Dict
import asyncio
from TTS.api import TTS

logger = logging.getLogger(__name__)

# Global TTS model instance
_tts_model = None

# Predefined voice map: language -> gender -> XTTS v2 speaker name
# XTTS v2 is multilingual so any speaker can speak any supported language.
# We pick distinct speakers per gender for natural variation.
VOICE_MAP: Dict[str, Dict[str, str]] = {
    "en": {"male": "Andrew Chipper",   "female": "Daisy Studious"},
    "es": {"male": "Luis Moray",       "female": "Alma María"},
    "fr": {"male": "Damjan Chapman",   "female": "Claribel Dervla"},
    "de": {"male": "Viktor Eka",       "female": "Brenda Stern"},
    "it": {"male": "Gilberto Mathias", "female": "Ana Florence"},
    "pt": {"male": "Marcos Rudaski",   "female": "Rosemary Okafor"},
    "nl": {"male": "Baldur Sanjin",    "female": "Annmarie Nele"},
    "ru": {"male": "Dionisio Schuyler","female": "Lilya Stainthorpe"},
    "zh": {"male": "Kazuhiko Atallah", "female": "Tamaru Naoko"},
    "ja": {"male": "Xavier Hayasaka",  "female": "Alexandra Hisakawa"},
    "ko": {"male": "Royston Min",      "female": "Szofi Gransen"},
    "ar": {"male": "Suad Qasim",       "female": "Asya Anara"},
    "hi": {"male": "Badr Odhiambo",    "female": "Chandra MacFarland"},
}

# Default fallback speaker per gender (English speakers work well across languages)
DEFAULT_SPEAKERS = {"male": "Andrew Chipper", "female": "Daisy Studious"}


def get_speaker(language: str, gender: str = "female") -> str:
    """
    Get the predefined speaker name for a language and gender.
    Falls back to default speakers if language not mapped.
    
    Args:
        language: ISO 639-1 language code
        gender: 'male' or 'female'
    Returns:
        Speaker name string for XTTS v2
    """
    gender = gender.lower() if gender else "female"
    if gender not in ("male", "female"):
        gender = "female"
    
    lang_voices = VOICE_MAP.get(language)
    if lang_voices:
        return lang_voices.get(gender, DEFAULT_SPEAKERS[gender])
    return DEFAULT_SPEAKERS[gender]


def load_tts_model():
    """
    Load Coqui TTS model (XTTS v2) - optimized for speed.
    Uses predefined speakers, no voice cloning.
    """
    global _tts_model
    
    if _tts_model is None:
        try:
            logger.info("Loading TTS model (XTTS v2 - predefined voices)...")
            
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            _tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
            _tts_model.to(device)
            
            # Enable speed optimizations
            if hasattr(_tts_model.synthesizer.tts_model, 'decoder'):
                _tts_model.synthesizer.tts_model.decoder.use_gt_durations = False
            
            # Log available speakers for reference
            if hasattr(_tts_model, 'speakers') and _tts_model.speakers:
                logger.info(f"Available XTTS speakers: {len(_tts_model.speakers)}")
            
            logger.info(f"TTS model loaded on {device} with predefined voice system")
        except Exception as e:
            logger.error(f"Failed to load TTS model: {e}")
            _tts_model = None
    
    return _tts_model


async def process_text_to_audio(text: str, language: str = "en", gender: str = "female") -> str:
    """
    Convert text to speech using a predefined voice.
    
    Args:
        text: Text to synthesize
        language: Target language code
        gender: 'male' or 'female'
        
    Returns:
        Base64 encoded audio data (PCM 16-bit)
    """
    try:
        if not text or not text.strip():
            return ""
        
        model = load_tts_model()
        
        if model is None:
            logger.warning("TTS model not available, skipping")
            return ""
        
        speaker = get_speaker(language, gender)
        logger.info(f"Generating TTS: '{text[:50]}...' lang={language} speaker={speaker}")
        
        # Generate audio with predefined speaker (no speaker_wav needed)
        wav = model.tts(text=text, speaker=speaker, language=language)
        
        # Convert to numpy array if it's a list
        if isinstance(wav, list):
            wav = np.array(wav)
        
        # Normalize and convert to 16-bit PCM
        if isinstance(wav, np.ndarray):
            wav_normalized = np.clip(wav, -1.0, 1.0)
            wav_int16 = (wav_normalized * 32767).astype(np.int16)
            audio_bytes = wav_int16.tobytes()
        else:
            audio_bytes = bytes(wav)
        
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        logger.info(f"Generated {len(audio_bytes)} bytes of audio")
        return audio_base64
        
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return ""


def get_supported_voices() -> Dict[str, Dict[str, str]]:
    """
    Return the full voice map for API/frontend consumption.
    """
    return VOICE_MAP


async def stream_text_to_audio(
    text: str, 
    language: str = "en", 
    gender: str = "female"
) -> AsyncGenerator[str, None]:
    """
    Stream TTS audio generation with predefined voice.
    Yields audio chunks as they're generated for lower latency.
    
    Args:
        text: Text to synthesize
        language: Target language code
        gender: 'male' or 'female'
        
    Yields:
        Base64 encoded audio chunks
    """
    try:
        if not text or not text.strip():
            return
        
        model = load_tts_model()
        if model is None:
            logger.warning("TTS model not available, skipping")
            return
        
        speaker = get_speaker(language, gender)
        logger.info(f"Streaming TTS: '{text[:50]}...' lang={language} speaker={speaker}")
        
        try:
            # Generate audio with predefined speaker
            wav = model.tts(text=text, speaker=speaker, language=language)
            
            if isinstance(wav, list):
                wav = np.array(wav)
            
            # Normalize and convert to 16-bit PCM
            wav_normalized = np.clip(wav, -1.0, 1.0)
            wav_int16 = (wav_normalized * 32767).astype(np.int16)
            
            # Stream in chunks (0.1s = 2400 samples at 24kHz - XTTS output rate)
            chunk_size = 2400  # 24kHz * 0.1s
            total_samples = len(wav_int16)
            
            for i in range(0, total_samples, chunk_size):
                chunk = wav_int16[i:i+chunk_size]
                audio_bytes = chunk.tobytes()
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                yield audio_base64
            
            logger.info(f"Streamed {total_samples} samples in {total_samples//chunk_size + 1} chunks")
            
        except Exception as e:
            logger.error(f"Streaming TTS error: {e}")
            return
    
    except Exception as e:
        logger.error(f"Stream TTS Error: {e}")
        import traceback
        logger.error(traceback.format_exc())


def get_available_speakers() -> list:
    """
    Return list of all available XTTS v2 speakers.
    Useful for debugging and expanding voice map.
    """
    model = load_tts_model()
    if model and hasattr(model, 'speakers') and model.speakers:
        return list(model.speakers)
    return []
