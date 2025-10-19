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

$logBase = Join-Path $env:TEMP ("cloudflared-" + (Get-Date -Format "yyyyMMdd_HHmmss"))
$logOut = "$logBase-out.log"
$logErr = "$logBase-err.log"

$proc = Start-Process -FilePath $cf.Source -ArgumentList @("tunnel","--url","http://localhost:$Port") -NoNewWindow -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
Start-Sleep -Milliseconds 200

# Poll logs for the trycloudflare URL
$deadline = (Get-Date).AddSeconds($TimeoutSec)
$url = $null
$rx = [regex]"https://[a-z0-9-]+\.trycloudflare\.com"
Write-Host "[i] Waiting for tunnel URL (timeout ${TimeoutSec}s)..." -ForegroundColor Yellow
while (-not $url -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 300
  if ((Test-Path $logOut) -or (Test-Path $logErr)) {
    try {
      $txt = ""
      if (Test-Path $logOut) { $txt += (Get-Content -Raw -ErrorAction SilentlyContinue $logOut) }
      if (Test-Path $logErr) { $txt += "`n" + (Get-Content -Raw -ErrorAction SilentlyContinue $logErr) }
      $m = $rx.Match($txt)
      if ($m.Success) { $url = $m.Value }
    } catch {}
  }
}

if (-not $url) {
  Write-Host "[!] Could not detect tunnel URL. See logs: $logOut , $logErr" -ForegroundColor Yellow
  Wait-Process -Id $proc.Id
  exit 1
}

Write-Host "[+] Tunnel URL: $url" -ForegroundColor Green

$dashBase = if ([string]::IsNullOrWhiteSpace($Dashboard)) { "https://67070194.github.io/TheForecaster-2-PocketEdition/dashboard" } else { $Dashboard }
$dashUrl = ($dashBase.TrimEnd('/')) + '?api=' + $url + '&fw=' + $url
Write-Host "[+] Dashboard URL: $dashUrl" -ForegroundColor Green

if (-not $NoClipboard) {
  try {
    Set-Clipboard -Value $dashUrl
    Write-Host "[✓] Copied Dashboard URL to clipboard" -ForegroundColor Green
  } catch {
    Write-Host "[!] Could not copy to clipboard" -ForegroundColor Yellow
  }
}

if (-not $NoOpenBrowser) {
  try {
    Start-Process cmd.exe -ArgumentList @('/c','start','',"$dashUrl") | Out-Null
    Write-Host "[✓] Opened browser" -ForegroundColor Green
  } catch {
    Write-Host "[!] Could not open browser" -ForegroundColor Yellow
  }
}

Write-Host "[i] Tunnel is running (PID $($proc.Id)). Press Ctrl+C in this window to stop it, or run 'tunnel-stop.cmd'." -ForegroundColor Cyan
Write-Host "[i] Log files: $logOut , $logErr" -ForegroundColor DarkGray

# Keep the tunnel process alive; show a minimal heartbeat
try { Wait-Process -Id $proc.Id } catch {}
