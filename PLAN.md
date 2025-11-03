
---

# 🧠 **Windsurf Project Prompt – VerbyFlow (Omegle Replacement)**

> Copy this entire block into Windsurf as your **initial project instruction**.

---

### 🏗️ PROJECT OVERVIEW

We’re building **VerbyFlow** — a modern Omegle-style platform where two anonymous users can instantly connect via **audio or video**, and speak freely in **different languages**, while the platform handles **real-time translation, voice replication (TTS), and transcription (STT)**.

The goal is to make it feel like users are speaking the same language, regardless of what they actually speak.

---

### 🎯 PRIMARY OBJECTIVE

Build a **full-stack application** (frontend + backend) that:

* Randomly pairs users for one-on-one chat (like Omegle)
* Supports **live voice translation** in real-time
* Uses **custom WebSockets**, not WebRTC
* Uses **locally hosted AI models** (Whisper for STT + Nari Labs’ Dia for TTS)
* Has **no database** (purely ephemeral connections)
* Is fully **Dockerized**, with **CUDA GPU support** for local model inference
* Can be deployed to a GPU cloud host like RunPod, Paperspace, or Lambda Labs

---

### 🧩 TECH STACK SPECIFICATIONS

#### **Frontend**

* **Framework:** Next.js 15 (React 19)
* **Styling:** Tailwind CSS + Shadcn UI
* **State Management:** Zustand
* **Transport:** Custom WebSocket connection (via backend API)
* **Core Functions:**

  * "Find Partner" button
  * Audio capture via Web Audio API
  * Streaming mic input to backend WebSocket
  * Display translated text in real-time
  * Play translated audio response from paired user

#### **Backend**

* **Framework:** FastAPI (Python)
* **WebSocket Handling:** Built-in FastAPI websocket routes
* **AI Components:**

  * Whisper (Speech-to-Text)
  * Nari Labs’ Dia (Text-to-Speech)
  * Optional Translation via local model (e.g., MarianMT or M2M100)
* **Logic:**

  * Maintain in-memory queue of waiting users
  * Pair users as they connect
  * Relay audio/text between paired users
  * Translate and replicate voices locally
* **No database.**
* **All models downloaded and initialized at container startup.**

#### **Deployment**

* **Containerized:** Docker + docker-compose
* **Base image:** Ubuntu 22.04 (CUDA-enabled)
* **GPU Support:** NVIDIA runtime
* **Frontend + Backend** run in one compose setup
* **Ports:**

  * Frontend: 3000
  * Backend: 8000 (WebSocket + model inference)
* **Volume mounting** for model caching.

---

### 🧱 PROJECT STRUCTURE

```
verbyflow/
├── frontend/                  # Next.js 15 app
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── public/
│   ├── pages/
│   └── package.json
│
├── backend/
│   ├── main.py                # FastAPI entrypoint
│   ├── sockets.py             # WebSocket pairing logic
│   ├── stt.py                 # Whisper integration
│   ├── tts.py                 # Dia integration
│   ├── translator.py          # Text translation module
│   ├── requirements.txt
│   └── utils/
│
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── start.sh
│
└── README.md
```

---

### ⚙️ FUNCTIONAL FLOW

1. **User A connects** to the site → clicks “Find Partner.”
2. **Frontend opens a WebSocket** to FastAPI.
3. Backend adds User A to a **waiting queue**.
4. When **User B connects**, backend pairs them and notifies both.
5. **Audio streams** from each client’s mic to the backend WebSocket.
6. Backend runs:

   ```
   Whisper (STT) → Translate → Dia (TTS)
   ```

   to create translated audio + transcript.
7. Backend streams translated text + audio back to each paired user.
8. Users hear each other’s voice in their own language.

---

### 🧰 IMPLEMENTATION NOTES

* Use async Python for all inference and WebSocket streaming.
* Whisper should be wrapped as a streaming processor, not batch.
* Use PyTorch with CUDA enabled for both Whisper and Dia.
* Translation can be optional — just text relay for MVP.
* Use placeholders for models initially (mock inference) to ensure flow before real model integration.
* No TURN/STUN servers — backend relays everything.
* No database — all data ephemeral and memory-based.

---

### 🌍 DEPLOYMENT REQUIREMENTS

* One Docker container running:

  * FastAPI backend (port 8000)
  * Next.js frontend (port 3000)
  * Models preloaded on startup (cached locally)
* GPU runtime (`--gpus all`) enabled
* Compose command should be as simple as:

  ```bash
  docker-compose up --build
  ```
* The container should come online fully functional without manual model downloads.

---

### 📈 FUTURE SCALING (optional for later phases)

* Add filters (e.g., “find by language,” “voice gender”)
* Add optional login system (when DB introduced)
* Add text chat overlay
* Add persistent logs and moderation tools

---

### 🧪 TESTING GOALS

Windsurf should automatically:

* Generate unit tests for STT, TTS, and translation modules
* Simulate two websocket clients connecting, exchanging text/audio
* Log pairing and disconnection behavior
* Validate Docker build with all dependencies pre-installed

---

### ✅ FINAL OUTPUT EXPECTATIONS

By the end of this build, Windsurf should:

1. Produce a working full-stack Dockerized app.
2. Let two clients connect and exchange audio streams through backend sockets.
3. Translate speech between different languages using local models.
4. Run locally on a GPU system (Ubuntu + CUDA).
5. Be easy to deploy to a GPU cloud host (RunPod / Lambda).

---

### ⚡ TONE AND BUILD STYLE

* Code must be **production-quality**, not just demo snippets.
* Keep it **readable**, **modular**, and **documented**.
* Follow modern best practices (async/await, dependency injection for FastAPI).
* Optimize for **low latency** and **clear scalability**.

---

## 🧠 KEYWORDS for Context

`Omegle`, `voice translation`, `real-time chat`, `FastAPI`, `Next.js`, `WebSockets`, `Whisper`, `Dia`, `Docker`, `CUDA`, `GPU inference`, `Python`, `React`, `Tailwind`, `Zustand`, `anonymous pairing`.

---

## 🪄 Prompt Instruction for Windsurf

> “Build the full VerbyFlow app following the above architecture. Begin by scaffolding the folders and base Docker setup. Implement WebSocket pairing, integrate placeholder STT/TTS functions, and ensure the entire app can run end-to-end with simulated audio input/output before adding real models.”

---
