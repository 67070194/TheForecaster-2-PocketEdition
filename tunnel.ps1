param(
  [int]$Port = 3001,
  [string]$Dashboard = "https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard",
  [switch]$NoOpenBrowser,
  [switch]$NoClipboard,
  [int]$TimeoutSec = 60
)

function Fail($msg) { Write-Host "[x] $msg" -ForegroundColor Red; exit 1 }

Write-Host "[i] Starting cloudflared quick tunnel for http://localhost:$Port" -ForegroundColor Cyan

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) { Fail "cloudflared not found. Install via: winget install Cloudflare.cloudflared" }

$log = Join-Path $env:TEMP ("cloudflared-" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".log")

$proc = Start-Process -FilePath $cf.Source -ArgumentList @("tunnel","--url","http://localhost:$Port") -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $log
Start-Sleep -Milliseconds 200

# Poll log for the trycloudflare URL
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$url = $null
$rx = [regex]"https://[a-z0-9-]+\.trycloudflare\.com"
Write-Host "[i] Waiting for tunnel URL (timeout ${TimeoutSec}s)..." -ForegroundColor Yellow
while (-not $url -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
  if (Test-Path $log) {
    try {
      $txt = Get-Content -Raw -ErrorAction SilentlyContinue $log
      $m = $rx.Match($txt)
      if ($m.Success) { $url = $m.Value }
    } catch {}
  }
}

if (-not $url) {
  Write-Host "[!] Could not detect tunnel URL. See log: $log" -ForegroundColor Yellow
  Wait-Process -Id $proc.Id
  exit 1
}

Write-Host "[+] Tunnel URL: $url" -ForegroundColor Green

$dashUrl = "$Dashboard?api=$url&fw=$url"
Write-Host "[+] Dashboard URL: $dashUrl" -ForegroundColor Green

if (-not $NoClipboard) {
  try { Set-Clipboard -Value $dashUrl; Write-Host "[✓] Copied Dashboard URL to clipboard" -ForegroundColor Green } catch { Write-Host "[!] Could not copy to clipboard" -ForegroundColor Yellow }
}

if (-not $NoOpenBrowser) {
  try { Start-Process $dashUrl | Out-Null; Write-Host "[✓] Opened browser" -ForegroundColor Green } catch { Write-Host "[!] Could not open browser" -ForegroundColor Yellow }
}

Write-Host "[i] Tunnel is running (PID $($proc.Id)). Press Ctrl+C in this window to stop it, or run 'tunnel-stop.cmd'." -ForegroundColor Cyan
Write-Host "[i] Log file: $log" -ForegroundColor DarkGray

# Keep the tunnel process alive; show a minimal heartbeat
try { Wait-Process -Id $proc.Id } catch {}

