# 🚀 GPU Optimization Guide - RTX 3050

## 🔍 Current Issue

Your RTX 3050 is **NOT being used!** PyTorch is running CPU-only mode.

**Evidence:**
```
PyTorch Version: 2.8.0+cpu  ← CPU-only version!
CUDA Available: False        ← GPU not detected
```

**Impact:**
- ❌ STT (Whisper): ~2-4 seconds (should be ~0.3-0.5s)
- ❌ TTS (XTTS): ~10-20 seconds (should be ~2-3s)
- ❌ Total latency: ~12-24s (should be ~2.5-4s)

---

## ✅ Solution: Enable GPU Support

### Step 1: Install GPU-Enabled PyTorch

**Run this command in backend folder:**
```bash
cd backend
powershell -ExecutionPolicy Bypass -File install_gpu_support.ps1
```

**Or manually:**
```bash
# 1. Uninstall CPU version
pip uninstall torch torchvision torchaudio

# 2. Install CUDA version
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Step 2: Verify GPU is Working

```bash
python check_gpu.py
```

**Expected output:**
```
CUDA Available: True  ✅
Current GPU: NVIDIA GeForce RTX 3050  ✅
Whisper will use: cuda  ✅
TTS will use device: cuda  ✅
```

### Step 3: Restart Backend

```bash
python main.py
```

**Expected startup logs:**
```
🚀 Preloading AI models...
INFO - Whisper model loaded on cuda  ✅
INFO - TTS will use device: cuda  ✅
INFO - TTS model loaded successfully on cuda  ✅
✅ All AI models preloaded and ready!
```

---

## 📊 Performance Comparison

### Before (CPU-only):

| Component | Time | Status |
|-----------|------|--------|
| STT (Whisper) | 2-4s | ❌ Slow |
| Translation | 0.2-0.4s | ✅ OK |
| TTS (XTTS) | 10-20s | ❌ Very slow |
| **Total** | **12-24s** | ❌ Unacceptable |

### After (GPU RTX 3050):

| Component | Time | Status |
|-----------|------|--------|
| STT (Whisper) | 0.3-0.5s | ✅ Fast |
| Translation | 0.1s | ✅ Fast |
| TTS (XTTS) | 2-3s | ✅ Good |
| **Total** | **2.5-4s** | ✅ **5-10x faster!** |

---

## 🎯 Optimizations Applied

### 1. **GPU Support for TTS** ✅
```python
# Before (TTS not using GPU)
_tts_model = TTS(model_name="...")

# After (Explicit GPU enable)
_tts_model = TTS(
    model_name="...",
    gpu=True  # Force GPU usage
)
```

### 2. **Model Preloading at Startup** ✅
```python
@app.on_event("startup")
async def startup_event():
    # Load all models before first request
    load_whisper_model()
    load_tts_model()
