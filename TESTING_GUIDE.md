# 🧪 VerbyFlow Testing Guide

## Quick Test Steps

### 1. Start Both Servers

**Terminal 1 - Backend:**
```bash
cd backend
python main.py
```
Wait for: `INFO: Application startup complete.`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Wait for: `✓ Ready in X.Xs`

### 2. Open Two Browser Windows

Open **TWO** browser windows/tabs at: http://localhost:3000

### 3. Setup Window 1 (English Speaker)

1. **Select Language:** English (top-right dropdown)
2. **Capture Voice:**
   - Click **"Capture Voice (10s)"** button
   - **Speak clearly for 10 seconds**: 
     - "Hello, my name is John. I am testing the voice translation system. The weather is nice today. I like to read books and listen to music."
   - Wait for button to change to **"Find Partner"**
3. **Find Partner:** Click **"Find Partner"**
4. Wait for **"Partner connected!"** message

### 4. Setup Window 2 (French Speaker)

1. **Select Language:** French (top-right dropdown)
2. **Capture Voice:**
   - Click **"Capture Voice (10s)"** button
   - **Speak clearly for 10 seconds** (in any language):
     - "Bonjour, je m'appelle Marie. Je teste le système de traduction vocale. Il fait beau aujourd'hui. J'aime lire et écouter de la musique."
   - Wait for button to change to **"Find Partner"**
3. **Find Partner:** Click **"Find Partner"**
4. Should automatically pair with Window 1

### 5. Test Voice Translation

**In Window 1 (English):**
- Click the **purple microphone button** to start recording
- Say: **"Hello, how are you today?"**
- Click microphone again to stop

**Expected Result in Window 2:**
- ✅ Shows translated text: "Bonjour, comment allez-vous aujourd'hui ?"
- ✅ Shows original text in italics: "Original: Hello, how are you today?"
- ✅ **Plays audio** in Window 1's voice, speaking French!

**In Window 2 (French):**
- Click the microphone button
- Say: **"Je vais bien, merci!"**
- Stop recording

**Expected Result in Window 1:**
- ✅ Shows translated text: "I'm doing well, thank you!"
- ✅ Shows original text: "Original: Je vais bien, merci!"
- ✅ **Plays audio** in Window 2's voice, speaking English!

## What Should Happen

### Backend Logs (Expected)
```
INFO - User user_abc123 connected (language: en)
INFO - User user_xyz789 connected (language: fr)
INFO - Stored voice sample for user user_abc123
INFO - Stored voice sample for user user_xyz789
INFO - Paired user_abc123 (en) with user_xyz789 (fr)
INFO - Transcribed text: 'Hello, how are you today?' (en -> fr)
INFO - Translated to: 'Bonjour, comment allez-vous aujourd'hui ?'
INFO - Generating TTS for text: 'Bonjour, comment allez-vous aujourd...' in language: fr
INFO - Generated voice from reference audio
INFO - Generated 125000 bytes of audio
```

### Frontend (Expected)
- Text appears in both windows
- Audio plays automatically on receiving end
- No errors in browser console

## Common Issues & Solutions

### Issue 1: No Translation (Same Language Both Sides)

**Symptom:** "English to english" or same text on both sides

**Solution:**
1. **Before pairing:** Make sure to select DIFFERENT languages
2. **If already connected:** 
   - Change language in dropdown
   - Connection will reset automatically
   - Re-capture voice sample
   - Find partner again

### Issue 2: No Audio Playback

**Symptom:** Text appears but no sound

**Backend Error:**
```
ERROR - TTS Error: a bytes-like object is required, not 'list'
```

**Solution:** ✅ FIXED - Update applied

**Browser Console Error:**
```
Failed to decode audio: ...
```

**Solution:**
- Check browser console for specific error
- Audio should now work with WAV header
- Make sure to capture voice sample first

### Issue 3: Translation Not Working

**Backend Logs:**
```
INFO - Transcribed text: '...' (en -> en)
```

**Solution:**
- Languages are the same on both sides
- **Disconnect both users**
- Set DIFFERENT languages before pairing
- Recapture voice samples
- Find partners again

### Issue 4: Voice Sample Not Captured

**Symptom:** Button doesn't change to "Find Partner"

**Solution:**
- Check microphone permissions
- Speak during the 10-second recording
- Don't stay silent
- Restart browser if needed
- Check browser console for errors

### Issue 5: Can't Hear Anything

**Checklist:**
- ✅ Volume is up
- ✅ Not muted in browser tab
- ✅ Audio devices working
- ✅ Voice sample was captured
- ✅ Backend logs show "Generated X bytes of audio"
- ✅ Browser console shows "Playing audio"

## Architecture Flow

```
Window 1 (English)                    Backend                     Window 2 (French)
================                      =======                     ================

User speaks English
     ↓
Capture audio (16kHz PCM)
     ↓
Send via WebSocket ─────────────→ Receive audio
                                        ↓
                                   STT (Whisper)
                                   "Hello" (en)
                                        ↓
                                   Translation
                                   "Bonjour" (fr)
                                        ↓
                                   TTS (XTTS v2)
                                   + Voice Sample
                                   → Audio bytes
                                        ↓
                            Send via WebSocket ───────────→ Receive audio
                                                                   ↓
                                                            Add WAV header
                                                                   ↓
                                                            Play via Web Audio API
                                                                   ↓
                                                            User hears French
                                                            in Window 1's voice!
```

## Performance Notes

- **STT (Whisper):** ~0.5-1s per chunk
- **Translation:** ~0.1-0.3s
- **TTS (XTTS v2):** ~2-4s per sentence (GPU), ~10-20s (CPU)
- **Total latency:** ~3-6s with GPU, ~12-22s with CPU

## Tips for Best Results

### Voice Sample (10 seconds)
- ✅ Speak naturally, not robotically
- ✅ Vary your intonation
- ✅ Use complete sentences
- ✅ Quiet environment
- ❌ Don't whisper or shout
- ❌ Don't stay silent
- ❌ Don't use music in background

### During Conversation
- Speak clearly and pause between sentences
- Wait for translation to complete before speaking again
- Shorter sentences = faster translation
- Avoid very long monologues

## Debugging Commands

### Check Backend Status
```bash
# Backend should show:
INFO: Application startup complete.
INFO: Uvicorn running on http://0.0.0.0:8000
```

### Check Frontend Status
```bash
# Frontend should show:
✓ Ready in X.Xs
- Local: http://localhost:3000
```

### Check Browser Console
```javascript
// Should see:
WebSocket connected
Voice sample stored on server
Paired with partner
Received audio chunk
Playing audio
```

### Check Backend Logs for User
```
INFO - User user_xxx connected (language: en)
INFO - Stored voice sample for user user_xxx
INFO - Paired user_xxx (en) with user_yyy (fr)
INFO - Transcribed text: '...' (en -> fr)
INFO - Translated to: '...'
INFO - Generated X bytes of audio
```

## Success Criteria

✅ Both users can connect and pair
✅ Voice samples are captured (10s each)
✅ Speech is transcribed correctly
✅ Translation happens between different languages
✅ Audio plays on receiving end
✅ Voice cloning works (sounds like sender)
✅ No errors in backend or frontend logs

---

**Last Updated:** 2025-11-03
**Status:** ✅ All issues fixed and ready to test
