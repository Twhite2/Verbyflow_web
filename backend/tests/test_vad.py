# test_vad.py
import numpy as np
import pytest
from realtime_audio_processor import RealtimeAudioProcessor, VAD_MIN_SPEECH_FRAMES, VAD_SILENCE_FRAMES


@pytest.fixture
def processor():
    return RealtimeAudioProcessor("test", "en", "en")


def make_frame(amplitude: float) -> tuple[np.ndarray, bytes]:
    """Helper: generate a 320-sample frame at given amplitude, return (float32, bytes)."""
    frame = (np.random.randn(320) * amplitude).astype(np.float32)
    frame_bytes = (frame * 32768).astype(np.int16).tobytes()
    return frame, frame_bytes


# ── Noise gate ────────────────────────────────────────────────────────────────

class TestNoiseGate:
    def test_attenuates_below_threshold(self, processor):
        """Signal below gate threshold must be reduced on average, not passed through."""
        frame, _ = make_frame(0.001)  # well below threshold of 0.003
        gated = processor._apply_noise_gate(frame)
        assert np.mean(np.abs(gated)) < np.mean(np.abs(frame)), \
            "Noise gate did not attenuate sub-threshold signal on average"

    def test_soft_knee_no_hard_zero(self, processor):
        """Gate must use soft knee — signal should be attenuated, not zeroed."""
        frame = np.full(320, 0.001, dtype=np.float32)
        gated = processor._apply_noise_gate(frame)
        assert np.all(gated > 0), "Noise gate hard-zeroed signal (should be soft knee)"

    def test_passes_loud_signal_unchanged(self, processor):
        """Signal well above threshold should pass through unmodified."""
        frame = np.full(320, 0.1, dtype=np.float32)
        gated = processor._apply_noise_gate(frame)
        np.testing.assert_allclose(gated, frame, rtol=1e-5)


# ── Audio metrics ─────────────────────────────────────────────────────────────

class TestAudioMetrics:
    def test_rms_known_signal(self, processor):
        """RMS of a constant signal should equal its absolute value."""
        frame = np.full(320, 0.05, dtype=np.float32)
        rms, _ = processor._audio_metrics(frame)
        assert abs(rms - 0.05) < 1e-5

    def test_peak_known_signal(self, processor):
        """Peak should be the max absolute value in the frame."""
        frame = np.zeros(320, dtype=np.float32)
        frame[100] = 0.08
        _, peak = processor._audio_metrics(frame)
        assert abs(peak - 0.08) < 1e-5

    def test_rms_less_than_peak(self, processor):
        """RMS must always be <= peak for any signal."""
        frame, _ = make_frame(0.05)
        rms, peak = processor._audio_metrics(frame)
        assert rms <= peak


# ── VAD detection ─────────────────────────────────────────────────────────────

class TestVAD:
    def test_silence_not_detected_as_speech(self, processor):
        frame, _ = make_frame(0.001)
        gated = processor._apply_noise_gate(frame)
        assert not processor._compute_vad(gated), \
            "Silence was incorrectly detected as speech"

    def test_speech_detected(self, processor):
        frame, _ = make_frame(0.1)
        gated = processor._apply_noise_gate(frame)
        assert processor._compute_vad(gated), \
            "Speech was not detected"

    def test_borderline_noise_rejected(self, processor):
        """Signal at gate threshold should be attenuated below VAD thresholds."""
        frame, _ = make_frame(0.003)
        gated = processor._apply_noise_gate(frame)
        assert not processor._compute_vad(gated), \
            "Borderline noise leaked through gate and triggered VAD"

    def test_transient_peak_detected(self, processor):
        """Short transient (high peak, low RMS) should still be detected as speech."""
        frame = np.zeros(320, dtype=np.float32)
        frame[160] = 0.08   # single spike: high peak, near-zero RMS
        gated = processor._apply_noise_gate(frame)
        assert processor._compute_vad(gated), \
            "Transient peak was not detected (peak threshold not working)"


# ── State machine ─────────────────────────────────────────────────────────────

class TestStateMachine:
    @pytest.fixture
    def proc_with_callback(self):
        p = RealtimeAudioProcessor("test2", "en", "en")
        emitted = []
        p.result_callback = lambda r: emitted.append(r)
        return p, emitted

    def _send_frames(self, processor, amplitude: float, count: int):
        for _ in range(count):
            _, frame_bytes = make_frame(amplitude)
            processor._process_audio_frame(frame_bytes, 0.0)

    def test_noise_burst_discarded(self, proc_with_callback):
        """Fewer than VAD_MIN_SPEECH_FRAMES speech frames must not emit."""
        p, emitted = proc_with_callback
        self._send_frames(p, 0.1, VAD_MIN_SPEECH_FRAMES - 1)   # just under minimum
        self._send_frames(p, 0.001, VAD_SILENCE_FRAMES + 5)    # enough silence to trigger end
        assert len(emitted) == 0, \
            f"Noise burst triggered transcription ({len(emitted)} results emitted)"

    def test_speech_start_sets_in_speech(self, proc_with_callback):
        """in_speech flag must be set after sufficient speech frames."""
        p, _ = proc_with_callback
        self._send_frames(p, 0.1, VAD_MIN_SPEECH_FRAMES + 1)
        assert p.in_speech, "in_speech not set after speech frames"

    def test_silence_resets_state(self, proc_with_callback):
        """After silence ends an utterance, state must be fully reset."""
        p, _ = proc_with_callback
        self._send_frames(p, 0.1, VAD_MIN_SPEECH_FRAMES + 1)
        self._send_frames(p, 0.001, VAD_SILENCE_FRAMES + 5)
        assert not p.in_speech, "in_speech not cleared after silence"
        assert p.speech_frame_count == 0, "speech_frame_count not reset"
        assert p.silence_frame_count == 0, "silence_frame_count not reset"
        assert len(p.audio_buffer) == 0, "audio_buffer not cleared"

    def test_pre_speech_buffer_bounded(self, proc_with_callback):
        """Pre-speech buffer must never exceed max_pre_speech_frames."""
        p, _ = proc_with_callback
        self._send_frames(p, 0.001, p.max_pre_speech_frames * 3)
        assert len(p.pre_speech_buffer) <= p.max_pre_speech_frames, \
            "Pre-speech buffer grew beyond max size"

    def test_tts_active_blocks_processing(self, proc_with_callback):
        """Frames received while tts_active=True must not affect state."""
        p, _ = proc_with_callback
        p.tts_active = True
        self._send_frames(p, 0.1, VAD_MIN_SPEECH_FRAMES + 5)
        assert not p.in_speech, "State changed while tts_active was True"
        assert len(p.audio_buffer) == 0, "Audio buffered while tts_active was True"