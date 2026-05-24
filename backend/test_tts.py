"""Test TTS generation"""
import asyncio
from tts import process_text_to_audio

async def test():
    # Test predefined voice TTS
    print("Testing TTS with predefined voice...")
    result = await process_text_to_audio("Hello, this is a test", "en", "female")
    print(f"Result length: {len(result)} chars")
    print(f"First 100 chars: {result[:100]}")
    
asyncio.run(test())
