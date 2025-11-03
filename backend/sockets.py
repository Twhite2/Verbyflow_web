"""
WebSocket handling and user pairing logic
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Optional, Set
import asyncio
import json
import logging
import uuid

from stt import process_audio_to_text
from tts import process_text_to_audio
from translator import translate_text

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory state management
class ConnectionManager:
    """Manages WebSocket connections and pairing"""
    def __init__(self):
        self.waiting_queue: List[str] = []  # User IDs waiting for partner
        self.active_connections: Dict[str, WebSocket] = {}  # user_id -> websocket
        self.paired_users: Dict[str, str] = {}  # user_id -> partner_id
        self.user_languages: Dict[str, str] = {}  # user_id -> language_code
        self.voice_samples: Dict[str, str] = {}  # Store user voice samples
        self.lock = asyncio.Lock()
        
    async def connect(self, websocket: WebSocket, user_id: str, language: str = "en"):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_languages[user_id] = language
        logger.info(f"User {user_id} connected (language: {language})")
        
    def disconnect(self, user_id: str):
        """Remove user from all tracking structures"""
        # Remove from waiting queue
        if user_id in self.waiting_queue:
            self.waiting_queue.remove(user_id)
            
        # Notify partner if paired
        partner_id = self.paired_users.get(user_id)
        if partner_id:
            # Remove the pairing
            del self.paired_users[user_id]
            if partner_id in self.paired_users:
                del self.paired_users[partner_id]
            
        # Clean up
        self.active_connections.pop(user_id, None)
        self.user_languages.pop(user_id, None)
        logger.info(f"User {user_id} disconnected")
        
        return partner_id
        
    async def find_partner(self, user_id: str) -> Optional[str]:
        """
        Try to pair user with someone from waiting queue.
        Returns partner_id if found, None otherwise.
        """
        if self.waiting_queue:
            # Get first person in queue
            partner_id = self.waiting_queue.pop(0)
            
            # Create pairing
            self.paired_users[user_id] = partner_id
            self.paired_users[partner_id] = user_id
            
            user_lang = self.user_languages.get(user_id, "en")
            partner_lang = self.user_languages.get(partner_id, "en")
            
            if user_lang == partner_lang:
                logger.info(f"Paired {user_id} with {partner_id} - DIRECT CHAT MODE ({user_lang})")
            else:
                logger.info(f"Paired {user_id} ({user_lang}) with {partner_id} ({partner_lang}) - TRANSLATION MODE")
            
            return partner_id
        else:
            # Add to waiting queue
            self.waiting_queue.append(user_id)
            logger.info(f"User {user_id} added to waiting queue")
            return None
            
    async def send_to_user(self, user_id: str, message: dict):
        """Send message to specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending to {user_id}: {e}")
                
    async def broadcast_to_pair(self, user_id: str, message: dict):
        """Send message to user's partner"""
        partner_id = self.paired_users.get(user_id)
        if partner_id:
            await self.send_to_user(partner_id, message)


manager = ConnectionManager()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, lang: str = "en"):
    """
    Main WebSocket endpoint for user connections
    
    Query params:
    - lang: User's preferred language (e.g., 'en', 'es', 'fr')
    """
    await manager.connect(websocket, user_id, lang)
    
    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
            "language": lang
        })
        
        # Main message loop
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "voice_sample":
                # Store user's voice sample for TTS cloning
                voice_audio = data.get("audio")
                if voice_audio:
                    manager.voice_samples[user_id] = voice_audio
                    logger.info(f"Stored voice sample for user {user_id}")
                    await websocket.send_json({
                        "type": "voice_sample_received",
                        "message": "Voice sample stored successfully"
                    })
            
            elif message_type == "find_partner":
                # Try to pair with someone
                partner_id = await manager.find_partner(user_id)
                
                if partner_id:
                    # Notify both users they're paired
                    await manager.send_to_user(user_id, {
                        "type": "partner_found",
                        "partner_id": partner_id
                    })
                    await manager.send_to_user(partner_id, {
                        "type": "partner_found",
                        "partner_id": user_id
                    })
                else:
                    # User added to queue
                    await websocket.send_json({
                        "type": "searching",
                        "message": "Looking for a partner..."
                    })
                    
            elif message_type == "audio_chunk":
                # Process audio data
                audio_data = data.get("audio")  # Base64 encoded audio
                
                if not audio_data:
                    continue
                    
                partner_id = manager.paired_users.get(user_id)
                if not partner_id:
                    continue
                
                try:
                    # Get languages
                    source_lang = manager.user_languages.get(user_id, "en")
                    target_lang = manager.user_languages.get(partner_id, "en")
                    
                    # Check if both users speak the same language
                    if source_lang == target_lang:
                        # DIRECT VOICE CHAT MODE - No AI processing needed!
                        logger.info(f"Direct voice chat mode: both users speak {source_lang}")
                        logger.info(f"Forwarding raw audio directly ({len(audio_data)} chars)")
                        
                        # Forward raw audio directly to partner
                        await manager.broadcast_to_pair(user_id, {
                            "type": "direct_audio",
                            "audio": audio_data,  # Raw audio from sender
                            "language": source_lang
                        })
                    else:
                        # AI TRANSLATION MODE - Use STT, Translation, TTS
                        logger.info(f"Translation mode: {source_lang} -> {target_lang}")
                        
                        # STT: Convert audio to text
                        text = await process_audio_to_text(audio_data, language=source_lang)
                        
                        if not text:  # Skip if no transcription
                            continue
                        
                        logger.info(f"Transcribed text: '{text}' ({source_lang} -> {target_lang})")
                        
                        # Translate
                        translated_text = await translate_text(text, source_lang, target_lang)
                        logger.info(f"Translated to: '{translated_text}'")
                        
                        # Get sender's voice sample for TTS cloning
                        voice_sample = manager.voice_samples.get(user_id)
                        
                        if voice_sample:
                            logger.info(f"Using voice sample for user {user_id} ({len(voice_sample)} chars)")
                        else:
                            logger.warning(f"No voice sample found for user {user_id}!")
                        
                        # TTS: Convert translated text back to audio using sender's voice
                        translated_audio = await process_text_to_audio(
                            translated_text, 
                            target_lang,
                            voice_sample=voice_sample
                        )
                        
                        if translated_audio:
                            logger.info(f"TTS generated {len(translated_audio)} chars of base64 audio")
                        else:
                            logger.warning("TTS returned empty audio!")
                        
                        # Send to partner
                        await manager.broadcast_to_pair(user_id, {
                            "type": "audio_response",
                            "audio": translated_audio,
                            "text": translated_text,
                            "original_text": text
                        })
                    
                except Exception as e:
                    logger.error(f"Error processing audio: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Failed to process audio"
                    })
                    
            elif message_type == "disconnect":
                # User wants to disconnect from partner
                partner_id = manager.paired_users.get(user_id)
                if partner_id:
                    await manager.send_to_user(partner_id, {
                        "type": "partner_disconnected"
                    })
                    # Remove pairing
                    del manager.paired_users[user_id]
                    del manager.paired_users[partner_id]
                    
                await websocket.send_json({
                    "type": "disconnected"
                })
                
    except WebSocketDisconnect:
        partner_id = manager.disconnect(user_id)
        if partner_id:
            # Notify partner
            await manager.send_to_user(partner_id, {
                "type": "partner_disconnected"
            })
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(user_id)


@router.get("/stats")
async def get_stats():
    """Get current connection statistics"""
    return {
        "active_connections": len(manager.active_connections),
        "waiting_queue": len(manager.waiting_queue),
        "active_pairs": len(manager.paired_users) // 2
    }
