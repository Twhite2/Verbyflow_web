# VerbyFlow — Real-Time Multilingual Communication Platform

## Overview

**VerbyFlow** is a fully local, real-time voice and text translation platform that enables two people who speak different languages to communicate seamlessly. It pairs anonymous users via WebSocket, captures their speech, transcribes it, translates it to the partner's language, synthesizes the translation as spoken audio, and streams it back — all in under a second.

The system runs entirely on-device (no cloud APIs required for core functionality) using open-source AI models: **Faster-Whisper** for speech recognition, **MarianMT** for translation, and **Coqui XTTS v2** for text-to-speech with predefined multilingual voices.

---

## Communication Modes

VerbyFlow supports **three communication modes**, selectable from the landing page:

| Mode | Description | Translation Method |
|---|---|---|
| **Video Call** | Face-to-face via WebRTC with real-time voice translation | STT → Translate → TTS (streamed) |
| **Audio Call** | Voice-only via WebSocket with real-time voice translation | STT → Translate → TTS (streamed) |
| **Text Chat** | Typed messages with instant translation, voice notes supported | Text → Translate (instant), Voice note → STT → Translate |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                          │
│  page.tsx → ModeSelector → AudioCallInterface / VideoCallInterface  │
│                            / TextChatInterface                      │
│                                                                     │
│  AudioWorkletCapture ──20ms PCM frames──→ WebSocket (store.ts)      │
│  AudioPlayback ←──TTS audio chunks──── WebSocket (store.ts)         │
│  WebRTCManager ←──────── Video/ICE signaling ──────→ WebSocket      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ WebSocket (ws://localhost:8000/ws/{userId})
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI)                            │
│                                                                     │
│  sockets.py ── ConnectionManager                                    │
│      ├── User pairing (waiting queue + lock)                        │
│      ├── Audio routing (direct or translated)                       │
│      ├── Text message translation                                   │
│      ├── Voice note processing                                      │
│      ├── WebRTC signaling relay                                     │
│      └── Echo suppression lifecycle                                 │
│                                                                     │
│  realtime_audio_processor.py ── Per-user processing thread          │
│      ├── VAD (Silero or RMS fallback)                               │
│      ├── Speech-only buffer accumulation                            │
│      ├── Whisper transcription on silence boundaries                │
│      └── Hallucination filtering                                    │
│                                                                     │
│  translator.py ── MarianMT (Helsinki-NLP/opus-mt-{src}-{tgt})      │
│  tts.py ── Coqui XTTS v2 with VOICE_MAP (language × gender)        │
│  stt.py ── Batch STT with VAD gate (for voice notes)                │
│  vad_gate.py ── VADGate + HallucinationFilter                      │
│  voice_note_processor.py ── webm→wav→Whisper (CPU, async)           │
│  model_loader.py ── Parallel startup preload of all models          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend
- **Next.js 14** — React framework with App Router
- **TypeScript** — Type-safe frontend code
- **Tailwind CSS** — Utility-first styling
- **Zustand** — Lightweight state management (single store in `store.ts`)
- **Lucide React** — Icon library
- **Web Audio API / AudioWorklet** — Low-latency 16kHz mic capture in 20ms frames
- **WebRTC** — Peer-to-peer video/audio for Video Call mode

### Backend
- **FastAPI** — Async Python web framework
- **Uvicorn** — ASGI server with hot reload
- **WebSockets** — Real-time bidirectional communication
- **Faster-Whisper** (small model, ~244M params) — Speech-to-text with int8 quantization
- **MarianMT** (Helsinki-NLP) — Neural machine translation per language pair
- **Coqui TTS / XTTS v2** — Multilingual text-to-speech with predefined speakers
- **Silero VAD** (optional) — Neural voice activity detection, RMS fallback
- **PyTorch** — ML runtime with CUDA GPU acceleration
- **SciPy** — Audio signal processing (high-pass filter)

### Infrastructure
- **Docker Compose** — Containerized deployment with NVIDIA GPU passthrough
- Fully local — no external API calls required for STT/TTS/Translation

---

## Supported Languages

13 languages with dedicated TTS voice mappings (male + female per language):

