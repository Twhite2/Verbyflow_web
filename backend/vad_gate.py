"""
VAD-Gated Audio Processing for Faster-Whisper
Implements "soft pause" - only feeds audio to Whisper when speech is detected
"""
import logging
import numpy as np
from collections import deque
from typing import Optional, Tuple
import asyncio

logger = logging.getLogger(__name__)


class VADGate:
    """
    Voice Activity Detection gate that controls when audio is fed to Whisper.
    Implements "soft pause" - model stays loaded, but inference only runs on speech.
    """
    
    def __init__(
        self,
        silence_threshold: float = 0.01,  # RMS threshold for silence
        min_speech_duration_ms: int = 300,  # Minimum speech duration
        max_pause_duration_ms: int = 1500,  # Max pause before ending speech
        trailing_silence_ms: int = 500,  # Keep this much audio before speech
        prolonged_silence_threshold_ms: int = 8000,  # Reset context after this
        token_confidence_threshold: float = 0.4,  # Reject low-confidence tokens
        sample_rate: int = 16000
    ):
        self.silence_threshold = silence_threshold
        self.min_speech_duration_ms = min_speech_duration_ms
        self.max_pause_duration_ms = max_pause_duration_ms
        self.trailing_silence_ms = trailing_silence_ms
        self.prolonged_silence_threshold_ms = prolonged_silence_threshold_ms
        self.token_confidence_threshold = token_confidence_threshold
        self.sample_rate = sample_rate
        
        # State tracking
        self.is_speaking = False
        self.last_speech_time = 0
        self.speech_start_time = 0
        self.silence_duration = 0
        
        # Audio buffers
        # Trailing silence buffer - keeps audio before speech starts
        max_trailing_samples = int((trailing_silence_ms / 1000) * sample_rate)
        self.trailing_buffer = deque(maxlen=max_trailing_samples)
        
        # Speech buffer - accumulates audio during speech
        self.speech_buffer = []
        
        # Context reset flag
        self.needs_context_reset = False
        
        logger.info(f"VAD Gate initialized: silence_threshold={silence_threshold}, "
                   f"max_pause={max_pause_duration_ms}ms, trailing={trailing_silence_ms}ms")
    
    def calculate_rms(self, audio_data: np.ndarray) -> float:
        """Calculate RMS (Root Mean Square) energy of audio"""
        return np.sqrt(np.mean(audio_data.astype(np.float32) ** 2))
    
    def detect_speech(self, audio_chunk: np.ndarray) -> bool:
        """Detect if audio chunk contains speech based on RMS energy"""
        rms = self.calculate_rms(audio_chunk)
        return rms > self.silence_threshold
    
    def should_reset_context(self) -> bool:
        """Check if context should be reset due to prolonged silence"""
        return self.needs_context_reset
    
    def process_chunk(
        self,
        audio_chunk: np.ndarray,
        current_time_ms: int
    ) -> Tuple[Optional[np.ndarray], str]:
        """
        Process an audio chunk through the VAD gate.
        
        Returns:
            (audio_to_transcribe, state)
            - audio_to_transcribe: Audio data to send to Whisper, or None
            - state: One of "silence", "speech_started", "speaking", "speech_ended"
        """
        has_speech = self.detect_speech(audio_chunk)
        
        # Calculate silence duration
        if not has_speech:
            if self.is_speaking:
                self.silence_duration = current_time_ms - self.last_speech_time
            else:
                self.silence_duration += 50  # Assume ~50ms chunks
        else:
            self.silence_duration = 0
            self.last_speech_time = current_time_ms
        
        # State machine
        if has_speech:
            # SPEECH DETECTED
            if not self.is_speaking:
                # Speech just started
                self.is_speaking = True
                self.speech_start_time = current_time_ms
                self.needs_context_reset = False
                
                # Include trailing silence buffer for smooth start
                if len(self.trailing_buffer) > 0:
                    self.speech_buffer = list(self.trailing_buffer)
                    logger.debug(f"🎤 Speech started (with {len(self.trailing_buffer)} trailing chunks)")
                else:
                    self.speech_buffer = []
                    logger.debug("🎤 Speech started")
                
                # Add current chunk
                self.speech_buffer.append(audio_chunk)
                return None, "speech_started"
            else:
                # Continue speaking
                self.speech_buffer.append(audio_chunk)
                return None, "speaking"
        
        else:
            # SILENCE DETECTED
            if self.is_speaking:
                # We were speaking, check pause duration
                if self.silence_duration < self.max_pause_duration_ms:
                    # Natural pause - keep collecting
                    self.speech_buffer.append(audio_chunk)
                    return None, "speaking"
                else:
                    # Long pause - end of speech
                    logger.debug(f"🔇 Speech ended (pause: {self.silence_duration}ms)")
                    
                    # Check if speech was long enough
                    speech_duration_ms = current_time_ms - self.speech_start_time
                    if speech_duration_ms < self.min_speech_duration_ms:
                        logger.debug(f"⏭️ Speech too short ({speech_duration_ms}ms), skipping")
                        self.is_speaking = False
                        self.speech_buffer = []
                        self.trailing_buffer.clear()
                        return None, "silence"
                    
                    # Return accumulated speech for transcription
                    if len(self.speech_buffer) > 0:
                        audio_to_transcribe = np.concatenate(self.speech_buffer)
                        self.speech_buffer = []
                        self.is_speaking = False
                        
                        # Mark for context reset if silence is prolonged
                        if self.silence_duration > self.prolonged_silence_threshold_ms:
                            self.needs_context_reset = True
                            logger.debug(f"⚠️ Prolonged silence ({self.silence_duration}ms), will reset context")
                        
                        return audio_to_transcribe, "speech_ended"
                    else:
                        self.is_speaking = False
                        return None, "silence"
            else:
                # Not speaking, pure silence
                # Add to trailing buffer for next speech segment
                self.trailing_buffer.append(audio_chunk)
                
                # Check for prolonged silence
                if self.silence_duration > self.prolonged_silence_threshold_ms:
                    if not self.needs_context_reset:
                        self.needs_context_reset = True
                        logger.debug(f"⚠️ Prolonged silence ({self.silence_duration}ms), context reset needed")
                
                return None, "silence"
    
    def filter_low_confidence_tokens(self, segments, min_confidence: float = None) -> list:
        """
        Filter out low-confidence tokens from transcription segments.
        This prevents hallucinations from being output.
        """
        if min_confidence is None:
            min_confidence = self.token_confidence_threshold
        
        filtered_segments = []
        for segment in segments:
            # Check average log probability (confidence)
            if hasattr(segment, 'avg_logprob'):
                # Convert log prob to confidence (roughly)
                confidence = np.exp(segment.avg_logprob)
                
                if confidence >= min_confidence:
                    filtered_segments.append(segment)
                else:
                    logger.debug(f"🚫 Filtered low-confidence segment: '{segment.text}' "
                               f"(confidence: {confidence:.2f})")
            else:
                # No confidence info, keep it
                filtered_segments.append(segment)
        
        return filtered_segments
    
    def detect_repetition(self, text: str, max_repetition_ratio: float = 0.5) -> bool:
        """
        Detect if text contains excessive repetition (hallucination indicator).
        Returns True if text is repetitive (should be filtered).
        """
        if not text or len(text.split()) < 4:
            return False
        
        words = text.lower().split()
        unique_words = set(words)
        unique_ratio = len(unique_words) / len(words)
        
        if unique_ratio < max_repetition_ratio:
            logger.debug(f"🚫 Detected repetitive text (unique ratio: {unique_ratio:.2f}): '{text}'")
            return True
        
        return False
    
    def reset(self):
        """Reset VAD gate state (call when starting new session)"""
        self.is_speaking = False
        self.last_speech_time = 0
        self.speech_start_time = 0
        self.silence_duration = 0
        self.speech_buffer = []
        self.trailing_buffer.clear()
        self.needs_context_reset = False
        logger.info("VAD Gate reset")


