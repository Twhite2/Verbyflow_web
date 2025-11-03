# ⚡ Quick Fix: Slow Translation (12-24s → 2-4s)

## 🔴 Problem
Translation taking 12-24 seconds because PyTorch is **CPU-only** (not using your RTX 3050)

## ✅ Solution (3 steps, 5 minutes)

### Step 1: Check Current State
```bash
cd backend
python check_gpu.py
```

**If shows "CUDA Available: False" → Proceed to Step 2**

### Step 2: Install GPU Support
```bash
powershell -ExecutionPolicy Bypass -File install_gpu_support.ps1
```

**Wait 2-3 minutes for PyTorch CUDA to install...**

### Step 3: Restart Backend
```bash
python main.py
```

**Look for these lines:**
```
🚀 Preloading AI models...
INFO - Whisper model loaded on cuda  ✅
INFO - TTS model loaded successfully on cuda  ✅
✅ All AI models preloaded and ready!
```

## 🎯 Expected Result

**Before:**
- Translation: 12-24 seconds ❌
- First request: Very slow
- GPU usage: 0%

**After:**
- Translation: 2-4 seconds ✅ **5-10x faster!**
- First request: Instant (preloaded)
- GPU usage: 40-80%

## 🧪 Test It

1. Start backend: `python main.py`
2. Open two browser windows
3. Connect with different languages
4. Speak → Should hear translation in **2-4 seconds**!

## 📚 More Details

See `GPU_OPTIMIZATION_GUIDE.md` for full documentation

---

**TL;DR:** Run `install_gpu_support.ps1` in backend folder → Restart backend → 5-10x faster!