| Language | Code | Male Voice | Female Voice |
|---|---|---|---|
| English | `en` | Andrew Chipper | Daisy Studious |
| Spanish | `es` | Luis Moray | Alma María |
| French | `fr` | Damjan Chapman | Claribel Dervla |
| German | `de` | Viktor Eka | Brenda Stern |
| Italian | `it` | Gilberto Mathias | Ana Florence |
| Portuguese | `pt` | Marcos Rudaski | Rosemary Okafor |
| Dutch | `nl` | Baldur Sanjin | Annmarie Nele |
| Russian | `ru` | Dionisio Schuyler | Lilya Stainthorpe |
| Chinese | `zh` | Kazuhiko Atallah | Tamaru Naoko |
| Japanese | `ja` | Xavier Hayasaka | Alexandra Hisakawa |
| Korean | `ko` | Royston Min | Szofi Gransen |
| Arabic | `ar` | Suad Qasim | Asya Anara |
| Hindi | `hi` | Badr Odhiambo | Chandra MacFarland |

---

## Detailed Component Breakdown

### Frontend

#### `frontend/app/page.tsx` — Main Entry Point
- Renders the `ModeSelector` if no mode is chosen
- Provides floating **language selector** (grid of 12 languages) and **gender toggle** (male/female for TTS voice)
- On mode selection, initializes a WebSocket connection via the Zustand store and renders the appropriate interface component
- Persists gender preference in `localStorage`

#### `frontend/lib/store.ts` — Zustand State Store
Central state management for the entire application:
- **Connection lifecycle**: `disconnected → connected → paired`
- **WebSocket management**: Opens `ws://localhost:8000/ws/{userId}?lang={lang}&gender={gender}`, handles all message types
- **Message routing**: Dispatches incoming WebSocket messages to UI state (`audio_chunk`, `text_message_received`, `voice_note_received`, `partner_found`, `tts_playing`, `tts_done`, etc.)
- **Echo suppression**: `ttsPlaying` flag gates `sendAudioChunk()` — mic audio is not sent while TTS is playing
- **Actions**: `initialize()`, `findPartner()`, `sendAudioChunk()`, `sendTextMessage()`, `sendVoiceNote()`, `setLanguage()`, `setGender()`

#### `frontend/lib/audioWorklet.ts` — Microphone Capture
- Uses the **AudioWorklet API** for low-latency, real-time audio capture
- Captures at **16kHz, mono, 20ms frames** (320 samples per frame)
- The worklet processor runs on a dedicated audio thread, accumulating samples into 320-sample buffers
- Converts Float32 samples to Int16 PCM and posts to the main thread
- Browser constraints: `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`

#### `frontend/lib/audioPlayback.ts` — TTS Audio Player
- Receives base64-encoded PCM audio chunks from the backend
- Decodes 16-bit PCM at **24kHz** (XTTS v2 output sample rate)
- Progressive queue-based playback: chunks play sequentially via `AudioBufferSourceNode`
- Supports interrupt (`stop()`) for barge-in scenarios

#### `frontend/lib/webrtc.ts` — WebRTC Manager (Video Mode)
- Full WebRTC peer connection lifecycle: offer/answer/ICE
- STUN servers: Google's public STUN endpoints
- Manages local and remote `MediaStream` objects
- Signaling is relayed through the WebSocket server (not peer-to-peer signaling)

#### `frontend/components/AudioCallInterface.tsx`
- Audio-only call UI with avatars, waveform visualization, and controls
- Auto-finds partner on connection
- Starts `AudioWorkletCapture` when mic is on and paired
- Creates a global `AudioPlayback` instance on `window` for receiving TTS chunks
- Controls: mic toggle, volume toggle, end call, chat panel toggle

#### `frontend/components/VideoCallInterface.tsx`
- Video call UI with local PiP (picture-in-picture) and remote full-screen video
- Initializes `WebRTCManager`, sets up signaling callbacks
- Initiates WebRTC offer when paired with a partner
- Controls: camera toggle, mic toggle, end call, chat sidebar toggle, settings overlay

#### `frontend/components/TextChatInterface.tsx`
- Full-featured text chat with sidebar showing participants and status
- Supports: text messages, emoji picker, voice note recording (webm via MediaRecorder)
- Displays translated messages with original text shown below
- Voice notes rendered with `VoiceNotePlayer` component
- Typing indicator relay to partner

#### `frontend/components/ModeSelector.tsx`
- Landing page with three mode cards: Video Call, Audio Call, Text Chat
- Branded with VerbyFlow logo and gradient design
- Anonymous, no registration tagline