class HallucinationFilter:
    """
    Post-processing filter to catch hallucinations that slip through VAD.
    Uses heuristics and patterns to detect nonsense output.
    """
    
    # Common hallucination patterns in different languages
    HALLUCINATION_PATTERNS = [
        # English
        r'\bthank you\b.*\bthank you\b',
        r'\bgoodbye\b.*\bgoodbye\b',
        r'\bsubtitles?\b.*\bsubtitles?\b',
        
        # French
        r'\bmerci\b.*\bmerci\b',
        r'\bau revoir\b.*\bau revoir\b',
        r'\bvisa pour le visa\b',
        
        # Spanish
        r'\bgracias\b.*\bgracias\b',
        r'\badiós\b.*\badiós\b',
        
        # Repetitive single words
        r'\b(\w+)\s+\1\s+\1\b',  # word word word
        
        # Generic repetition
        r'(.{5,})\s+\1\s+\1',  # phrase phrase phrase
    ]
    
    @staticmethod
    def is_hallucination(text: str) -> bool:
        """
        Check if text matches known hallucination patterns.
        Returns True if text appears to be a hallucination.
        """
        import re
        
        text_lower = text.lower()
        
        for pattern in HallucinationFilter.HALLUCINATION_PATTERNS:
            if re.search(pattern, text_lower):
                logger.debug(f"🚫 Detected hallucination pattern: '{text}'")
                return True
        
        # Check for excessive punctuation (another hallucination sign)
        if text.count('.') > 5 or text.count('?') > 3:
            logger.debug(f"🚫 Excessive punctuation detected: '{text}'")
            return True
        
        return False
    
    @staticmethod
    def clean_text(text: str) -> str:
        """
        Clean and normalize transcribed text.
        Remove artifacts and normalize whitespace.
        """
        # Remove multiple spaces
        text = ' '.join(text.split())
        
        # Remove leading/trailing punctuation oddities
        text = text.strip('.,!?;: ')
        
        return text