```

**Benefits:**
- No delay on first translation
- Models ready immediately
- Better user experience

### 3. **Parallel Model Loading** ✅
```python
# Load Whisper and TTS simultaneously
await asyncio.gather(
    loop.run_in_executor(None, load_whisper),
    loop.run_in_executor(None, load_tts)
)
```

**Benefits:**
- Faster startup (load in parallel)
- Less waiting time

---

## 🔧 Additional Optimizations

### Use Smaller Whisper Model (Optional)

Current: `base` model (~140MB, good quality)

**For even faster STT:**
```python
# In stt.py, change to:
load_whisper_model("tiny")  # ~40MB, 2x faster, slightly lower quality
```

**Model comparison:**
| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| tiny | 40MB | ⚡⚡⚡ | ⭐⭐⭐ |
| base | 140MB | ⚡⚡ | ⭐⭐⭐⭐ |
| small | 460MB | ⚡ | ⭐⭐⭐⭐⭐ |

### Enable FP16 (Half Precision)

Already enabled for Whisper:
```python
result = model.transcribe(
    audio_float,
    language=language,
    fp16=torch.cuda.is_available()  # Use FP16 on GPU
)
```

**Benefits:**
- 2x faster on GPU
- Lower VRAM usage
- No quality loss

---

## 🎮 RTX 3050 Specs

Your GPU:
- **CUDA Cores:** 2560
- **VRAM:** 4GB or 8GB
- **Tensor Cores:** Yes (for AI)
- **Perfect for:** Speech AI models

**Expected Performance:**
- Whisper (base): ~300-500ms
- XTTS v2: ~2-3s per sentence
- Total latency: ~2.5-4s

---

## 🐛 Troubleshooting

### Issue 1: CUDA Still Not Available

**Check NVIDIA driver:**
```bash
nvidia-smi
```

**If command not found:**
1. Download: https://www.nvidia.com/download/index.aspx
2. Install latest GeForce driver
3. Restart computer

### Issue 2: PyTorch Still Using CPU

**Verify installation:**
```python
import torch
print(torch.version.cuda)  # Should show 11.8 or 12.1
print(torch.cuda.is_available())  # Should be True
```

**If False:**
- Reinstall PyTorch CUDA version
- Check CUDA toolkit installed
- Restart Python/terminal

### Issue 3: Out of Memory (OOM)

**If you get CUDA OOM errors:**

1. **Reduce batch size** (already optimized)
2. **Use smaller models:**
   ```python
   load_whisper_model("tiny")  # Instead of "base"
   ```
3. **Check VRAM usage:**
   ```bash
   nvidia-smi  # Shows VRAM usage
   ```

### Issue 4: Models Still Load Slow

**Check startup logs:**
```
🚀 Preloading AI models...
✅ All AI models preloaded and ready!
```

**If not showing:**
- Backend didn't restart properly
- Run: `python main.py` (not via uvicorn directly)

---

## 📈 Monitoring Performance

### Real-time Performance Logs

**Backend will show:**
```
INFO - Transcribed: '...' (lang: en)  [time: 0.4s]
INFO - Translated to: '...'  [time: 0.1s]
INFO - Processing time: 2.8  [TTS time]
INFO - Real-time factor: 1.8  [2.8s for 1.5s audio = 1.8x]
```

**Target metrics:**
- STT: <0.5s
- Translation: <0.2s
- TTS: <3s
- Total: <4s

### GPU Monitoring

**Check GPU usage during translation:**
```bash
# Run in separate terminal
nvidia-smi -l 1  # Update every second
```

**Expected:**
- GPU Utilization: 40-80% during processing
- VRAM Usage: 2-3GB
- Temperature: <70°C

---

## ✅ Verification Checklist

After installing GPU support:

- [ ] `python check_gpu.py` shows CUDA: True
- [ ] Backend logs show "loaded on cuda"
- [ ] `nvidia-smi` shows Python process using GPU
- [ ] Translation latency reduced to 2-4s
- [ ] First translation fast (models preloaded)
- [ ] No OOM errors
- [ ] Audio quality good

---

## 🎯 Quick Test

**Test GPU acceleration:**

1. **Start backend:**
   ```bash
   python main.py
   ```

2. **Check startup logs:**
   ```
   ✅ All AI models preloaded and ready!
   ```

3. **Test translation:**
   - Speak in app
   - Check backend logs for timing
   - Should show ~0.4s STT + ~2-3s TTS

4. **Monitor GPU:**
   ```bash
   nvidia-smi
   ```
   - Should show GPU activity during translation

---

## 📝 Expected Improvement

**User A speaks:**
```
Before GPU:
User A speaks → [12-24s delay] → User B hears

After GPU:
User A speaks → [2-4s delay] → User B hears
```

**5-10x faster translation!** 🚀

---

## 🎉 Success Indicators

✅ Backend shows CUDA device  
✅ Translation in 2-4 seconds  
✅ No delay on first request  
✅ GPU shows activity in nvidia-smi  
✅ Smooth conversation flow  

---

**Questions? Run `python check_gpu.py` to diagnose issues.**

**Status:** Optimizations ready - install GPU support to activate  
**Updated:** 2025-11-03
