# VerbyFlow Quick Start Guide

## Option 1: Development Mode (Recommended for Testing)

### Backend Setup

1. **Navigate to backend directory:**
```bash
cd backend
```

2. **Create virtual environment:**
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

3. **Install dependencies:**
```bash
pip install -r requirements.txt
```

4. **Run backend:**
```bash
python main.py
```

Backend will run on **http://localhost:8000**

### Frontend Setup (New Terminal)

1. **Navigate to frontend directory:**
```bash
cd frontend
```

2. **Install dependencies:**
```bash
npm install
```

3. **Run development server:**
```bash
npm run dev
```

Frontend will run on **http://localhost:3000**

### Test the Application

1. Open **http://localhost:3000** in two browser windows (or two different browsers)
2. Select languages for each window
3. Click "Find Partner" in both windows
4. They should pair automatically
5. Click the microphone button to start recording (grant permissions)
6. Speak - you'll see placeholder messages as MVP uses mock translation

## Option 2: Docker (Production-like)

### Prerequisites
- Docker Desktop installed
- For GPU support: NVIDIA GPU + NVIDIA Container Toolkit

### Run with Docker

```bash
cd docker
docker-compose up --build
```

Access:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Testing Pairing Logic

The MVP includes **placeholder AI models** to test the flow without requiring GPU/large downloads.

### Test Checklist:

- [ ] Backend starts without errors
- [ ] Frontend loads UI
- [ ] Can select language
- [ ] "Find Partner" button works
- [ ] Two clients can pair together
- [ ] WebSocket connection status updates
- [ ] Microphone permission requested
- [ ] Audio recording starts/stops
- [ ] Messages appear in chat (placeholder text)
- [ ] "Disconnect" button works
- [ ] Can find new partner after disconnect

## Integrating Real AI Models

Once basic flow works, enable real models:

### 1. Uncomment Real STT (Whisper)

In `backend/stt.py`, uncomment the real implementation:

```python
# Decode audio
audio_bytes = base64.b64decode(audio_base64)
audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
audio_float = audio_array.astype(np.float32) / 32768.0
result = model.transcribe(audio_float, language=language)
return result["text"]
```

### 2. Uncomment Real Translation

In `backend/translator.py`, uncomment:

```python
model, tokenizer = load_translation_model(source_lang, target_lang)
if model is None:
    return text
    
inputs = tokenizer(text, return_tensors="pt", padding=True)
if torch.cuda.is_available():
    inputs = {k: v.cuda() for k, v in inputs.items()}

translated = model.generate(**inputs)
result = tokenizer.decode(translated[0], skip_special_tokens=True)
return result
```

### 3. Uncomment Real TTS

In `backend/tts.py`, integrate Coqui TTS or Dia:

```python
from TTS.api import TTS
_tts_model = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")

# Generate audio
audio_array = _tts_model.tts(text=text, language=language)
audio_bytes = audio_array.tobytes()
audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
return audio_base64
```

## Troubleshooting

### Backend won't start
- Check Python version (3.10+)
- Install dependencies: `pip install -r requirements.txt`
- Check port 8000 not in use

### Frontend won't start
- Check Node version (20+)
- Install dependencies: `npm install`
- Check port 3000 not in use

### WebSocket connection fails
- Ensure backend is running first
- Check browser console for errors
- Verify CORS settings allow localhost:3000

### Microphone not working
- Grant browser permissions
- Check browser console for errors
- Test with HTTPS in production

### Models not loading (when enabled)
- Ensure GPU drivers installed (for CUDA)
- Check disk space (models are large)
- First run downloads models (takes time)

## Next Steps

1. ✅ Test basic pairing flow
2. ✅ Verify WebSocket communication
3. 🔄 Enable real Whisper transcription
4. 🔄 Enable real translation
5. 🔄 Enable real TTS
6. 🔄 Deploy to GPU cloud host

## Production Deployment

See `README.md` for full deployment instructions to:
- RunPod
- Paperspace
- Lambda Labs
- Any GPU cloud provider

---

**Need help?** Check the README.md or open an issue.