#### `frontend/components/VoiceNotePlayer.tsx`
- HTML5 audio player for webm voice notes
- Play/pause, progress bar, duration display

---

### Backend

#### `backend/main.py` — FastAPI Entry Point
- Initializes the FastAPI app with CORS (allows `localhost:3000`)
- On startup: calls `preload_all_models()` to load Whisper, MarianMT, and XTTS v2 in parallel
- Includes the socket router and exposes `/health` and `/stats` endpoints
- Runs on `0.0.0.0:8000` with hot reload via Uvicorn

#### `backend/model_loader.py` — Parallel Model Preloader
- Uses `ThreadPoolExecutor` to load all three model families in parallel at startup:
  - **MarianMT**: en→es and es→en translation models (loaded from HuggingFace)
  - **XTTS v2**: Coqui TTS model with predefined speakers
  - **Faster-Whisper small**: STT model with int8 quantization
- Eliminates first-call latency for users

#### `backend/sockets.py` — WebSocket Server & Connection Manager
The heart of the backend. Manages the full lifecycle:

**Connection Management:**
- `ConnectionManager` class holds all state: connections, pairings, language/gender preferences, audio processors, TTS tasks
- Users connect via `ws://localhost:8000/ws/{user_id}?lang=en&gender=female`
- Pairing uses a FIFO waiting queue with an asyncio lock to prevent race conditions and self-pairing

**Audio Pipeline (different-language users):**
1. Frontend sends `audio_chunk` messages (base64 PCM, 20ms frames)
2. Backend decodes and feeds to user's `RealtimeAudioProcessor`
3. Processor runs VAD → accumulates speech → transcribes on silence
4. Transcription callback triggers `_process_final_transcript()`
5. Text is translated via `translate_text()`
6. Translated text is sent as a text message to partner
7. TTS generates audio via `stream_text_to_audio()` with partner's preferred language/gender
8. Audio chunks are streamed to partner's WebSocket

**Audio Pipeline (same-language users):**
- Audio chunks forwarded directly as `direct_audio` — no STT/translation/TTS

**Echo Suppression:**
- Before TTS streaming: sets partner's processor `tts_active = True`, sends `tts_playing` to frontend
- After TTS completes: 500ms cooldown, clears flag, flushes stale buffers, sends `tts_done` to frontend

**Other Message Types:**
- `text_message` → translate → send to partner
- `voice_note` → transcribe → translate → send audio + translated text
- `webrtc_offer/answer/ice_candidate` → relay to partner (signaling)
- `typing_indicator` → relay to partner
- `set_gender` → update TTS voice preference

**API Endpoints:**
- `GET /voices` — Returns the voice map for frontend consumption
- `GET /stats` — Active connections, queue size, active pairs

#### `backend/realtime_audio_processor.py` — Per-User Audio Processing
Each paired user gets a dedicated processor running in a background thread:

**Frame Processing (`_process_audio_frame`):**
1. **Echo gate**: If `tts_active`, discard frame immediately
2. **Decode**: Int16 PCM → Float32 normalized
3. **VAD**: Silero neural VAD (preferred) or RMS fallback (threshold 0.02)
4. **Speech-only accumulation**: Only speech frames go into `audio_buffer`; silence frames go into a 200ms pre-speech ring buffer
5. **Silence boundary detection**: After 500ms of silence following speech, trigger transcription
6. **Minimum speech gate**: Require ≥15 speech frames (~300ms) to prevent noise bursts from triggering transcription
7. **Stale buffer cleanup**: Clear buffer after 2s of continuous silence

**Transcription (`_transcribe_async`):**
1. Energy gate: reject buffers with RMS < 0.015
2. Audio preprocessing: RMS noise gate (0.008) + 80Hz high-pass filter
3. Whisper `small` model transcription with `beam_size=3`, `temperature=0.0`
4. Per-segment confidence filtering (`avg_logprob < -0.7` or `no_speech_prob > 0.5`)
5. `HallucinationFilter` pattern matching
6. Repetition detection
7. Minimum word count filter (≥3 words)
8. Result dispatched via async callback to sockets layer

**Model Sharing:**
- Single global `WhisperModel` instance shared across all users via a threading lock
- Prevents GPU OOM when multiple users are connected simultaneously

