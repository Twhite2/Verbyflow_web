"""
Text-to-Speech module using Coqui TTS with Streaming Support
"""
import base64
import logging
import numpy as np
import io
import tempfile
import os
import wave
from typing import Optional, AsyncGenerator, Dict
import asyncio
from TTS.api import TTS

logger = logging.getLogger(__name__)

# Global TTS model instance
_tts_model = None

# Voice embedding cache
_voice_embedding_cache: Dict[str, str] = {}


def load_tts_model():
    """
    Load Coqui TTS model (XTTS v2 with voice cloning) - optimized for speed
    """
    global _tts_model
    
    if _tts_model is None:
        try:
            logger.info("Loading TTS model (XTTS v2)...")
            
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            # Use XTTS v2 for voice cloning and multilingual support
            _tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=False)
            _tts_model.to(device)
            
            # Enable speed optimizations
            if hasattr(_tts_model.synthesizer.tts_model, 'decoder'):
                # Use inference mode for faster processing
                _tts_model.synthesizer.tts_model.decoder.use_gt_durations = False
            
            logger.info(f"TTS model loaded successfully on {device} with speed optimizations")
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


def get_or_create_speaker_wav(user_id: str, voice_sample: Optional[str] = None) -> Optional[str]:
    """
    Get cached speaker wav path or create new one from voice sample.
    Reduces latency by avoiding repeated temp file creation.
    
    Args:
        user_id: User ID for caching
        voice_sample: Base64 encoded voice sample (only needed for first call)
        
    Returns:
        Path to speaker wav file
    """
    global _voice_embedding_cache
    
    # Check cache first
    if user_id in _voice_embedding_cache:
        cached_path = _voice_embedding_cache[user_id]
        if os.path.exists(cached_path):
            logger.debug(f"Using cached speaker wav for user {user_id}")
            return cached_path
        else:
            # Cache invalidated, remove entry
            del _voice_embedding_cache[user_id]
    
    # Create new speaker wav file
    if not voice_sample:
        logger.warning(f"No voice sample provided for user {user_id} and no cache exists")
        return None
    
    try:
        # Decode voice sample
        voice_bytes = base64.b64decode(voice_sample)
        
        # Create persistent temp file (don't delete immediately)
        f = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        with wave.open(f.name, 'wb') as wav_file:
            wav_file.setnchannels(1)  # Mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(16000)  # 16kHz
            wav_file.writeframes(voice_bytes)
        
        # Cache the path
        _voice_embedding_cache[user_id] = f.name
        logger.info(f"Created and cached speaker wav for user {user_id}")
        return f.name
        
    except Exception as e:
        logger.error(f"Failed to create speaker wav for user {user_id}: {e}")
        return None


def clear_voice_cache(user_id: Optional[str] = None):
    """
    Clear voice embedding cache for a user or all users.
    Call this when user disconnects.
    
    Args:
        user_id: User ID to clear, or None to clear all
    """
    global _voice_embedding_cache
    
    if user_id:
        if user_id in _voice_embedding_cache:
            # Delete temp file
            try:
                os.unlink(_voice_embedding_cache[user_id])
            except:
                pass
            del _voice_embedding_cache[user_id]
            logger.info(f"Cleared voice cache for user {user_id}")
    else:
        # Clear all
        for path in _voice_embedding_cache.values():
            try:
                os.unlink(path)
            except:
                pass
        _voice_embedding_cache.clear()
        logger.info("Cleared all voice caches")


async def stream_text_to_audio(
    text: str, 
    language: str = "en", 
    user_id: Optional[str] = None,
    voice_sample: Optional[str] = None
) -> AsyncGenerator[str, None]:
    """
    Stream TTS audio generation with voice cloning.
    Yields audio chunks as they're generated for lower latency.
    
    Args:
        text: Text to synthesize
        language: Target language code
        user_id: User ID for voice caching
        voice_sample: Base64 encoded audio sample (only needed first time)
        
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
        
        logger.info(f"Streaming TTS for: '{text[:50]}...' in language: {language}")
        
        # Get or create cached speaker wav
        speaker_wav_path = None
        if user_id:
            speaker_wav_path = get_or_create_speaker_wav(user_id, voice_sample)
        elif voice_sample:
            # No user_id, create temporary (legacy behavior)
            speaker_wav_path = get_or_create_speaker_wav("temp", voice_sample)
        
        if not speaker_wav_path:
            logger.error("No speaker wav available for TTS")
            return
        
        # Check if model supports streaming
        if hasattr(model, 'tts_stream') or hasattr(model.synthesizer, 'tts'):
            # XTTS v2 streaming mode
            logger.info("Using XTTS streaming mode")
            
            # Generate audio with streaming
            try:
                # Use tts method but split output into chunks
                wav = model.tts(text=text, language=language, speaker_wav=speaker_wav_path)
                
                if isinstance(wav, list):
                    wav = np.array(wav)
                
                # Normalize and convert to 16-bit PCM
                wav_normalized = np.clip(wav, -1.0, 1.0)
                wav_int16 = (wav_normalized * 32767).astype(np.int16)
                
                # Stream in chunks (0.2s = 3200 samples at 16kHz)
                chunk_size = 3200
                total_samples = len(wav_int16)
                
                for i in range(0, total_samples, chunk_size):
                    chunk = wav_int16[i:i+chunk_size]
                    audio_bytes = chunk.tobytes()
                    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                    
                    # Yield chunk immediately
                    yield audio_base64
                    
                    # Small delay to simulate streaming (remove in production)
                    await asyncio.sleep(0.01)
                
                logger.info(f"Streamed {total_samples} samples in {total_samples//chunk_size + 1} chunks")
                
            except Exception as e:
                logger.error(f"Streaming TTS error: {e}")
                return
        else:
            # Fallback: generate all at once and split
            logger.warning("Model doesn't support streaming, using chunked fallback")
            wav = model.tts(text=text, language=language, speaker_wav=speaker_wav_path)
            
            if isinstance(wav, list):
                wav = np.array(wav)
            
            wav_normalized = np.clip(wav, -1.0, 1.0)
            wav_int16 = (wav_normalized * 32767).astype(np.int16)
            audio_bytes = wav_int16.tobytes()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            # Split into chunks
            chunk_size = 8192  # Base64 chunk size
            for i in range(0, len(audio_base64), chunk_size):
                yield audio_base64[i:i+chunk_size]
                await asyncio.sleep(0.01)
    
    except Exception as e:
        logger.error(f"Stream TTS Error: {e}")
        import traceback
        logger.error(traceback.format_exc())


async def clone_voice(audio_sample: bytes, text: str, language: str = "en") -> str:
    """
    Clone voice from sample and generate speech
    (Legacy function - use stream_text_to_audio instead)
    
    Args:
        audio_sample: Sample audio for voice cloning
        text: Text to synthesize in cloned voice
        language: Target language
        
    Returns:
        Base64 encoded audio
    """
    return await process_text_to_audio(text, language)
