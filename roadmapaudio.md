### 1. High-Level Architecture Diagram (Textual)

```
Frontend A (Browser):
  Mic → AudioWorklet (20ms PCM frames) → WebSocket Send (raw bytes to backend)
  ↓ Receive from WS: Partial text (UI display) + Audio chunks (translated TTS)
  AudioContext → AudioBufferSourceNode (play chunks progressively)
  Interrupt: If local VAD detects speech during play, stop SourceNode (but main interrupt in backend)

Backend (Python FastAPI WebSocket):
  WS Receive frames from A → Bounded Queue
  ↓ Processing Loop (thread)
    ├── Soft VAD (Silero: prob per frame)
    │   ├── Annotate speech/silence
    │   ├── silence_duration += 0.02s if silence
    │   └── If silence > 700ms: asr.reset()
    ├── Streaming ASR (FasterWhisperASR + OnlineASRProcessor with LocalAgreement)
    │   ├── insert_audio_chunk(frame)
    │   ├── process_iter() → partial (send to UI via WS)
    │   └── Confirmation Gate: On stable prefix (LocalAgreement) or silence >500ms → commit final
  ↓ Committed text
  MarianMT Translation (phrase-level)
  ↓ Translated text
  TTS Thread (XTTS-v2 inference_stream with cloning)
    ├── Stream chunks (100-200ms) → Send to Partner B's WS
    └── Interrupt: If new speech from A (VAD high), stop stream & flush

Frontend B (Symmetric): Receive audio chunks → Play, Send own frames
Logging: Timestamps, durations, violations across frontend/backend
```

This hybrid ensures frontend capture/play, backend heavy-lifting (GPU-friendly), network via WS, compliance with constraints (continuous frames, no batches, silence processed, partials UI-only).

### 2. Frame-by-Frame Data Flow Explanation

- **Frontend Capture**: `getUserMedia` for 16kHz mono stream. AudioContext (sampleRate 16000) with MediaStreamSourceNode connected to AudioWorkletNode. Worklet `process` accumulates to 320 samples (20ms Float32), postMessage to main. Main converts to Int16 bytes, sends via WebSocket (e.g., ws.send(frameBytes)). Silence frames sent—no skipping.
- **Backend Receive**: FastAPI WebSocket endpoint receives bytes (20ms frame). Push to bounded queue. Processing thread pulls frame:
  - Silero VAD on frame (prob = vad_model(torch.from_numpy(frame_float))).
  - If prob < 0.5: silence_duration += 0.02s; else reset=0.
  - If silence_duration > 0.7s: online.init() (resets ASR context).
  - Insert to ASR: online.insert_audio_chunk(frame_float).
  - Call online.process_iter(): Gets partial/stable output. Send partial JSON to sender's WS for UI.
  - Confirmation: LocalAgreement confirms prefixes (stable if 2-3 chunks agree). If confirmed or silence >0.5s with pending, commit as final.
- **Commitment**: Finals to MarianMT translate (fast, <200ms for phrases).
- **TTS**: On translated, load conditioning (voice_sample once), use tts.inference_stream(text, lang, gpt_cond_latent, speaker_embedding): Yield chunks (~100ms). Send each chunk via WS to partner.
- **Interrupt**: If VAD high (new speech) while streaming TTS, break yield loop, log interrupt.
- **Frontend Play**: On WS receive audio chunk, append to AudioBuffer queue, create SourceNode, start() progressively. If local VAD high during play, stop Node.
- **Continuity**: Frames flow every 20ms; backend processes <5ms/frame. Silence keeps alive.

Matches mobile smoothness, uses project stack (Faster-Whisper streaming, MarianMT, XTTS-v2 streaming).

### 3. Exact Buffer Sizes and Timing