#### `backend/stt.py` — Batch Speech-to-Text (Voice Notes)
- Standalone STT module using Faster-Whisper with `VADGate`
- Used for voice note transcription (not real-time audio)
- Implements "soft pause" — model stays loaded, only transcribes when VAD detects speech
- Defense-in-depth: Whisper's built-in `vad_filter`, confidence filtering, hallucination pattern matching

#### `backend/vad_gate.py` — Voice Activity Detection Gate
Two classes:

**`VADGate`:**
- State machine with states: `silence`, `speech_started`, `speaking`, `speech_ended`, `intermediate_chunk`
- Configurable: silence threshold, min/max speech duration, trailing silence buffer, prolonged silence for context reset
- Filters low-confidence tokens from transcription segments
- Detects repetitive text (hallucination indicator via unique word ratio)

**`HallucinationFilter`:**
- Static utility class with regex patterns and exact-match phrases
- Catches common Whisper silence hallucinations: "thank you", "subscribe", "merci", etc.
- Covers English, French, Spanish, German patterns
- Detects excessive punctuation and repetitive patterns

#### `backend/translator.py` — Neural Machine Translation
- Uses **Helsinki-NLP MarianMT** models from HuggingFace
- Loads models lazily per language pair and caches them
- Supports safetensors format to avoid PyTorch security issues
- Preserves URLs and emojis during translation (placeholder extraction)
- Optimized: greedy decoding (`num_beams=1`), max 128 tokens, GPU acceleration

#### `backend/tts.py` — Text-to-Speech with Predefined Voices
- **Coqui XTTS v2** multilingual model
- `VOICE_MAP`: 13 languages × 2 genders = 26 predefined speaker configurations
- `get_speaker(language, gender)` with fallback to English defaults
- Two generation modes:
  - `process_text_to_audio()` — Full audio in one shot (for voice notes)
  - `stream_text_to_audio()` — Yields 100ms chunks (2400 samples at 24kHz) for low-latency streaming
- Output: 24kHz 16-bit PCM, base64 encoded

#### `backend/voice_note_processor.py` — Voice Note Transcription
- Converts browser webm recordings to 16kHz mono wav via ffmpeg
- Uses a **CPU-only** Whisper `base` model to avoid GPU contention with the real-time processor
- Returns transcribed text (voice cloning removed — TTS uses predefined voices)

#### `backend/logging_config.py` — Logging
- Dual output: file (timestamped in `logs/`) + console
- All backend modules use Python's `logging` module

---

## Data Flow Examples

### Audio Call (English speaker → Spanish speaker)

```
User A (English)                    Server                         User B (Spanish)
     │                                │                                │
     │──20ms PCM frame (base64)──────▶│                                │
     │                                │──VAD: speech detected──▶       │
     │                                │  accumulate in buffer          │
     │                                │                                │
     │  (silence > 500ms)             │                                │
     │                                │──Whisper: "How are you?"──▶    │
     │                                │──MarianMT: "¿Cómo estás?"──▶  │
     │                                │                                │
     │                                │──tts_playing──────────────────▶│ (echo suppression ON)
     │                                │──XTTS v2: audio chunks────────▶│ (plays "¿Cómo estás?")
     │                                │──tts_done─────────────────────▶│ (echo suppression OFF)
```

### Text Chat (French speaker → Japanese speaker)

```
User A (French)                     Server                         User B (Japanese)
     │                                │                                │
     │──text_message: "Bonjour"──────▶│                                │
     │                                │──MarianMT: "こんにちは"──▶     │
     │                                │──text_message_received────────▶│
     │                                │  (text + original_text)        │
```

---

## Anti-Hallucination System

Whisper is prone to generating phantom text from silence or background noise. VerbyFlow implements a **9-layer defense**:

| Layer | Location | What it does |
|---|---|---|
| 1 | `audioWorklet.ts` | Browser `noiseSuppression` + `echoCancellation` on mic |
| 2 | `store.ts` | Frontend echo gate — don't send audio while TTS is playing |
| 3 | `realtime_audio_processor.py` | Backend echo gate — discard frames when `tts_active` |
| 4 | `realtime_audio_processor.py` | RMS preprocess gate (0.008) — zero out low-energy frames |
| 5 | `realtime_audio_processor.py` | RMS VAD threshold (0.02) — reject ambient noise |
| 6 | `realtime_audio_processor.py` | Speech-only buffer + min 15 speech frames required |
| 7 | `realtime_audio_processor.py` | Buffer energy gate (0.015 RMS) before Whisper |
| 8 | `realtime_audio_processor.py` | Whisper confidence filter (`no_speech_prob > 0.5`) |
| 9 | `vad_gate.py` | `HallucinationFilter` — regex + exact-match pattern blocking |

