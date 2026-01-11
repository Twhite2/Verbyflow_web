"""
WebSocket handling and user pairing logic
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Optional, Set, List
import asyncio
import json
import logging
import uuid

from stt import process_audio_to_text
from tts import process_text_to_audio, stream_text_to_audio, clear_voice_cache
from translator import translate_text
from realtime_audio_processor import RealtimeAudioProcessor

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
        self.message_history: Dict[str, List[Dict]] = {}  # pair_id -> messages (in-memory)
        self.lock = asyncio.Lock()
        
        # Real-time audio processors (hybrid architecture)
        self.audio_processors: Dict[str, RealtimeAudioProcessor] = {}
        
    async def connect(self, websocket: WebSocket, user_id: str, language: str = "en"):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.user_languages[user_id] = language
        logger.info(f"User {user_id} connected (language: {language})")
        
    async def create_pipeline(self, user_id: str, partner_id: str):
        """Create and initialize real-time audio processor"""
        source_lang = self.user_languages.get(user_id, "en")
        target_lang = self.user_languages.get(partner_id, "en")
        
        # Get voice sample for TTS cloning
        voice_sample = self.voice_samples.get(partner_id)
        
        logger.info(f"Creating audio processor: {user_id} ({source_lang}) -> {partner_id} ({target_lang})")
        
        # Create processor
        processor = RealtimeAudioProcessor(user_id, source_lang, target_lang, voice_sample)
        
        # Initialize models in background
        await processor.initialize()
        
        # Set callback to handle results
        async def handle_result(result):
            result_type = result.get('type')
            
            if result_type == 'partial':
                # Send partial to sender's UI only
                await self.send_to_user(user_id, {
                    'type': 'partial_transcript',
                    'text': result['text']
                })
            
            elif result_type == 'final':
                # Translate and generate TTS for partner
                await self._process_final_transcript(user_id, partner_id, result['text'])
            
            elif result_type == 'tts_interrupt':
                # Stop TTS playback
                pass  # Frontend handles this
        
        processor.set_result_callback(handle_result)
        self.audio_processors[user_id] = processor
        
        # Start processing thread
        processor.start_processing()
        
        logger.info(f"✅ Processor ready: {user_id} ({source_lang} -> {target_lang})")
    
    async def _process_final_transcript(self, user_id: str, partner_id: str, text: str):
        """Process final transcript: translate and generate TTS"""
        try:
            import time
            pipeline_start = time.time()
            
            source_lang = self.user_languages.get(user_id, "en")
            target_lang = self.user_languages.get(partner_id, "en")
            
            logger.info(f"🎯 Pipeline start: '{text[:50]}...' ({source_lang} → {target_lang})")
            
            # Step 1: Translate
            translate_start = time.time()
            if source_lang != target_lang:
                translated = await translate_text(text, source_lang, target_lang)
                translate_time = time.time() - translate_start
                logger.info(f"📝 Translation ({translate_time:.2f}s): '{text}' → '{translated}'")
            else:
                translated = text
                logger.info(f"📝 No translation needed (same language)")
            
            # Step 2: Generate TTS with PARTNER's voice sample
            # CRITICAL: Use partner's voice to clone their voice when speaking back to them
            partner_voice_sample = self.voice_samples.get(partner_id)
            
            if not partner_voice_sample:
                logger.warning(f"⚠️ No voice sample for partner {partner_id}, skipping TTS")
                return
            
            tts_start = time.time()
            chunk_count = 0
            
            # Use streaming TTS with correct parameters
            async for audio_chunk in stream_text_to_audio(
                text=translated, 
                language=target_lang,
                user_id=partner_id,  # For voice caching
                voice_sample=partner_voice_sample
            ):
                chunk_count += 1
                await self.send_to_user(partner_id, {
                    'type': 'audio_chunk',
                    'audio': audio_chunk
                })
            
            tts_time = time.time() - tts_start
            total_time = time.time() - pipeline_start
            
            logger.info(f"🔊 TTS complete ({tts_time:.2f}s): {chunk_count} chunks sent to {partner_id}")
            logger.info(f"✅ Pipeline complete ({total_time:.2f}s total)")
            
        except Exception as e:
            logger.error(f"❌ Pipeline error: {e}", exc_info=True)
    
    async def disconnect(self, user_id: str):
        """Remove user from all tracking structures"""
        # Stop audio processor if exists
        if user_id in self.audio_processors:
            processor = self.audio_processors[user_id]
            processor.stop()
            del self.audio_processors[user_id]
        
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
        async with self.lock:  # CRITICAL: Lock protects against race conditions
            logger.info(f"🔒 Lock acquired for {user_id}, queue state: {self.waiting_queue}")
            
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
                
                logger.info(f"🔓 Lock released, paired: {user_id} <-> {partner_id}")
                return partner_id
            else:
                # Add to waiting queue
                self.waiting_queue.append(user_id)
                logger.info(f"User {user_id} added to waiting queue")
                logger.info(f"🔓 Lock released, queue now: {self.waiting_queue}")
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
                logger.info(f"🔍 Received find_partner request from {user_id}")
                
                # Don't add to queue if already waiting or paired
                if user_id in manager.waiting_queue:
                    logger.info(f"User {user_id} already in waiting queue, skipping")
                    await websocket.send_json({
                        "type": "searching",
                        "message": "Still looking for a partner..."
                    })
                    continue
                    
                if user_id in manager.paired_users:
                    logger.info(f"User {user_id} already paired, skipping")
                    continue
                
                partner_id = await manager.find_partner(user_id)
                
                if partner_id:
                    # Notify both users they're paired
                    logger.info(f"✅ Pairing complete: {user_id} <-> {partner_id}")
                    
                    # Create streaming pipelines for both users
                    await manager.create_pipeline(user_id, partner_id)
                    await manager.create_pipeline(partner_id, user_id)
                    
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
                    logger.info(f"📝 User {user_id} now in queue, waiting...")
                    await websocket.send_json({
                        "type": "searching",
                        "message": "Looking for a partner..."
                    })
                    
            elif message_type == "audio_chunk":
                # Process 20ms audio frame through real-time processor
                audio_data = data.get("audio")  # Binary PCM or base64
                
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
                        logger.debug(f"Direct voice chat mode: both users speak {source_lang}")
                        
                        # Forward raw audio directly to partner
                        await manager.broadcast_to_pair(user_id, {
                            "type": "direct_audio",
                            "audio": audio_data,
                            "language": source_lang
                        })
                    else:
                        # REAL-TIME STREAMING MODE - Process every frame
                        processor = manager.audio_processors.get(user_id)
                        
                        if processor:
                            # Convert base64 to bytes if needed
                            import base64
                            if isinstance(audio_data, str):
                                frame_bytes = base64.b64decode(audio_data)
                            else:
                                frame_bytes = audio_data
                            
                            # Process frame (LAW 1: Time never stops)
                            processor.process_frame(frame_bytes)
                        else:
                            logger.warning(f"⚠️ No processor for {user_id}")
                    
                except Exception as e:
                    logger.error(f"Error processing audio: {e}", exc_info=True)
                    
            elif message_type == "webrtc_offer":
                # Relay WebRTC offer to partner
                partner_id = manager.paired_users.get(user_id)
                if partner_id:
                    logger.info(f"📹 Relaying WebRTC offer: {user_id} -> {partner_id}")
                    await manager.send_to_user(partner_id, {
                        "type": "webrtc_offer",
                        "offer": data.get("offer"),
                        "from_user": user_id
                    })
                else:
                    logger.warning(f"Cannot relay offer - {user_id} has no partner")
                    
            elif message_type == "webrtc_answer":
                # Relay WebRTC answer to partner
                partner_id = manager.paired_users.get(user_id)
                if partner_id:
                    logger.info(f"📹 Relaying WebRTC answer: {user_id} -> {partner_id}")
                    await manager.send_to_user(partner_id, {
                        "type": "webrtc_answer",
                        "answer": data.get("answer"),
                        "from_user": user_id
                    })
                else:
                    logger.warning(f"Cannot relay answer - {user_id} has no partner")
                    
            elif message_type == "webrtc_ice_candidate":
                # Relay ICE candidate to partner
                partner_id = manager.paired_users.get(user_id)
                if partner_id:
                    logger.info(f"🧊 Relaying ICE candidate: {user_id} -> {partner_id}")
                    await manager.send_to_user(partner_id, {
                        "type": "webrtc_ice_candidate",
                        "candidate": data.get("candidate"),
                        "from_user": user_id
                    })
                else:
                    logger.warning(f"Cannot relay ICE candidate - {user_id} has no partner")
                    
            elif message_type == "text_message":
                # Handle text chat message
                partner_id = manager.paired_users.get(user_id)
                
                logger.info(f"💬 Text message from {user_id}: sender={user_id}, partner={partner_id}")
                logger.info(f"🔍 Current pairings: {manager.paired_users}")
                logger.info(f"🔍 Active connections: {list(manager.active_connections.keys())}")
                
                if not partner_id:
                    logger.warning(f"User {user_id} tried to send text message without partner")
                    await websocket.send_json({
                        "type": "error",
                        "message": "No partner connected"
                    })
                    continue
                
                # Critical check: ensure sender and partner are different
                if partner_id == user_id:
                    logger.error(f"🚨 BUG DETECTED: User {user_id} is paired with themselves!")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid pairing - you are paired with yourself"
                    })
                    continue
                
                text = data.get("text", "")
                if not text:
                    continue
                
                logger.info(f"� Message text: '{text[:50]}...'")
                
                # Get languages
                user_lang = manager.user_languages.get(user_id, "en")
                partner_lang = manager.user_languages.get(partner_id, "en")
                
                # Translate if different languages
                if user_lang != partner_lang:
                    logger.info(f"Translating text: {user_lang} -> {partner_lang}")
                    translated_text = await translate_text(text, user_lang, partner_lang)
                else:
                    # Same language, no translation needed
                    translated_text = text
                    logger.info(f"Same language ({user_lang}), sending directly")
                
                # Send translated message to partner
                logger.info(f"🔍 Attempting to send to partner {partner_id}")
                logger.info(f"📝 Original: '{text}', Translated: '{translated_text}'")
                
                if partner_id in manager.active_connections:
                    try:
                        await manager.send_to_user(partner_id, {
                            "type": "text_message_received",
                            "text": translated_text,
                            "original_text": text,
                            "from_user": user_id,
                            "timestamp": data.get("timestamp")
                        })
                        logger.info(f"✅ Text message delivered to {partner_id}")
                    except Exception as e:
                        logger.error(f"❌ Failed to send to partner {partner_id}: {e}")
                else:
                    logger.error(f"❌ Partner {partner_id} not in active_connections!")
                    logger.info(f"Active connections: {list(manager.active_connections.keys())}")
                
                # Confirm to sender
                await websocket.send_json({
                    "type": "text_message_sent",
                    "message_id": data.get("message_id"),
                    "timestamp": data.get("timestamp")
                })
                
            elif message_type == "typing_indicator":
                # Relay typing indicator to partner
                partner_id = manager.paired_users.get(user_id)
                if partner_id:
                    is_typing = data.get("is_typing", False)
                    await manager.send_to_user(partner_id, {
                        "type": "partner_typing",
                        "is_typing": is_typing
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
        partner_id = await manager.disconnect(user_id)
        
        # Clear voice cache for this user
        clear_voice_cache(user_id)
        logger.info(f"Cleared voice cache for disconnected user {user_id}")
        
        if partner_id:
            # Notify partner
            await manager.send_to_user(partner_id, {
                "type": "partner_disconnected"
            })
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        await manager.disconnect(user_id)


@router.get("/stats")
async def get_stats():
    """Get current connection statistics"""
    return {
        "active_connections": len(manager.active_connections),
        "waiting_queue": len(manager.waiting_queue),
        "active_pairs": len(manager.paired_users) // 2
    }