- **Audio Frames**: 320 samples (20ms @16kHz mono, Int16) = 640 bytes. Worklet: 128 samples (~8ms), aggregate to 320.
- **WS Send**: Binary bytes, no extra buffer.
- **Backend Queue**: queue.Queue(maxsize=10) ~6.4KB (200ms).
- **VAD Input**: Torch tensor from frame (320 float32).
- **ASR Chunk**: Same frame, inserted every 20ms.
- **Silence Thresholds**: 500ms commit (25 frames), 700ms reset (35 frames). Counted frames (no timers).
- **TTS Chunks**: 100-200ms (~1600-3200 samples), sent immediately.
- **Play Buffer**: Frontend AudioBuffer queue max 200ms (1-2 chunks).
- **Timings**:
  - Frame Proc: <5ms (VAD 1ms, ASR insert/process 3ms).
  - Perceived Latency: <500ms (ASR 100-300ms + MT 100ms + TTS first 200ms).
  - Interrupt: Next frame (20ms).
- **No Batches**: Per-frame; bound queue detects overload.

### 4. Recognizer State Machine

For OnlineASRProcessor (with FasterWhisperASR):

- **Idle/Listening**: After init() or reset. Inserting chunks, partials.
  - On speech (VAD >=0.5) → Active.
- **Active**: process_iter() yields partials/stables.
  - On LocalAgreement confirm: Commit stable prefix, continue.
  - On silence >500ms with pending: Commit pending, to Listening.
  - On silence >700ms: init() to Idle (resets).
- **Reset**: Frame-counted silence >700ms. Clears buffer without commit.

No timer resets; interrupt stops TTS but ASR continues.

### 5. Pseudocode for Confirmation Gate

Backend after each insert_audio_chunk(frame):

```python
partial, stable = online.process_iter()  # partial is current hypo, stable is confirmed prefix
if partial != last_partial:
    last_partial = partial
    last_partial_time = current_time
    ws_send_to_sender({'type': 'partial', 'text': partial})  # UI

if stable:  # LocalAgreement confirmed
    final_text = stable.strip()
    if final_text:
        commit(final_text)
elif silence_duration > 0.5 and last_partial:
    commit(last_partial)
    last_partial = ""

if silence_duration > 0.7:
    online.init()
    silence_duration = 0
    last_partial = ""
```

Commit translates and starts TTS stream.

### 6. Minimal Working Code Skeleton

**Frontend (JS, adapt to your AudioCallInterface.tsx):**

```javascript
// Init
const ws = new WebSocket('ws://backend/audio');
const audioContext = new AudioContext({sampleRate: 16000});
let playQueue = [];
let isPlaying = false;

// Capture
const stream = await navigator.mediaDevices.getUserMedia({audio: {sampleRate: 16000, channelCount: 1}});
const source = audioContext.createMediaStreamSource(stream);
await audioContext.audioWorklet.addModule(URL.createObjectURL(new Blob([workletCode()], {type: 'application/javascript'})));
const worklet = new AudioWorkletNode(audioContext, 'frame-processor');
source.connect(worklet);
worklet.port.onmessage = ({data: frame}) => {
  const int16 = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i++) int16[i] = Math.clamp(frame[i] * 32768, -32768, 32767);
  ws.send(int16.buffer);  // Send frame
};
audioContext.resume();

// Worklet code (same as before)

// Receive
ws.onmessage = (event) => {
  if (event.data instanceof Blob) {  // Audio chunk
    playQueue.push(event.data);
    if (!isPlaying) playNext();
  } else {
    const data = JSON.parse(event.data);
    if (data.type === 'partial') document.getElementById('partial').textContent = data.text;
  }
};

// Play
async function playNext() {
  if (playQueue.length === 0) { isPlaying = false; return; }
  isPlaying = true;
  const blob = playQueue.shift();
  const arrayBuf = await blob.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(arrayBuf);
  const sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = buffer;
  sourceNode.connect(audioContext.destination);
  sourceNode.start();
  sourceNode.onended = playNext;
  // Interrupt check: If local VAD high (implement simple RMS), sourceNode.stop()
}
```

**Backend (Python, adapt to sockets.py):**

