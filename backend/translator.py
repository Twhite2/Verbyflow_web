"""
Text translation module
Using transformers and MarianMT for translation
"""
import logging
from typing import Optional, Dict
from transformers import MarianMTModel, MarianTokenizer

logger = logging.getLogger(__name__)

# Cache for loaded models
_translation_models: Dict[str, tuple] = {}


def get_model_name(source_lang: str, target_lang: str) -> str:
    """
    Get the MarianMT model name for language pair
    
    Args:
        source_lang: Source language code (e.g., 'en')
        target_lang: Target language code (e.g., 'es')
        
    Returns:
        Model name from Helsinki-NLP
    """
    # Map of common language pairs to model names
    lang_pair = f"{source_lang}-{target_lang}"
    
    # Helsinki-NLP naming convention
    return f"Helsinki-NLP/opus-mt-{source_lang}-{target_lang}"


def load_translation_model(source_lang: str, target_lang: str):
    """
    Load translation model for specific language pair
    
    Args:
        source_lang: Source language code
        target_lang: Target language code
        
    Returns:
        Tuple of (model, tokenizer)
    """
    global _translation_models
    
    lang_pair = f"{source_lang}-{target_lang}"
    
    if lang_pair not in _translation_models:
        try:
            logger.info(f"Loading translation model: {lang_pair}")
            model_name = get_model_name(source_lang, target_lang)
            
            tokenizer = MarianTokenizer.from_pretrained(model_name)
            model = MarianMTModel.from_pretrained(model_name)
            
            # Move to GPU if available
            import torch
            if torch.cuda.is_available():
                model = model.cuda()
            
            _translation_models[lang_pair] = (model, tokenizer)
            logger.info(f"Translation model loaded: {lang_pair}")
            
        except Exception as e:
            logger.error(f"Failed to load model for {lang_pair}: {e}")
            # Return None to use fallback
            return None, None
    
    return _translation_models[lang_pair]


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate text from source to target language
    
    Args:
        text: Text to translate
        source_lang: Source language code (e.g., 'en')
        target_lang: Target language code (e.g., 'es')
        
    Returns:
        Translated text
    """
    try:
        # If same language, return as-is
        if source_lang == target_lang:
            return text
        
        # If text is empty, return as-is
        if not text or not text.strip():
            return text
            
        logger.info(f"Translating: '{text[:50]}...' ({source_lang} -> {target_lang})")
        
        # Load translation model for language pair
        model, tokenizer = load_translation_model(source_lang, target_lang)
        
        if model is None or tokenizer is None:
            logger.warning(f"Translation model not available for {source_lang}->{target_lang}, returning original")
            return text  # Fallback to original
        
        # Tokenize input text
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
        
        # Move to GPU if available
        import torch
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        
        # Generate translation
        with torch.no_grad():
            translated_tokens = model.generate(**inputs, max_length=512)
        
        # Decode output
        result = tokenizer.decode(translated_tokens[0], skip_special_tokens=True)
        
        logger.info(f"Translation result: '{result[:50]}...'")
        return result
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text  # Fallback to original text


def get_supported_languages() -> list[str]:
    """
    Get list of supported language codes
    
    Returns:
        List of ISO 639-1 language codes
    """
    return [
        "en",  # English
        "es",  # Spanish
        "fr",  # French
        "de",  # German
        "it",  # Italian
        "pt",  # Portuguese
        "nl",  # Dutch
        "ru",  # Russian
        "zh",  # Chinese
        "ja",  # Japanese
        "ko",  # Korean
        "ar",  # Arabic
        "hi",  # Hindi
    ]
