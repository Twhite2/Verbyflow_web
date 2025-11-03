# Install GPU-enabled PyTorch for RTX 3050
# This will significantly speed up AI models

Write-Host "=" -ForegroundColor Cyan -NoNewline
Write-Host ("=" * 59) -ForegroundColor Cyan
Write-Host "INSTALLING GPU SUPPORT FOR RTX 3050" -ForegroundColor Cyan
Write-Host "=" -ForegroundColor Cyan -NoNewline
Write-Host ("=" * 59) -ForegroundColor Cyan

Write-Host "`n1. Uninstalling CPU-only PyTorch..." -ForegroundColor Yellow
pip uninstall -y torch torchvision torchaudio

Write-Host "`n2. Installing CUDA-enabled PyTorch (CUDA 11.8)..." -ForegroundColor Yellow
Write-Host "   This may take a few minutes..." -ForegroundColor Gray
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

Write-Host "`n3. Verifying GPU installation..." -ForegroundColor Yellow
python check_gpu.py

Write-Host "`n" -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green
Write-Host "DONE! Your RTX 3050 should now be used for AI processing" -ForegroundColor Green
Write-Host "Expected speedup: 5-10x faster" -ForegroundColor Green
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green
Write-Host "`nRestart the backend server: python main.py" -ForegroundColor Cyan
