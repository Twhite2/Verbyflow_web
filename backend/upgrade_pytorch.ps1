# Upgrade PyTorch to 2.6+ (required for MarianMT translator)

Write-Host "=" -ForegroundColor Cyan -NoNewline
Write-Host ("=" * 59) -ForegroundColor Cyan
Write-Host "UPGRADING PYTORCH TO 2.6+ FOR TRANSLATION FIX" -ForegroundColor Cyan
Write-Host "=" -ForegroundColor Cyan -NoNewline  
Write-Host ("=" * 59) -ForegroundColor Cyan

Write-Host "`nCurrent issue: MarianMT requires PyTorch 2.6+" -ForegroundColor Yellow
Write-Host "You have: PyTorch 2.5.1+cu121" -ForegroundColor Yellow

Write-Host "`n1. Uninstalling PyTorch 2.5..." -ForegroundColor Yellow
pip uninstall -y torch torchvision torchaudio

Write-Host "`n2. Installing PyTorch 2.6+ with CUDA 12.1..." -ForegroundColor Yellow
Write-Host "   This may take 2-3 minutes..." -ForegroundColor Gray
pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu121

Write-Host "`n3. Verifying installation..." -ForegroundColor Yellow
python -c "import torch; print(f'PyTorch version: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}')"

Write-Host "`n" -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green
Write-Host "DONE! Translation should now work" -ForegroundColor Green
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green
Write-Host "`nRestart the backend: python main.py" -ForegroundColor Cyan
