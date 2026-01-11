"""
Real-time Audio Processor using Faster-Whisper streaming
Implements hybrid architecture: Frontend AudioWorklet → WebSocket → Backend Processing
Complies with Master Spec: 20ms frames, continuous flow, silence as data
"""

import queue
import threading
import time
import logging
import numpy as np
import torch
from typing import Optional, Callable, Dict
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Silero VAD
try:
    from silero_vad import load_silero_vad, get_speech_timestamps
    SILERO_AVAILABLE = True
except ImportError:
    logger.warning("Silero VAD not available, using simple RMS VAD")
    SILERO_AVAILABLE = False


class RealtimeAudioProcessor:
    """
    Real-time audio processor with streaming ASR
    - Receives 20ms frames via WebSocket
    - Continuous processing (silence as data)
    - Partials → UI only
    - Finals → Translation + TTS
    - Interruptible TTS
    """
    
    def __init__(self, user_id: str, source_lang: str, target_lang: str, voice_sample: Optional[bytes] = None):
        self.user_id = user_id
        self.source_lang = source_lang
        self.target_lang = target_lang
        self.voice_sample = voice_sample
        
        # Audio processing
        self.audio_queue = queue.Queue(maxsize=50)  # 1 second buffer (increased from 10)
        self.is_running = True
        
        # VAD state
        self.silence_duration = 0.0
        self.last_speech_time = 0.0
        self.vad_threshold = 0.5
        
        # ASR state
        self.audio_buffer = []  # Accumulate for streaming ASR
        self.last_partial = ""
        self.last_partial_time = 0.0
        self.transcription_pending = False  # Prevent duplicate transcriptions
        
        # Thresholds (frame-counted, deterministic)
        self.commit_silence_ms = 500  # 25 frames
        self.reset_silence_ms = 700   # 35 frames
        self.frame_ms = 20
        
        # TTS state
        self.tts_active = False
        
        # Callbacks
        self.result_callback: Optional[Callable] = None
        self.event_loop = None  # Store event loop reference for async callbacks
        
        # Models (lazy loaded in thread)
        self.whisper_model: Optional[WhisperModel] = None
        self.vad_model = None
        
        # Instrumentation
        self.frame_count = 0
        self.start_time = time.time()
        
        logger.info(f"✅ RealtimeAudioProcessor created: {user_id} ({source_lang} -> {target_lang})")
    
    async def initialize(self):
        """Load models in thread pool (non-blocking)"""
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        logger.info(f"⏳ Loading models for {self.source_lang}...")
        
        # Capture event loop for async callbacks from threads
        self.event_loop = asyncio.get_event_loop()
        
        executor = ThreadPoolExecutor(max_workers=1)
        
        # Load models in thread
        await self.event_loop.run_in_executor(executor, self._load_models)
        
        logger.info(f"✅ Models loaded for {self.user_id}")
    
    def _load_models(self):
        """Load Whisper and VAD models (blocking)"""
        # Load Faster-Whisper
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "int8_float16" if device == "cuda" else "int8"
            
            logger.info(f"Loading Whisper model on {device}...")
            self.whisper_model = WhisperModel(
                "base",  # Fast model for streaming
                device=device,
                compute_type=compute_type,
                num_workers=2
            )
            logger.info(f"✅ Whisper loaded on {device}")
        except Exception as e:
            logger.error(f"Failed to load Whisper: {e}")
            raise
        
        # Load VAD
        if SILERO_AVAILABLE:
            try:
                self.vad_model, _ = load_silero_vad()
                logger.info("✅ Silero VAD loaded")
            except Exception as e:
                logger.warning(f"Silero VAD failed: {e}, using RMS fallback")
                self.vad_model = None
        else:
            self.vad_model = None
    
    def start_processing(self):
        """Start background processing thread"""
        self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.processing_thread.start()
        logger.info(f"🎬 Processing thread started for {self.user_id}")
    
    def process_frame(self, frame_bytes: bytes):
        """
        Receive 20ms frame from WebSocket
        Push to bounded queue (non-blocking)
        """
        try:
            self.audio_queue.put_nowait(frame_bytes)
        except queue.Full:
            logger.warning(f"⚠️ VIOLATION: Queue full for {self.user_id} - frame dropped")
    
    def _processing_loop(self):
        """
        Main processing loop (runs in thread)
        Pulls frames from queue and processes
        """
        while self.is_running:
            try:
                start_time = time.time()
                
                # Block until frame available
                frame_bytes = self.audio_queue.get(timeout=1.0)
                
                # Process frame
                self._process_audio_frame(frame_bytes, start_time)
                
                # Instrumentation with component breakdown
                proc_time = time.time() - start_time
                
                # Only log violations if significantly over budget
                if proc_time > (self.frame_ms / 1000) * 1.5:
                    logger.warning(f"⚠️ Frame proc: {proc_time*1000:.1f}ms (target: {self.frame_ms}ms)")
                
                self.frame_count += 1
                
                # Periodic performance report
                if self.frame_count % 1000 == 0:
                    elapsed = time.time() - self.start_time
                    fps = self.frame_count / elapsed
                    logger.info(f"📊 Performance: {self.frame_count} frames in {elapsed:.1f}s ({fps:.1f} fps)")
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Processing error: {e}", exc_info=True)
    
    def _process_audio_frame(self, frame_bytes: bytes, timestamp: float):
        """
        Process single 20ms frame
        - VAD annotation (fast)
        - Accumulate for ASR (fast)
        - Only transcribe on silence boundaries (slow, async)
        """
        # Decode frame (fast: <1ms)
        frame_np = np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        
        # VAD (fast: ~1ms)
        is_speech = self._compute_vad(frame_np)
        
        if is_speech:
            self.silence_duration = 0.0
            self.last_speech_time = timestamp
            
            # Interrupt TTS if speaking
            if self.tts_active:
                logger.info(f"🛑 Interrupted TTS for {self.user_id}")
                self.tts_active = False
                if self.result_callback:
                    self.result_callback({
                        'type': 'tts_interrupt',
                        'user_id': self.user_id
                    })
        else:
            self.silence_duration += self.frame_ms / 1000
        
        # Accumulate audio (fast: append to list)
        self.audio_buffer.extend(frame_np)
        
        # ONLY transcribe ONCE on silence boundaries
        # Reset flag when speech resumes
        if is_speech:
            self.transcription_pending = False
        
        # Transcribe on silence boundary (once per utterance)
        if self.silence_duration > self.commit_silence_ms / 1000:
            if not self.transcription_pending and len(self.audio_buffer) > 1600:
                self.transcription_pending = True  # Prevent re-transcribing during same silence
                self._transcribe_async(timestamp)
                self.audio_buffer = []
        
        # Force transcription if buffer too large (safety)
        elif len(self.audio_buffer) >= 16000 * 4:
            if not self.transcription_pending:
                self.transcription_pending = True
                self._transcribe_async(timestamp)
                self.audio_buffer = []
    
    def _compute_vad(self, frame: np.ndarray) -> bool:
        """Compute VAD (speech/silence)"""
        if self.vad_model is not None:
            # Silero VAD
            try:
                frame_torch = torch.from_numpy(frame)
                prob = self.vad_model(frame_torch, 16000).item()
                return prob >= self.vad_threshold
            except Exception as e:
                logger.error(f"VAD error: {e}")
                return self._rms_vad(frame)
        else:
            # RMS fallback
            return self._rms_vad(frame)
    
    def _rms_vad(self, frame: np.ndarray) -> bool:
        """Simple RMS-based VAD"""
        rms = np.sqrt(np.mean(frame ** 2))
        return rms > 0.01
    
    def _transcribe_async(self, timestamp: float):
        """
        Transcribe accumulated audio buffer
        This is the ONLY place transcription happens
        Runs in separate thread to not block frame processing
        """
        if not self.audio_buffer or not self.whisper_model:
            return
        
        # Copy buffer and clear immediately to not block
        audio_np = np.array(self.audio_buffer, dtype=np.float32)
        
        # Run transcription in thread
        import threading
        
        def transcribe():
            try:
                # Transcribe (this is slow: ~500-1000ms)
                segments, info = self.whisper_model.transcribe(
                    audio_np,
                    language=self.source_lang,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    vad_filter=False,
                    condition_on_previous_text=False
                )
                
                # Extract text
                text_parts = []
                for segment in segments:
                    text_parts.append(segment.text.strip())
                
                text = " ".join(text_parts).strip()
                
                if text and len(text) > 2:
                    logger.info(f"✅ Transcribed: '{text}'")
                    
                    # Send final to callback (handle async callbacks)
                    if self.result_callback and self.event_loop:
                        result = {
                            'type': 'final',
                            'text': text,
                            'user_id': self.user_id,
                            'timestamp': timestamp,
                            'source_lang': self.source_lang,
                            'target_lang': self.target_lang
                        }
                        # Schedule async callback in captured event loop
                        import asyncio
                        try:
                            if asyncio.iscoroutinefunction(self.result_callback):
                                asyncio.run_coroutine_threadsafe(self.result_callback(result), self.event_loop)
                            else:
                                self.result_callback(result)
                        except Exception as cb_error:
                            logger.error(f"Callback error: {cb_error}", exc_info=True)
            except Exception as e:
                logger.error(f"Transcription error: {e}", exc_info=True)
        
        # Start transcription thread
        threading.Thread(target=transcribe, daemon=True).start()
    
    def set_result_callback(self, callback: Callable):
        """Set callback for results"""
        self.result_callback = callback
    
    def stop(self):
        """Stop processing"""
        self.is_running = False
        logger.info(f"🛑 Stopped processor for {self.user_id}")
