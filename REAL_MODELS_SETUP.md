# Real AI Models Setup Guide

## ✅ Models Now Integrated!

I've updated the backend to use **real AI models** instead of placeholders:
- ✅ **Whisper** for Speech-to-Text
- ✅ **MarianMT** for Translation
- ✅ **Coqui TTS** for Text-to-Speech

## 🚀 Quick Setup

### Step 1: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install:
- `openai-whisper` - Speech recognition
- `transformers` - Translation models
- `TTS` (Coqui) - Text-to-speech
- `torch` - Deep learning framework
- All other required packages

### Step 2: Download Models (First Time Only)

Run the initialization script to download all models:

```bash
python initialize_models.py
```

This will download (~3-5GB total):
- Whisper base model (~140MB)
- Translation models for common pairs (~300MB each)
- Coqui TTS multilingual model (~2GB)

**Note:** First run takes 5-15 minutes depending on internet speed. Models are cached locally.

### Step 3: Start the Server

```bash
python main.py
```

The server will:
1. Load all cached models into memory
2. Initialize GPU support (if available)
3. Start listening on port 8000

## 📋 Model Details

### Whisper (Speech-to-Text)
- **Model:** `base` (can upgrade to `small`, `medium`, or `large`)
- **Size:** ~140MB
- **Languages:** 99+ languages supported
- **Performance:** ~1-2s per audio chunk (GPU) or 3-5s (CPU)

### MarianMT (Translation)
- **Models:** Helsinki-NLP opus-mt models
- **Size:** ~300MB per language pair
- **Languages:** Pre-configured for EN↔ES, EN↔FR (add more as needed)
- **Performance:** ~100-300ms per translation

### Coqui TTS (Text-to-Speech)
- **Model:** XTTS v2 multilingual
- **Size:** ~2GB
- **Languages:** 17 languages
- **Performance:** ~500ms-1s per sentence

## 🎯 Testing Real Models

### 1. Start Backend
```bash
cd backend
python main.py
```

Wait for log: `✓ All models loaded successfully`

### 2. Start Frontend
```bash
cd frontend
npm install  # if not done
npm run dev
```

### 3. Test End-to-End
1. Open http://localhost:3000 in **two browser tabs**
2. Set **different languages** in each tab
3. Click "Find Partner" in both tabs
4. Grant microphone permissions
5. Click the microphone button and **speak**
6. You should see:
   - Real transcription of your speech
   - Translation to partner's language
   - Partner hears synthesized audio in their language

## ⚡ GPU vs CPU

### With GPU (Recommended)
- **Requirements:** NVIDIA GPU + CUDA 11.8+
- **Performance:** 2-4s end-to-end latency
- **Setup:** Models automatically use GPU if available

### Without GPU (CPU Only)
- **Performance:** 5-10s end-to-end latency
- **Memory:** ~4-6GB RAM required
- **Works:** Yes, just slower

To check GPU availability:
```python
import torch
print("CUDA available:", torch.cuda.is_available())
```

## 📦 Model Storage

Models are cached in:
- **Linux/Mac:** `~/.cache/`
- **Windows:** `C:\Users\{username}\.cache\`

After first download, no internet required unless you update models.

## 🔧 Customization

### Use Larger Whisper Model
Edit `backend/stt.py`:
```python
def load_whisper_model(model_size: str = "medium"):  # Change from "base"
```

Options: `tiny`, `base`, `small`, `medium`, `large`

### Add More Translation Pairs
Edit `backend/initialize_models.py` to add language pairs:
```python
pairs = [
    ("en", "es"),
    ("en", "de"),  # Add German
    ("en", "ja"),  # Add Japanese
    # etc.
]
```

### Change TTS Model
Edit `backend/tts.py`:
```python
_tts_model = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC")  # Different model
```

See available models: https://github.com/coqui-ai/TTS#released-models

## 🐛 Troubleshooting

### "No module named 'whisper'"
```bash
pip install openai-whisper
```

### "CUDA out of memory"
- Use smaller Whisper model (`tiny` or `base`)
- Reduce batch size
- Close other GPU applications

### "Translation model not found"
Models download on first use. Wait for download to complete, or pre-download with `initialize_models.py`

### Slow performance
- Check GPU is being used: `torch.cuda.is_available()`
- Install CUDA toolkit if using GPU
- Consider using smaller models
- Reduce audio chunk size

### Audio quality issues
- Check microphone quality
- Ensure proper audio encoding (16-bit PCM)
- Adjust Whisper language hint
- Test with clearer speech

## 📊 Expected Performance

| Component | GPU | CPU |
|-----------|-----|-----|
| Whisper STT | 1-2s | 3-5s |
| Translation | 100-300ms | 200-500ms |
| TTS | 500ms-1s | 1-2s |
| **Total** | **2-4s** | **5-10s** |

## 🎉 You're Ready!

The real models are now integrated and ready to use. Just:
1. Run `python initialize_models.py` (once)
2. Start backend: `python main.py`
3. Start frontend: `npm run dev`
4. Test with two browser windows

Enjoy real-time voice translation! 🌍🗣️