---

## Project Structure

```
Verbyflow_web/
├── backend/
│   ├── main.py                      # FastAPI entry point, model preloading
│   ├── sockets.py                   # WebSocket server, pairing, audio routing
│   ├── realtime_audio_processor.py  # Per-user STT pipeline (VAD + Whisper)
│   ├── stt.py                       # Batch STT with VAD gate
│   ├── tts.py                       # XTTS v2 TTS with voice map
│   ├── translator.py                # MarianMT translation
│   ├── vad_gate.py                  # VAD gate + hallucination filter
│   ├── voice_note_processor.py      # Voice note transcription
│   ├── model_loader.py              # Parallel model preloader
│   ├── logging_config.py            # Logging setup
│   ├── requirements.txt             # Python dependencies
│   └── check_gpu.py                 # GPU diagnostics utility
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                 # Main page (mode selection, language/gender)
│   │   ├── layout.tsx               # Root layout with fonts
│   │   └── globals.css              # Tailwind base styles
│   ├── components/
│   │   ├── AudioCallInterface.tsx   # Audio call UI + mic capture
│   │   ├── VideoCallInterface.tsx   # Video call UI + WebRTC
│   │   ├── TextChatInterface.tsx    # Text chat UI + voice notes
│   │   ├── ModeSelector.tsx         # Landing page mode cards
│   │   ├── VoiceNotePlayer.tsx      # Voice note playback widget
│   │   └── ChatInterface.tsx        # Deprecated (kept for reference)
│   ├── lib/
│   │   ├── store.ts                 # Zustand state management
│   │   ├── audioWorklet.ts          # AudioWorklet mic capture (16kHz, 20ms)
│   │   ├── audioPlayback.ts         # TTS audio chunk player (24kHz)
│   │   ├── webrtc.ts                # WebRTC peer connection manager
│   │   ├── audioUtils.ts            # Audio utility classes
│   │   └── audioUtils_improved.ts   # Enhanced audio utilities
│   ├── package.json                 # Node dependencies
│   ├── tailwind.config.ts           # Tailwind configuration
│   └── tsconfig.json                # TypeScript configuration
│
├── docker/
│   ├── docker-compose.yml           # Multi-container deployment
│   ├── Dockerfile.backend           # Python backend image
│   ├── Dockerfile.frontend          # Node frontend image
│   └── start.sh                     # Container startup script
│
├── .env.example                     # Environment variable template
├── .gitignore                       # Git ignore rules
└── PROJECT.md                       # This file
```

---

## Running the Project

### Prerequisites
- **Python 3.10+** with CUDA-capable GPU (recommended) or CPU
- **Node.js 18+**
- **ffmpeg** (for voice note conversion)
- **NVIDIA GPU** with CUDA (optional but strongly recommended for real-time performance)

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# Server starts at http://localhost:8000
# Models preload at startup (~30-60s first time, downloads from HuggingFace)
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# App available at http://localhost:3000
```

### Docker (Alternative)
```bash
cd docker
docker-compose up --build
# Backend: http://localhost:8000, Frontend: http://localhost:3000
```

---

## Key Design Decisions

1. **Fully local** — No cloud APIs for core STT/Translation/TTS. Privacy-first.
2. **Predefined voices** — XTTS v2 speakers mapped by language/gender. No voice cloning complexity.
3. **20ms frame pipeline** — AudioWorklet captures at 20ms granularity for low-latency streaming.
4. **Shared Whisper model** — Single GPU instance shared across all users to prevent OOM.
5. **Echo suppression** — Dual-layer (frontend + backend) gate prevents TTS audio feedback loops.
6. **Speech-only buffering** — Only VAD-confirmed speech frames reach Whisper, not silence/noise.
7. **Streaming TTS** — Audio chunks sent progressively (100ms each) for perceived low latency.
8. **Same-language bypass** — When both users speak the same language, raw audio is forwarded directly without any AI processing.
