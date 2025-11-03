"""
GPU Diagnostic Tool - Check if CUDA is available and working
"""
import torch
print("=" * 60)
print("GPU DIAGNOSTIC")
print("=" * 60)

# Check PyTorch CUDA
print(f"\n1. PyTorch Version: {torch.__version__}")
print(f"2. CUDA Available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"3. CUDA Version: {torch.version.cuda}")
    print(f"4. GPU Device Count: {torch.cuda.device_count()}")
    print(f"5. Current GPU: {torch.cuda.get_device_name(0)}")
    print(f"6. GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    
    # Test GPU speed
    print("\n7. Testing GPU performance...")
    import time
    
    device = torch.device("cuda")
    x = torch.randn(1000, 1000).to(device)
    y = torch.randn(1000, 1000).to(device)
    
    start = time.time()
    for _ in range(100):
        z = torch.mm(x, y)
    torch.cuda.synchronize()
    elapsed = time.time() - start
    
    print(f"   GPU Speed Test: {elapsed:.3f}s for 100 matrix multiplications")
    print(f"   ✅ GPU is working!")
else:
    print("\n❌ CUDA is NOT available!")
    print("Possible reasons:")
    print("  - CUDA drivers not installed")
    print("  - PyTorch CPU-only version installed")
    print("  - GPU not detected by system")

# Check if Whisper will use GPU
print("\n" + "=" * 60)
print("WHISPER MODEL CHECK")
print("=" * 60)
try:
    import whisper
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Whisper will use: {device}")
    
    if device == "cuda":
        print("✅ Whisper will run on GPU")
    else:
        print("⚠️ Whisper will run on CPU (slow!)")
except ImportError:
    print("❌ Whisper not installed")

# Check TTS
print("\n" + "=" * 60)
print("TTS MODEL CHECK")
print("=" * 60)
try:
    from TTS.api import TTS
    print("TTS library installed")
    
    # Check if TTS can use GPU
    if torch.cuda.is_available():
        print("✅ TTS can use GPU (if enabled in code)")
    else:
        print("⚠️ TTS will run on CPU")
except ImportError:
    print("❌ TTS not installed")

print("\n" + "=" * 60)
print("RECOMMENDATIONS")
print("=" * 60)

if not torch.cuda.is_available():
    print("\n⚠️ GPU NOT DETECTED - Install CUDA toolkit:")
    print("   1. Download: https://developer.nvidia.com/cuda-downloads")
    print("   2. Reinstall PyTorch with CUDA:")
    print("      pip uninstall torch")
    print("      pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118")
else:
    print("\n✅ GPU is ready!")
    print("   Your RTX 3050 should provide:")
    print("   - STT (Whisper): ~0.3-0.5s")
    print("   - Translation: ~0.1s")
    print("   - TTS (XTTS): ~2-3s")
    print("   - Total latency: ~2.5-4s")

print("\n" + "=" * 60)
