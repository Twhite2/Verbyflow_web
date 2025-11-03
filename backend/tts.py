"""
Text-to-Speech module using Coqui TTS
"""
import base64
import logging
import numpy as np
import io
from typing import Optional

logger = logging.getLogger(__name__)

# Global TTS model instance
_tts_model = None


def load_tts_model():
    """
    Load TTS model into memory
    Using Coqui TTS for multilingual support
    """
    global _tts_model
    
    if _tts_model is None:
        try:
            import torch
            logger.info("Loading Coqui TTS model...")
            from TTS.api import TTS
            
            # Determine device (GPU if available)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"TTS will use device: {device}")
            
            # Load multilingual model with GPU support
            _tts_model = TTS(
                model_name="tts_models/multilingual/multi-dataset/xtts_v2",
                gpu=(device == "cuda")  # Enable GPU if available
            )
            
            logger.info(f"TTS model loaded successfully on {device}")
        except Exception as e:
            logger.error(f"Failed to load TTS model: {e}")
            _tts_model = None
    
    return _tts_model


async def process_text_to_audio(text: str, language: str = "en", voice_sample: Optional[str] = None) -> str:
    """
    Convert text to speech audio with voice cloning
    
    Args:
        text: Text to synthesize
        language: Target language code
        voice_sample: Optional base64 encoded audio sample for voice cloning
        
    Returns:
        Base64 encoded audio data (WAV format)
    """
    try:
        if not text or not text.strip():
            return ""
        
        model = load_tts_model()
        
        if model is None:
            logger.warning("TTS model not available, skipping")
            return ""
        
        logger.info(f"Generating TTS for text: '{text[:50]}...' in language: {language}")
        
        # If voice sample provided, save it temporarily for XTTS
        speaker_wav_path = None
        if voice_sample:
            import tempfile
            import os
            
            # Decode voice sample
            voice_bytes = base64.b64decode(voice_sample)
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                # Convert PCM to WAV format
                import wave
                with wave.open(f.name, 'wb') as wav_file:
                    wav_file.setnchannels(1)  # Mono
                    wav_file.setsampwidth(2)  # 16-bit
                    wav_file.setframerate(16000)  # 16kHz
                    wav_file.writeframes(voice_bytes)
                speaker_wav_path = f.name
        
        # Generate audio with voice cloning
        if speaker_wav_path:
            wav = model.tts(text=text, language=language, speaker_wav=speaker_wav_path)
            # Clean up temp file
            import os
            try:
                os.unlink(speaker_wav_path)
            except:
                pass
        else:
            # No voice sample - XTTS v2 requires speaker_wav, so this will fail
            logger.error("XTTS v2 requires voice sample (speaker_wav). Skipping TTS.")
            return ""
        
        # Convert to numpy array if it's a list
        if isinstance(wav, list):
            wav = np.array(wav)
        
        # Convert numpy array to bytes
        if isinstance(wav, np.ndarray):
            # Normalize and convert to 16-bit PCM
            wav_normalized = np.clip(wav, -1.0, 1.0)
            wav_int16 = (wav_normalized * 32767).astype(np.int16)
            audio_bytes = wav_int16.tobytes()
        else:
            # Fallback - try to convert to bytes
            audio_bytes = bytes(wav)
        
        # Encode to base64
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        logger.info(f"Generated {len(audio_bytes)} bytes of audio")
        return audio_base64
        
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Return empty on error (no audio)
        return ""


async def clone_voice(audio_sample: bytes, text: str, language: str = "en") -> str:
    """
    Clone voice from sample and generate speech
    (Advanced feature for future)
    
    Args:
        audio_sample: Sample audio for voice cloning
        text: Text to synthesize in cloned voice
        language: Target language
        
    Returns:
        Base64 encoded audio
    """
    # This would use Dia's voice cloning capabilities
    # For MVP, just use standard TTS
    return await process_text_to_audio(text, language)