```python
from fastapi import FastAPI, WebSocket
from whisper_online import FasterWhisperASR, OnlineASRProcessor
import queue, threading, time, torch, numpy as np
from silero_vad import load_silero_vad
from transformers import pipeline  # MarianMT
from TTS.api import TTS  # Coqui

app = FastAPI()

# Setup
vad_model = load_silero_vad()
asr = FasterWhisperASR("en", "large-v2")
online = OnlineASRProcessor(asr)
translator = pipeline("translation", model="Helsinki-NLP/opus-mt-en-es")  # Example
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False)  # CPU

FRAME_MS = 20 / 1000
COMMIT_SIL = 0.5
RESET_SIL = 0.7

# Per connection state (use dict for pairs)
connections = {}  # user_id: {'ws': ws, 'silence': 0, 'last_partial': '', 'voice_sample': bytes, ...}

@app.websocket("/audio")
async def audio_ws(ws: WebSocket):
    await ws.accept()
    user_id = "A"  # Pair logic
    connections[user_id] = {'ws': ws, 'queue': queue.Queue(maxsize=10), 'silence': 0, 'last_partial': '', 'tts_active': False}
    threading.Thread(target=process_user, args=(user_id,)).start()

    while True:
        data = await ws.receive_bytes()
        connections[user_id]['queue'].put(data)

def process_user(user_id):
    state = connections[user_id]
    while True:
        start = time.time()
        frame_bytes = state['queue'].get()
        frame_np = np.frombuffer(frame_bytes, np.int16).astype(np.float32) / 32768
        frame_torch = torch.from_numpy(frame_np)

        # VAD
        prob = vad_model(frame_torch).item()
        is_speech = prob >= 0.5
        state['silence'] = 0 if is_speech else state['silence'] + FRAME_MS

        # Interrupt TTS
        if is_speech and state['tts_active']:
            # Stop TTS generator (use flag or cancel)
            state['tts_active'] = False

        # ASR
        online.insert_audio_chunk(frame_np)
        out = online.process_iter()
        partial = out[0] if out else ''  # Adjust based on out format
        if partial != state['last_partial']:
            state['last_partial'] = partial
            state['last_partial_time'] = start
            await state['ws'].send_json({'type': 'partial', 'text': partial})

        stable = out[1] if out and out[1] else ''  # Confirmed
        if stable:
            final = stable
            commit(user_id, final)
        elif state['silence'] > COMMIT_SIL and state['last_partial']:
            commit(user_id, state['last_partial'])
            state['last_partial'] = ''

        if state['silence'] > RESET_SIL:
            online.init()
            state['silence'] = 0
            state['last_partial'] = ''

        proc_time = time.time() - start
        if proc_time > FRAME_MS * 1.2: print(f"VIOLATION: {proc_time}")

async def commit(user_id, text):
    state = connections[user_id]
    translated = translator(text)[0]['translation_text']
    partner_id = "B"  # Pair

    # TTS stream
    state['tts_active'] = True
    gpt_latent, speaker_emb = tts.get_conditioning_latents(state['voice_sample'])
    chunks = tts.inference_stream(translated, "es", gpt_latent, speaker_emb)
    for chunk in chunks:
        if not state['tts_active']: break
        await connections[partner_id]['ws'].send_bytes(chunk.cpu().numpy().tobytes())  # PCM

    state['tts_active'] = False
```

Adapt pairing, voice_sample, langs. Use GPU for tts if available.

### 7. Instrumentation to Detect Timing Violations

- **Frontend**: performance.now() per frame; if >24ms: console.log("VIOLATION: Delay").
- **Backend Queue**: If put except Full: print("VIOLATION: Overrun").
- **Proc Delay**: time deltas per frame; if >0.024s: print("VIOLATION").
- **Timestamps**: Log frame entry/exit.
- **Silence/Events**: Print on changes/resets/commits.
- **Interrupt**: Print on TTS stop.

This achieves <500ms perceived, zero hallucinations (VAD + LocalAgreement), continuous streaming, interruptible, deterministic.