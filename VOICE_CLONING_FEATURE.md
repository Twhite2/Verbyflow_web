# 🎤 Voice Cloning Feature - XTTS v2

## Overview

VerbyFlow now uses **voice cloning** with XTTS v2! Each user records a 10-second voice sample, which is then used to synthesize speech in their voice when translating to their partner.

## How It Works

### 1. Voice Sample Capture (10 seconds)
- When you first connect, you'll see a **"Capture Voice (10s)"** button
- Click it to record 10 seconds of your voice
- **Speak clearly during this time** - this will be your voice clone!
- The button shows a countdown: "Recording voice sample... (10s)"

### 2. Voice Sample Storage
- Your voice sample is sent to the backend
- Backend stores it temporarily (for your session only)
- Voice sample is used for TTS generation

### 3. Real-time Translation with Voice Cloning
**Flow:**
```
User A speaks (English) 
  ↓
  STT (Whisper) → "Hello, how are you?"
  ↓
  Translation → "Hola, ¿cómo estás?"
  ↓
  TTS (XTTS v2 + User A's voice) → Audio in User A's voice
  ↓
  User B hears User A's voice speaking Spanish!
```

## Technical Implementation

### Frontend Changes
**File: `frontend/lib/store.ts`**
- Added `voiceSampleCaptured` and `isCapturingVoice` states
- Added `captureVoiceSample()` function - records 10 seconds of audio
- Added `sendVoiceSample()` function - sends sample to backend

**File: `frontend/components/ChatInterface.tsx`**
- Added "Capture Voice (10s)" button
- Only shows "Find Partner" after voice sample is captured
- Shows recording progress during capture

### Backend Changes
**File: `backend/sockets.py`**
- Added `voice_samples` dictionary to ConnectionManager
- Added `voice_sample` message handler
- Passes voice sample to `process_text_to_audio()`

**File: `backend/tts.py`**
- Accepts `voice_sample` parameter (base64 PCM audio)
- Converts PCM to WAV format
- Passes to XTTS v2 as `speaker_wav`
- XTTS clones the voice and synthesizes speech

## User Flow

1. **Open VerbyFlow** → http://localhost:3000
2. **Select your language** (e.g., Spanish)
3. **Click "Capture Voice (10s)"** → Speak naturally for 10 seconds
4. **Wait for completion** → Voice sample uploaded
5. **Click "Find Partner"** → Match with another user
6. **Start speaking** → Your speech is transcribed, translated, and synthesized in YOUR voice
7. **Partner hears you** → In their language, but in YOUR voice!

## Voice Sample Tips

### For Best Results:
- ✅ **Speak clearly** and naturally
- ✅ **Vary your intonation** - read a sentence or paragraph
- ✅ **Use a quiet environment** - minimize background noise
- ✅ **Speak at normal volume** - not too loud or soft

### What to Say (Examples):
- Read a paragraph from a book
- Describe your day
- Count from 1 to 20 with expression
- Tell a short story

### What NOT to Do:
- ❌ Don't whisper or shout
- ❌ Don't record in noisy environments
- ❌ Don't just stay silent
- ❌ Don't use music or other audio

## Technical Details

### Audio Format
- **Recording:** 16-bit PCM @ 16kHz (mono)
- **Duration:** 10 seconds (~320KB)
- **Encoding:** Base64 for transmission
- **Storage:** Temporary (in-memory, session only)

### XTTS v2 Requirements
- **Speaker WAV:** Minimum 6 seconds recommended
- **Format:** Converted to WAV before passing to XTTS
- **Parameters:** `speaker_wav` parameter for voice cloning
- **Languages:** 17 languages supported

### Model Info
- **TTS Model:** `tts_models/multilingual/multi-dataset/xtts_v2`
- **Size:** ~2GB
- **Performance:** ~2-4 seconds per sentence (GPU)
- **Quality:** High-quality voice cloning

## Privacy & Security

- ✅ **No permanent storage** - voice samples deleted after session
- ✅ **In-memory only** - not saved to disk
- ✅ **Session-based** - cleared on disconnect
- ✅ **No database** - completely ephemeral

## Testing

1. **Test voice capture:**
   ```bash
   # Start backend
   cd backend
   python main.py
   
   # Start frontend
   cd frontend
   npm run dev
   ```

2. **Open browser:** http://localhost:3000

3. **Test flow:**
   - Click "Capture Voice" and speak for 10 seconds
   - Check backend logs: `INFO - Stored voice sample for user {user_id}`
   - Click "Find Partner"
   - Pair with another window
   - Speak and verify synthesized audio uses your voice

## Troubleshooting

### Voice sample not capturing
- Check microphone permissions
- Ensure browser supports MediaRecorder API
- Check browser console for errors

### TTS failing
```
ERROR: Neither `speaker_wav` nor `speaker_id` was specified
```
**Solution:** Capture voice sample before finding partner

### Voice quality poor
- Re-record with better audio quality
- Speak more clearly
- Reduce background noise
- Ensure 10-second sample is complete

### Model not loading
```
ERROR: Failed to load TTS model
```
**Solution:** 
- Run `pip install coqui-tts`
- Wait for model download (~2GB)
- Check GPU/CUDA availability

## Future Enhancements

Potential improvements:
- Multiple voice presets per user
- Voice sample preview before submission
- Option to re-record voice sample
- Speaker verification
- Voice enhancement/filtering
- Emotion detection and transfer

---

**Status:** ✅ Implemented and ready to test!
