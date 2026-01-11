"""
Preload all AI models at startup to avoid runtime delays
- MarianMT translation models (en-es, es-en)
- Coqui XTTS-v2 for TTS
- Faster-Whisper for ASR
"""
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Track loaded models
_models_loaded = False

async def preload_all_models():
    """
    Preload all models in parallel at startup
    This prevents first-call delays during live calls
    """
    global _models_loaded
    
    if _models_loaded:
        logger.info("Models already loaded, skipping")
        return
    
    logger.info("🚀 Starting model preload...")
    start_time = asyncio.get_event_loop().time()
    
    # Use thread pool for parallel loading
    executor = ThreadPoolExecutor(max_workers=3)
    loop = asyncio.get_event_loop()
    
    # Define loading tasks
    async def load_translation_models():
        """Load en-es and es-en translation models"""
        from translator import load_translation_model
        try:
            logger.info("Loading MarianMT models...")
            # Load both directions in parallel
            await asyncio.gather(
                loop.run_in_executor(executor, load_translation_model, "en", "es"),
                loop.run_in_executor(executor, load_translation_model, "es", "en")
            )
            logger.info("✅ Translation models loaded")
        except Exception as e:
            logger.error(f"Failed to load translation models: {e}")
    
    async def load_tts_model():
        """Load XTTS-v2 TTS model"""
        from tts import load_tts_model
        try:
            logger.info("Loading XTTS-v2 model...")
            await loop.run_in_executor(executor, load_tts_model)
            logger.info("✅ TTS model loaded")
        except Exception as e:
            logger.error(f"Failed to load TTS model: {e}")
    
    async def load_whisper_base():
        """Preload Faster-Whisper base model"""
        from faster_whisper import WhisperModel
        import torch
        try:
            logger.info("Loading Faster-Whisper base model...")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "int8_float16" if device == "cuda" else "int8"
            
            # Just load to cache - will be reused by processors
            _ = WhisperModel("base", device=device, compute_type=compute_type, num_workers=2)
            logger.info("✅ Whisper model loaded")
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
    
    # Load all models in parallel
    try:
        await asyncio.gather(
            load_translation_models(),
            load_tts_model(),
            load_whisper_base()
        )
        
        elapsed = asyncio.get_event_loop().time() - start_time
        logger.info(f"🎉 All models preloaded in {elapsed:.1f}s")
        _models_loaded = True
        
    except Exception as e:
        logger.error(f"Model preload error: {e}", exc_info=True)
    finally:
        executor.shutdown(wait=False)
