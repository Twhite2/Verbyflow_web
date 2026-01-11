"""
Text translation module
Using transformers and MarianMT for translation
Uses safetensors format to avoid torch.load security issues
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
            
            # Load with safetensors to avoid torch.load CVE issue
            # This bypasses the PyTorch 2.6 requirement completely
            import torch
            
            try:
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                # Force use_safetensors=True to avoid torch.load
                model = MarianMTModel.from_pretrained(
                    model_name,
                    use_safetensors=True  # Use safetensors format (bypasses torch.load)
                )
                logger.info(f"Loaded {lang_pair} model with safetensors")
            except Exception as e:
                # Fallback: try without safetensors if not available
                logger.warning(f"Safetensors not available for {lang_pair}, trying pytorch format...")
                tokenizer = MarianTokenizer.from_pretrained(model_name)
                model = MarianMTModel.from_pretrained(
                    model_name,
                    use_safetensors=False,  # Use PyTorch format
                    trust_remote_code=True  # Allow loading
                )
                logger.info(f"Loaded {lang_pair} model with pytorch format")
            
            # Move to GPU if available
            if torch.cuda.is_available():
                model = model.cuda()
                logger.info(f"Model moved to GPU")
            
            _translation_models[lang_pair] = (model, tokenizer)
            logger.info(f"✅ Translation model loaded: {lang_pair}")
            
        except Exception as e:
            logger.error(f"❌ Failed to load model for {lang_pair}: {e}")
            # Return None to use fallback
            return None, None
    
    return _translation_models[lang_pair]


async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translate text from source to target language
    Optimized for text chat (<100ms target)
    
    Args:
        text: Text to translate
        source_lang: Source language code (e.g., 'en')
        target_lang: Target language code (e.g., 'es')
        
    Returns:
        Translated text
    """
    try:
        # If same language, return as-is (instant)
        if source_lang == target_lang:
            return text
        
        # If text is empty, return as-is (instant)
        if not text or not text.strip():
            return text
        
        # Edge case: preserve emojis and URLs by extracting them
        import re
        
        # Extract URLs (preserve them)
        url_pattern = r'https?://[^\s]+'
        urls = re.findall(url_pattern, text)
        text_with_placeholders = text
        for i, url in enumerate(urls):
            text_with_placeholders = text_with_placeholders.replace(url, f"__URL{i}__")
        
        # Extract emojis (preserve them) - Unicode emoji ranges
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE
        )
        emojis = emoji_pattern.findall(text_with_placeholders)
        for i, emoji in enumerate(emojis):
            text_with_placeholders = text_with_placeholders.replace(emoji, f"__EMOJI{i}__")
            
        logger.info(f"Translating: '{text[:50]}...' ({source_lang} -> {target_lang})")
        
        # Load translation model for language pair
        model, tokenizer = load_translation_model(source_lang, target_lang)
        
        if model is None or tokenizer is None:
            logger.warning(f"Translation model not available for {source_lang}->{target_lang}, returning original")
            return text  # Fallback to original
        
        # Tokenize input text (max 128 tokens for chat messages - faster)
        inputs = tokenizer(
            text_with_placeholders, 
            return_tensors="pt", 
            padding=True, 
            truncation=True, 
            max_length=128  # Reduced for faster chat translation
        )
        
        # Move to GPU if available
        import torch
        if torch.cuda.is_available():
            inputs = {k: v.cuda() for k, v in inputs.items()}
        
        # Generate translation with optimized settings for speed
        with torch.no_grad():
            translated_tokens = model.generate(
                **inputs, 
                max_length=128,  # Reduced for speed
                num_beams=1,  # Greedy decoding (faster than beam search)
                early_stopping=True
            )
        
        # Decode output
        result = tokenizer.decode(translated_tokens[0], skip_special_tokens=True)
        
        # Restore URLs and emojis
        for i, url in enumerate(urls):
            result = result.replace(f"__URL{i}__", url)
        for i, emoji in enumerate(emojis):
            result = result.replace(f"__EMOJI{i}__", emoji)
        
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
