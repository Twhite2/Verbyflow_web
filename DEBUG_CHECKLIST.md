# 🔍 Audio Debugging Checklist

## ✅ Fixes Applied

### 1. **Stack Overflow Fixed (audioUtils.ts line 60)**
- **Problem:** `String.fromCharCode(...new Uint8Array(int16.buffer))` with 64KB+ arrays
- **Solution:** Process in 8KB chunks like voice sample code
- **Status:** ✅ FIXED

### 2. **Stack Overflow Fixed (store.ts line 288)**  
- **Problem:** Same issue in voice sample combination
- **Solution:** Chunked processing
- **Status:** ✅ FIXED

### 3. **Sample Rate Verified**
- XTTS v2 outputs at **24000 Hz** (24kHz)
- Frontend expects 24000 Hz
- **Status:** ✅ CORRECT

## 🧪 Testing Steps

### Step 1: Check Backend Logs

Start backend and look for these logs when testing:

```bash
cd backend
python main.py
```

**Expected logs:**
```
INFO - User user_xxx connected (language: en)
INFO - Stored voice sample for user user_xxx
INFO - Paired user_xxx (en) with user_yyy (fr)
INFO - Transcribed text: 'hello' (en -> fr)
INFO - Translated to: 'bonjour'
INFO - Using voice sample for user user_xxx (426667 chars)  ← MUST see this!
INFO - Generating TTS for text: 'bonjour' in language: fr
INFO - Generated voice from reference audio
INFO - Generated 125000 bytes of audio
INFO - TTS generated 166667 chars of base64 audio  ← MUST see this!
```

### Step 2: Check Frontend Console

Open browser console (F12) and look for:

**When capturing voice:**
```
Voice sample: 5 chunks, 320000 bytes, 426667 base64 chars
Voice sample stored on server
```

**When receiving audio:**
```
Received: {type: 'audio_response', audio: '...', text: '...'}
Playing audio  ← MUST see this!
```

### Step 3: Network Tab Check

1. Open DevTools → Network tab → WS (WebSocket)
2. Click on the WebSocket connection
3. Look at Messages tab
4. When you speak, you should see:
   - Outgoing: `{type: 'audio_chunk', audio: '...'}`
   - Incoming: `{type: 'audio_response', audio: '...'  text: '...', original_text: '...'}`

**Check audio field length:**
- If `audio: ""` → TTS failed (voice sample missing or TTS error)
- If `audio: "..."` with 100K+ chars → Audio was generated! ✅

## 🚨 Common Issues

### Issue 1: "No voice sample found for user"

**Backend Log:**
```
WARNING - No voice sample found for user user_xxx!
ERROR - XTTS v2 requires voice sample (speaker_wav). Skipping TTS.
WARNING - TTS returned empty audio!
```

**Solution:**
- **MUST capture voice sample BEFORE finding partner**
- Check browser console shows "Voice sample stored on server"
- If not, check microphone permissions
- Try re-capturing voice sample

### Issue 2: Audio field is empty

**Backend Log:**
```
INFO - TTS generated 0 chars of base64 audio
or
WARNING - TTS returned empty audio!
```

**Causes:**
1. No voice sample stored
2. TTS model not loaded
3. TTS error (check full traceback)

**Solution:**
- Restart backend to reload TTS model
- Re-capture voice samples
- Check backend logs for TTS errors

### Issue 3: Browser console shows errors

**Error: "Failed to decode audio"**
```
Failed to decode audio: DOMException: Unable to decode audio data
```

**Possible causes:**
- Wrong sample rate (should be 24000 Hz)
- Corrupted PCM data
- WAV header mismatch

**Solution:**
- Verify backend logs show "Generated X bytes of audio"
- Check audio data length in Network tab
- Try different browser (Chrome recommended)

### Issue 4: Audio doesn't play but no errors

**Check:**
1. Browser volume/mute status
2. Audio output device selected
3. Browser autoplay policy (click something first)
4. Check if `audioContext.decodeAudioData` promise resolved

**Solution:**
- Click on page before testing (autoplay requirement)
- Check browser console for "Playing audio" message
- Try refreshing page

## 📊 Expected Data Sizes

### Voice Sample (10 seconds @ 16kHz):
- PCM bytes: ~320,000 bytes
- Base64 chars: ~426,667 chars

### Regular Audio Chunk (2 seconds @ 16kHz):
- PCM bytes: ~64,000 bytes  
- Base64 chars: ~85,333 chars

### TTS Output (varies by text length):
- For "hello" (~1 sec speech): ~48,000 bytes PCM, ~64,000 base64 chars
- For sentence (~3 sec speech): ~144,000 bytes PCM, ~192,000 base64 chars

## 🔧 Manual Testing

### Test 1: Voice Sample Upload

**Browser Console:**
```javascript
// Check if voice sample was sent
// Look in Network → WS → Messages for:
{type: 'voice_sample', audio: '...(~426K chars)'}

// Should receive:
{type: 'voice_sample_received', message: '...'}
```

### Test 2: Audio Generation

**Backend:**
```python
# Test TTS directly
python backend/test_tts.py
```

Should output:
```
Testing TTS without voice sample...
ERROR - XTTS v2 requires voice sample (speaker_wav). Skipping TTS.
Result length: 0 chars
```

This is expected! XTTS requires voice sample.

### Test 3: Complete Flow

1. Window 1: English + capture voice
2. Window 2: French + capture voice  
3. Pair both
4. Window 1: Speak "hello"
5. Check backend logs for full flow
6. Window 2: Should show text + hear audio

## ✅ Success Criteria

- ✅ Voice sample captured (320KB)
- ✅ Voice sample sent and stored on backend
- ✅ Partner found and paired
- ✅ Speech transcribed correctly
- ✅ Translation works (different text)
- ✅ TTS generates audio (100K+ chars base64)
- ✅ Audio plays in browser
- ✅ No errors in console

## 🐛 If Still Not Working

### Last Resort Debugging:

1. **Check TTS model is loaded:**
   ```python
   # In backend terminal:
   python -c "from TTS.api import TTS; t = TTS('tts_models/multilingual/multi-dataset/xtts_v2'); print('TTS loaded OK')"
   ```

2. **Test WAV header creation:**
   - Save received audio to file
   - Try opening in audio player
   - Verify it's valid WAV

3. **Test browser audio playback:**
   ```javascript
   // In browser console:
   const ctx = new AudioContext();
   console.log('Sample rate:', ctx.sampleRate);
   ```

4. **Network inspection:**
   - Copy audio base64 from Network tab
   - Decode online: https://base64.guru/converter/decode/audio
   - Check if valid audio file

---

**Status:** All known issues fixed. Audio should now work!  
**Last Updated:** 2025-11-03
