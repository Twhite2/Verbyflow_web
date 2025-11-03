# 🔍 Audio Playback Debugging

## 🎯 What I Added

Comprehensive logging to track the ENTIRE audio playback flow in the browser console.

## 🧪 Testing Steps

### 1. Restart Frontend
```bash
cd frontend
npm run dev
```

### 2. Open TWO Browser Windows
- Window 1: http://localhost:3000
- Window 2: http://localhost:3000

### 3. Open Browser Console (F12)
- Chrome: F12 → Console tab
- Keep console open while testing

### 4. Test Flow

**Window 1 (English):**
1. Select English
2. Click "Capture Voice (10s)" → Speak clearly
3. Click "Find Partner"

**Window 2 (French):**
1. Select French  
2. Click "Capture Voice (10s)" → Speak clearly
3. Click "Find Partner"

**Window 1:**
4. Click microphone button → Speak "hello"

**Window 2 Console - Expected Logs:**
```
📩 WebSocket message received: audio_response
Received audio_response: {hasAudio: true, audioLength: 293592, text: "bonjour"}
Attempting to play audio... 293592 chars
Decoding base64...
Decoded to 220192 bytes
Created WAV file: 220236 bytes
Decoding audio data...
Audio decoded successfully! Duration: 4.587 seconds
🔊 Playing audio NOW!
```

## 🔍 What Each Log Means

### ✅ Good Logs:
- `📩 WebSocket message received: audio_response` → Message received
- `audioLength: 293592` → Audio data present (100K+ is good)
- `Decoded to 220192 bytes` → Base64 decoded successfully
- `Created WAV file: 220236 bytes` → WAV header added
- `Audio decoded successfully!` → Browser can decode the audio
- `🔊 Playing audio NOW!` → **Audio should play!**

### ❌ Bad Logs:

**If you see:**
```
⚠️ No audio data received or empty audio
```
→ Backend didn't send audio. Check backend logs.

**If you see:**
```
❌ Failed to decode audio: DOMException: ...
```
→ WAV header or sample rate mismatch. Try different sample rate.

**If you see:**
```
❌ Failed to play audio (outer catch): ...
```
→ JavaScript error in audio processing.

## 🎯 Test Scenarios

### Scenario 1: No Audio Logs At All

**Problem:** Not receiving `audio_response` messages

**Check:**
1. Backend logs show "TTS generated X chars"?
2. Network tab → WS → Messages → See `audio_response`?
3. Is `data.type === 'audio_response'` being triggered?

### Scenario 2: Audio Data is Empty

**Console shows:**
```
audioLength: 0
⚠️ No audio data received or empty audio
```

**Problem:** Backend sending empty audio

**Check backend logs for:**
```
WARNING - No voice sample found for user
ERROR - XTTS v2 requires voice sample. Skipping TTS.
WARNING - TTS returned empty audio!
```

**Solution:** Recapture voice samples.

### Scenario 3: Decode Fails

**Console shows:**
```
❌ Failed to decode audio: DOMException: Unable to decode audio data
```

**Possible causes:**
- Wrong sample rate (try 22050 or 24000)
- Corrupted PCM data
- Invalid WAV header

**Debug:**
1. Check `Audio data length` in error
2. Should be ~220K bytes for short sentence
3. Try downloading audio from Network tab and opening in audio player

### Scenario 4: Decoded But No Sound

**Console shows:**
```
Audio decoded successfully! Duration: 4.587 seconds
🔊 Playing audio NOW!
```

But no sound heard.

**Check:**
1. Computer volume
2. Browser tab not muted (check tab icon)
3. Correct audio output device selected
4. Browser autoplay policy (click page first)

## 📊 Sample Rate Testing

If audio decode fails, try different sample rates:

Edit `frontend/lib/store.ts` line 131:
```typescript
// Try these one at a time:
const sampleRate = 24000 // Current (XTTS v2 default)
const sampleRate = 22050 // Alternative 1
const sampleRate = 16000 // Alternative 2
```

## 🔧 Manual Test: Save Audio File

If audio won't play, save it manually:

**Browser Console:**
```javascript
// Copy the base64 audio from Network tab
const base64Audio = "...paste here..."

// Decode and create download link
const binaryString = atob(base64Audio)
const bytes = new Uint8Array(binaryString.length)
for (let i = 0; i < binaryString.length; i++) {
  bytes[i] = binaryString.charCodeAt(i)
}

// Create WAV file
const sampleRate = 24000
const wavHeader = new ArrayBuffer(44)
const view = new DataView(wavHeader)
view.setUint32(0, 0x46464952, false) // "RIFF"
view.setUint32(4, 36 + bytes.length, true)
view.setUint32(8, 0x45564157, false) // "WAVE"
view.setUint32(12, 0x20746d66, false) // "fmt "
view.setUint32(16, 16, true)
view.setUint16(20, 1, true)
view.setUint16(22, 1, true)
view.setUint32(24, sampleRate, true)
view.setUint32(28, sampleRate * 2, true)
view.setUint16(32, 2, true)
view.setUint16(34, 16, true)
view.setUint32(36, 0x61746164, false) // "data"
view.setUint32(40, bytes.length, true)

const wavBytes = new Uint8Array(44 + bytes.length)
wavBytes.set(new Uint8Array(wavHeader), 0)
wavBytes.set(bytes, 44)

// Download
const blob = new Blob([wavBytes], { type: 'audio/wav' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'test_audio.wav'
a.click()
```

Then try opening `test_audio.wav` in media player.

---

**Run the test and share the browser console output!**
