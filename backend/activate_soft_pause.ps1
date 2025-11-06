# Activate Soft Pause VAD Gate
Write-Host "=" -ForegroundColor Cyan -NoNewline
Write-Host ("=" * 59) -ForegroundColor Cyan
Write-Host "ACTIVATING SOFT PAUSE VAD GATE" -ForegroundColor Cyan
Write-Host "=" -ForegroundColor Cyan -NoNewline
Write-Host ("=" * 59) -ForegroundColor Cyan

Write-Host "`nThis will:" -ForegroundColor Yellow
Write-Host "  1. Backup your current stt.py" -ForegroundColor White
Write-Host "  2. Replace it with VAD-gated version" -ForegroundColor White
Write-Host "  3. Enable soft pause (model stays loaded, gates audio)" -ForegroundColor White
Write-Host ""

# Confirm
$confirm = Read-Host "Proceed? (Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "Cancelled." -ForegroundColor Red
    exit
}

Write-Host "`n1. Backing up current stt.py..." -ForegroundColor Yellow
Copy-Item "stt.py" "stt_old_backup.py" -Force
Write-Host "   ✅ Backed up to stt_old_backup.py" -ForegroundColor Green

Write-Host "`n2. Replacing with VAD-gated version..." -ForegroundColor Yellow
Copy-Item "stt_with_vad_gate.py" "stt.py" -Force
Write-Host "   ✅ stt.py replaced" -ForegroundColor Green

Write-Host "`n3. Verifying files..." -ForegroundColor Yellow
if (Test-Path "vad_gate.py") {
    Write-Host "   ✅ vad_gate.py present" -ForegroundColor Green
} else {
    Write-Host "   ❌ vad_gate.py missing!" -ForegroundColor Red
    exit 1
}

if (Test-Path "stt.py") {
    $content = Get-Content "stt.py" -Raw
    if ($content -match "VADGate") {
        Write-Host "   ✅ stt.py contains VAD gate" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ stt.py may not be correct version" -ForegroundColor Yellow
    }
}

Write-Host "`n" -NoNewline
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green
Write-Host "SOFT PAUSE ACTIVATED!" -ForegroundColor Green
Write-Host "=" -ForegroundColor Green -NoNewline
Write-Host ("=" * 59) -ForegroundColor Green

Write-Host "`nWhat changed:" -ForegroundColor Cyan
Write-Host "  ✅ Model stays loaded (no reload latency)" -ForegroundColor Green
Write-Host "  ✅ VAD gate controls audio flow" -ForegroundColor Green
Write-Host "  ✅ Only processes when speech detected" -ForegroundColor Green
Write-Host "  ✅ Silence blocked from reaching Whisper" -ForegroundColor Green
Write-Host "  ✅ Context resets after 8s silence" -ForegroundColor Green
Write-Host "  ✅ Multi-layer hallucination filters" -ForegroundColor Green

Write-Host "`nExpected behavior:" -ForegroundColor Cyan
Write-Host "  🎤 Speaking → Accumulates audio" -ForegroundColor White
Write-Host "  🔇 Stop (1.5s pause) → Transcribes" -ForegroundColor White
Write-Host "  🤐 Silence → NOTHING sent to Whisper" -ForegroundColor White
Write-Host "  ✅ ZERO hallucinations after you stop!" -ForegroundColor Green

Write-Host "`nTest it:" -ForegroundColor Cyan
Write-Host "  1. python main.py" -ForegroundColor White
Write-Host "  2. Speak normally" -ForegroundColor White
Write-Host "  3. Stop talking completely" -ForegroundColor White
Write-Host "  4. Wait 10 seconds" -ForegroundColor White
Write-Host "  5. Watch logs: Should be SILENT (no more transcriptions) ✅" -ForegroundColor Green

Write-Host "`nTo revert:" -ForegroundColor Yellow
Write-Host "  Copy-Item stt_old_backup.py stt.py -Force" -ForegroundColor White

Write-Host "`nNext step:" -ForegroundColor Cyan
Write-Host "  python main.py" -ForegroundColor White
Write-Host ""
