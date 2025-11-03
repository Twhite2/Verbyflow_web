"""
Model initialization script
Downloads and caches all required models before starting the server
"""
import logging
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def initialize_whisper():
    """Download and initialize Whisper model"""
    try:
        logger.info("Initializing Whisper model...")
        import whisper
        model = whisper.load_model("base")
        logger.info("✓ Whisper model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to load Whisper: {e}")
        return False

def initialize_translation_models():
    """Download and initialize common translation models"""
    try:
        logger.info("Initializing translation models...")
        from transformers import MarianMTModel, MarianTokenizer
        
        # Common language pairs
        pairs = [
            ("en", "es"),  # English to Spanish
            ("es", "en"),  # Spanish to English
            ("en", "fr"),  # English to French
            ("fr", "en"),  # French to English
        ]
        
        for src, tgt in pairs:
            try:
                model_name = f"Helsinki-NLP/opus-mt-{src}-{tgt}"
                logger.info(f"  Loading {src}->{tgt} model...")
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                model = MarianMTModel.from_pretrained(model_name)
                logger.info(f"  ✓ {src}->{tgt} model loaded")
            except Exception as e:
                logger.warning(f"  ✗ Failed to load {src}->{tgt}: {e}")
        
        logger.info("✓ Translation models initialized")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to initialize translation models: {e}")
        return False

def initialize_tts():
    """Download and initialize TTS model"""
    try:
        logger.info("Initializing TTS model...")
        from TTS.api import TTS
        
        # Load multilingual model
        model = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")
        logger.info("✓ TTS model loaded successfully")
        return True
    except Exception as e:
        logger.error(f"✗ Failed to load TTS: {e}")
        return False

def main():
    """Initialize all models"""
    logger.info("=" * 60)
    logger.info("VerbyFlow Model Initialization")
    logger.info("=" * 60)
    
    results = {
        "Whisper (STT)": initialize_whisper(),
        "Translation": initialize_translation_models(),
        "TTS": initialize_tts()
    }
    
    logger.info("=" * 60)
    logger.info("Initialization Summary:")
    for name, success in results.items():
        status = "✓ Ready" if success else "✗ Failed"
        logger.info(f"  {name}: {status}")
    
    all_success = all(results.values())
    if all_success:
        logger.info("\n✓ All models initialized successfully!")
        logger.info("You can now start the server with: python main.py")
        return 0
    else:
        logger.warning("\n⚠ Some models failed to initialize")
        logger.warning("The server will still start but may use fallbacks")
        return 1

if __name__ == "__main__":
    sys.exit(main())
