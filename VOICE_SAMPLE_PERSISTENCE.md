# 🎙️ Voice Sample Persistence Feature

## Overview

Voice samples are now **automatically saved and reused** for multiple conversations, eliminating the need to recapture your voice every time you connect to a new partner.

## ✨ Features

### 1. **Auto-Save on Capture**
- When you capture your voice sample (10 seconds), it's automatically saved
- Stored in browser's localStorage
- Persists even after closing the browser/tab

### 2. **Auto-Resend on New Partner**
- Voice sample automatically sent when connecting to a new partner
- No need to recapture between conversations
- Seamless reconnection experience

### 3. **Re-capture Option**
- "Re-capture" button available next to "Find Partner"
- Change your voice sample anytime
- New sample replaces the old one

### 4. **Persistent Across Sessions**
- Voice sample survives page refreshes
- Survives browser restarts
- Only cleared when you explicitly re-capture

## 🎯 User Flow

### First Time User:
1. Select language
2. Click **"Capture Voice (10s)"** → Speak for 10 seconds
3. Click **"Find Partner"** → Connects to partner
4. ✅ Voice sample saved

### Returning User / After Disconnect:
1. Page loads → Voice sample already captured ✅
2. Click **"Find Partner"** → Immediately connects
3. Voice sample auto-sent to backend
4. No need to recapture!

### Want to Change Voice?
1. After disconnect, click **"Re-capture"** button
2. Speak for 10 seconds
3. New voice sample replaces old one
4. Click **"Find Partner"** with new voice

## 🔧 Technical Implementation

### Frontend Storage:
```typescript
// Auto-load on initialization
storedVoiceSample: localStorage.getItem('voiceSample')

// Auto-save on capture
localStorage.setItem('voiceSample', combinedVoice)

// Auto-resend on new partner
case 'partner_found':
  const storedSample = get().storedVoiceSample
  if (storedSample) {
    get().sendVoiceSample(storedSample)
  }
```

### Backend Behavior:
- Voice sample stored per user ID in memory
- Cleared when WebSocket disconnects
- Re-populated when user reconnects with new partner
- No persistence on backend (privacy)

### Data Flow:
```
Initial Capture:
User speaks → Frontend captures → Saves to localStorage → Sends to backend

Next Connection:
Frontend loads from localStorage → New partner found → Auto-sends to backend

Disconnect:
Backend clears memory → Frontend keeps localStorage → Ready for next connection
```

## 💾 Storage Details

**Storage Location:**
- Browser's localStorage
- Key: `voiceSample`
- Value: Base64 encoded PCM audio

**Size:**
- ~327KB per voice sample (10 seconds @ 16kHz)
- ~437KB base64 encoded

**Privacy:**
- Stored locally only
- Not sent to any server except during active calls
- Can be cleared by browser settings

## 🔄 Lifecycle

### Voice Sample States:

1. **Not Captured**
   - `voiceSampleCaptured: false`
   - `storedVoiceSample: null`
   - Shows "Capture Voice" button

2. **Captured**
   - `voiceSampleCaptured: true`
   - `storedVoiceSample: <base64 data>`
   - Shows "Find Partner" + "Re-capture" buttons

3. **In Call**
   - Voice sample actively used for TTS
   - Backend has copy in memory
   - Frontend keeps in state + localStorage

4. **After Disconnect**
   - Backend clears from memory
   - Frontend still has in state + localStorage
   - Ready for next connection

5. **Page Refresh**
   - Loads from localStorage
   - Restored to state
   - Ready to use immediately

## 🗑️ Clearing Voice Sample

### Manual Clear (User):
1. Click "Re-capture" button
2. Capture new voice sample
3. Old sample replaced

### Browser Clear:
- Clear browser data → Voice sample deleted
- Next visit requires new capture

### No Automatic Expiry:
- Voice sample never expires
- Stays until explicitly replaced or browser cleared

## 🎨 UI Updates

**Before Connection:**
```
┌─────────────────────────────────┐
│  [ Find Partner ]  [ Re-capture ]│  ← Both buttons visible
└─────────────────────────────────┘
```

**During Capture:**
```
┌──────────────────────────────────────┐
│  [ Recording voice sample... (10s) ] │  ← Animated pulse
└──────────────────────────────────────┘
```

**While Paired:**
```
┌─────────────────────┐
│   [ 🔴 Disconnect ]  │  ← Only disconnect shown
└─────────────────────┘
```

## 📊 Advantages

✅ **Better UX:**
- No repetitive voice capture
- Faster reconnection
- Less friction

✅ **Privacy-Friendly:**
- Stored locally only
- No server-side persistence
- User controls deletion

✅ **Performance:**
- Instant reconnection
- No capture delay
- Smooth experience

✅ **Flexibility:**
- Re-capture anytime
- Multiple conversations with same voice
- Easy to update

## ⚠️ Considerations

**Storage Limit:**
- localStorage has ~5-10MB limit per domain
- Voice sample is ~437KB
- Room for multiple features

**Browser Compatibility:**
- Works in all modern browsers
- Gracefully degrades if localStorage unavailable
- Falls back to session-only storage

**Privacy:**
- Voice sample stored in browser
- Not encrypted in localStorage
- User should be aware of shared computers

## 🔮 Future Enhancements

**Potential Features:**

1. **Multiple Voice Profiles:**
   - Save different voices for different moods
   - Switch between profiles
   - Name profiles (e.g., "Casual", "Formal")

2. **Voice Preview:**
   - Listen to your captured sample
   - Test before using
   - Compare old vs new

3. **Expiration Options:**
   - Auto-expire after N days
   - Session-only mode
   - User preference setting

4. **Cloud Sync:**
   - Optional account system
   - Sync voice across devices
   - Backup to cloud

5. **Quality Indicator:**
   - Show voice sample quality score
   - Suggest recapture if poor quality
   - Background noise detection

## 📝 Changelog

**Version 1.1.0** (2025-11-03)
- ✅ Added voice sample persistence
- ✅ Auto-resend on new partner connection
- ✅ localStorage integration
- ✅ Re-capture button in UI
- ✅ Persistent across page refreshes

**Version 1.0.0** (2025-11-03)
- Initial release
- Voice sample required before each connection
- Session-only storage

---

**This feature significantly improves the user experience by eliminating repetitive voice captures while maintaining privacy and control!** 🎉
