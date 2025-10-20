# Domain Setup Guide: hcn.in.net with Cloudflare Tunnel

This guide explains how to configure your custom domain `hcn.in.net` with Cloudflare Tunnel to expose your local backend server at `https://api.hcn.in.net`.

---

## 📋 Prerequisites

- [x] Domain `hcn.in.net` purchased
- [x] Domain migrating to Cloudflare DNS (wait for confirmation email)
- [ ] cloudflared installed on your machine
- [ ] Backend server running locally (Docker or native)

---

## ⏳ Step 0: Wait for Cloudflare Migration

**Status Check**:
1. Go to: https://dash.cloudflare.com
2. Select domain: `hcn.in.net`
3. Check status banner

**Expected States**:
- 🟡 **Pending**: Nameserver change in progress (wait)
- 🟢 **Active**: Domain is ready (proceed to Step 1)

**Typical wait time**: 2-24 hours (usually under 2 hours)

**You'll receive email**: "hcn.in.net is now active on Cloudflare"

---

## 🚀 Step 1: Install cloudflared

### Windows
```powershell
# Download from GitHub
https://github.com/cloudflare/cloudflared/releases

# Download: cloudflared-windows-amd64.exe
# Rename to: cloudflared.exe
# Move to: C:\cloudflared\cloudflared.exe

# Add to PATH or use full path
```

### Linux
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
cloudflared --version
```

### macOS
```bash
brew install cloudflare/cloudflare/cloudflared
# Or download manually like Linux
```

---

## 🔐 Step 2: Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

**What happens**:
1. Opens browser → Cloudflare login
2. Select domain: `hcn.in.net`
3. Click "Authorize"
4. Certificate saved to `~/.cloudflared/cert.pem`

**Windows path**: `C:\Users\<YourName>\.cloudflared\cert.pem`

---

## 🛠️ Step 3: Create Named Tunnel

```bash
cloudflared tunnel create forecaster-api
```

**Output Example**:
```
Tunnel credentials written to C:\Users\YourName\.cloudflared\abc123-def4-5678-90ab-cdef12345678.json
Tunnel ID: abc123-def4-5678-90ab-cdef12345678
```

**⚠️ SAVE THE TUNNEL ID!** You'll need it for configuration.

---

## ⚙️ Step 4: Create Configuration File

Create file: `~/.cloudflared/config.yml`

**Windows**: `C:\Users\<YourName>\.cloudflared\config.yml`
**Linux/Mac**: `/home/yourusername/.cloudflared/config.yml`

```yaml
# Replace with YOUR actual Tunnel ID from Step 3
tunnel: abc123-def4-5678-90ab-cdef12345678

# Path to credentials file (auto-generated in Step 3)
# Windows example:
credentials-file: C:\Users\YourName\.cloudflared\abc123-def4-5678-90ab-cdef12345678.json

# Linux/Mac example:
# credentials-file: /home/yourusername/.cloudflared/abc123-def4-5678-90ab-cdef12345678.json

# Ingress rules (traffic routing)
ingress:
  # Route api.hcn.in.net to local backend server
  - hostname: api.hcn.in.net
    service: http://localhost:3001

  # Catch-all (required, must be last)
  - service: http_status:404
```

**Important**: Replace `abc123-def4-5678-90ab-cdef12345678` with your actual Tunnel ID!

---

## 🌐 Step 5: Configure DNS

### Option A: Automatic (Recommended)

```bash
cloudflared tunnel route dns forecaster-api api.hcn.in.net
```

**Output**:
```
Successfully routed tunnel forecaster-api to https://api.hcn.in.net
```

**What this does**:
- Creates CNAME record: `api.hcn.in.net` → `abc123-def4-5678-90ab-cdef12345678.cfargotunnel.com`
- Enables Cloudflare proxy (orange cloud)
- Configures SSL/TLS automatically

### Option B: Manual (If automatic fails)

1. Go to: Cloudflare Dashboard → `hcn.in.net` → DNS → Records
2. Click "Add record"
3. Configure:
   - **Type**: CNAME
   - **Name**: `api`
   - **Target**: `<TUNNEL-ID>.cfargotunnel.com` (from Step 3)
   - **Proxy status**: ✅ Proxied (orange cloud)
   - **TTL**: Auto
4. Click "Save"

---

## ▶️ Step 6: Start the Tunnel

```bash
cloudflared tunnel run forecaster-api
```

**Expected Output**:
```
2025-01-20T10:30:00Z INF Starting tunnel tunnelID=abc123-def4-5678-90ab-cdef12345678
2025-01-20T10:30:01Z INF Connection registered connIndex=0 location=SIN
2025-01-20T10:30:01Z INF Connection registered connIndex=1 location=HKG
2025-01-20T10:30:02Z INF Connection registered connIndex=2 location=NRT
2025-01-20T10:30:02Z INF Connection registered connIndex=3 location=SJC
```

**✅ Tunnel is running!** Keep this terminal open.

---

## ✅ Step 7: Test the Connection

### A. Start Backend Server

```bash
# Terminal 1: Start Docker stack
docker compose up -d db server

# Wait for services to be healthy (~30 seconds)
docker compose ps
```

### B. Test API via Domain

```bash
# Test health endpoint
curl https://api.hcn.in.net/health

# Expected response:
{"db":"online","server":"running"}
```

```bash
# Test latest reading
curl https://api.hcn.in.net/api/latest

# Expected: JSON with sensor data or null
```

```bash
# Test in browser
https://api.hcn.in.net/health
```

**✅ If you see JSON response, the tunnel is working!**

---

## 🔄 Step 8: Configure GitHub Repository Variables

Now that your API is accessible at `https://api.hcn.in.net`, configure the frontend to use it.

### A. Set Repository Variables

1. Go to: GitHub → Your Repository → Settings → Secrets and variables → Actions → **Variables** tab
2. Click "New repository variable"

**Variable 1**:
- Name: `VITE_API_BASE`
- Value: `https://api.hcn.in.net`

**Variable 2**:
- Name: `VITE_FW_BASE`
- Value: `https://api.hcn.in.net`

3. Click "Add variable" for each

### B. Trigger Redeploy

**Option A**: Push an empty commit
```bash
git commit --allow-empty -m "Update API domain to hcn.in.net"
git push origin main
```

**Option B**: Manual re-run
1. Go to: GitHub → Actions → deploy-gh-pages
2. Click latest workflow run
3. Click "Re-run all jobs"

**Wait ~2-3 minutes** for deployment to complete.

---

## 🧪 Step 9: Test End-to-End

### A. Open Dashboard

```
https://yourusername.github.io/TheForecaster-2-PocketEdition/
```

### B. Check DevTools Console (F12)

**Look for**:
```
GET https://api.hcn.in.net/health
GET https://api.hcn.in.net/api/readings?minutes=480
```

**Should NOT see**:
- `localhost` URLs
- MQTT config messages
- Page reloads

### C. Verify Functionality

- ✅ Database status shows "Online" (instantly, no delay)
- ✅ Historical charts load
- ✅ Real-time data updates (if ESP32 publishing)
- ✅ Firmware upload works

### D. Test from Different Device

1. Open same URL on phone/tablet
2. Should work immediately
3. No configuration needed

**✅ Success if everything connects automatically!**

---

## 🔧 Step 10: Run Tunnel as Background Service

### Windows (Task Scheduler)

1. **Create batch file**: `C:\cloudflared\start-tunnel.bat`
```batch
@echo off
cd C:\cloudflared
cloudflared.exe tunnel run forecaster-api
```

2. **Open Task Scheduler**
   - Search "Task Scheduler" in Start menu
   - Click "Create Basic Task"

3. **Configure Task**:
   - Name: `Cloudflare Tunnel - Forecaster API`
   - Description: `Exposes local backend to api.hcn.in.net`
   - Trigger: `When the computer starts`
   - Action: `Start a program`
   - Program: `C:\cloudflared\start-tunnel.bat`
   - ✅ Run whether user is logged on or not
   - ✅ Run with highest privileges

4. **Test**:
```bash
# Reboot PC
# Check tunnel is running:
https://api.hcn.in.net/health
```

### Linux (systemd)

```bash
# Install as service
sudo cloudflared service install

# Edit service file (if needed)
sudo systemctl edit cloudflared

# Start service
sudo systemctl start cloudflared

# Enable on boot
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared

# View logs
sudo journalctl -u cloudflared -f
```

### macOS (LaunchD)

```bash
# Install as service
sudo cloudflared service install

# Start service
sudo launchctl load /Library/LaunchDaemons/com.cloudflare.cloudflared.plist

# Check status
sudo launchctl list | grep cloudflared
```

---

## 🔍 Troubleshooting

### DNS not resolving

**Problem**: `curl: Could not resolve host: api.hcn.in.net`

**Check**:
```bash
# Check DNS propagation
nslookup api.hcn.in.net
# Should return Cloudflare IPs (104.x.x.x or 172.x.x.x)

# Or use online tool:
https://dnschecker.org/#CNAME/api.hcn.in.net
```

**Fix**:
- Wait 5-10 minutes for DNS propagation
- Verify CNAME record exists in Cloudflare dashboard
- Flush DNS cache:
  ```bash
  # Windows
  ipconfig /flushdns

  # Linux
  sudo systemd-resolve --flush-caches

  # Mac
  sudo dscacheutil -flushcache
  ```

---

### Tunnel connects but API returns 502

**Problem**: Tunnel shows "connected" but API returns 502 Bad Gateway

**Possible causes**:
1. Backend server not running
2. Wrong port in config.yml
3. Firewall blocking localhost:3001

**Check**:
```bash
# Test local server directly
curl http://localhost:3001/health

# If this works but tunnel doesn't:
# 1. Check config.yml has correct port (3001)
# 2. Restart tunnel:
#    Ctrl+C → cloudflared tunnel run forecaster-api
```

**Verify Docker**:
```bash
docker compose ps
# All services should be "healthy" or "running"

docker compose logs server
# Should see: "Server listening on port 3001"
```

---

### SSL/TLS errors

**Problem**: Browser shows "Not secure" or SSL errors

**Fix**:
1. Go to: Cloudflare Dashboard → SSL/TLS
2. Set encryption mode: **Full** (or **Full (strict)** if you have cert on origin)
3. Wait 1-2 minutes
4. Refresh browser

**Note**: Cloudflare provides free SSL certificate automatically

---

### Tunnel disconnects frequently

**Problem**: Tunnel loses connection every few minutes

**Possible causes**:
1. Unstable internet connection
2. Firewall blocking tunnel
3. ISP blocking Cloudflare IPs

**Fix**:
```bash
# Check tunnel logs for errors
cloudflared tunnel run forecaster-api

# Look for:
# - "connection failed" → network issue
# - "authentication failed" → wrong credentials
# - "tunnel not found" → wrong tunnel ID
```

**Add to config.yml**:
```yaml
tunnel: abc123-def4-5678-90ab-cdef12345678
credentials-file: /path/to/abc123.json

# Add retry configuration
retries: 5
grace-period: 30s

ingress:
  - hostname: api.hcn.in.net
    service: http://localhost:3001
  - service: http_status:404
```

---

### Frontend still showing MQTT config messages

**Problem**: Console shows MQTT subscription/config messages

**Cause**: Old build still cached

**Fix**:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check build has new env vars:
   ```bash
   # Check GitHub Actions logs
   # Should see: VITE_API_BASE=https://api.hcn.in.net
   ```

---

## 📊 Verification Checklist

After setup, verify:

- [ ] Domain migration complete (Cloudflare email received)
- [ ] Tunnel created (`cloudflared tunnel list` shows forecaster-api)
- [ ] DNS record exists (api.hcn.in.net → tunnel CNAME)
- [ ] Tunnel running (`cloudflared tunnel run` shows connections)
- [ ] Backend healthy (`curl https://api.hcn.in.net/health`)
- [ ] GitHub variables set (VITE_API_BASE, VITE_FW_BASE)
- [ ] Frontend redeployed (GitHub Actions successful)
- [ ] Dashboard connects to domain (no MQTT config)
- [ ] Database shows "Online" instantly
- [ ] Works on multiple devices/browsers

---

## 🎯 Summary

**Your setup**:
```
Domain:     hcn.in.net
Subdomain:  api.hcn.in.net
Backend:    http://localhost:3001 (Docker)
Tunnel:     Cloudflare Tunnel (forecaster-api)
Frontend:   GitHub Pages (yourusername.github.io/project)
```

**What users need**:
```
https://yourusername.github.io/TheForecaster-2-PocketEdition/
```

**What happens automatically**:
1. Frontend loads from GitHub Pages
2. Makes API calls to `https://api.hcn.in.net`
3. Cloudflare Tunnel routes to your local server
4. Database connects
5. Real-time data displays

**No configuration, no MQTT, just works!** 🎉

---

## 🔗 Useful Links

- [Cloudflare Dashboard](https://dash.cloudflare.com)
- [Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [DNS Checker](https://dnschecker.org)
- [SSL Test](https://www.ssllabs.com/ssltest/)

---

## 📝 Next Steps

After confirming everything works:

1. ✅ Configure tunnel to auto-start (Step 10)
2. ✅ Clean up old MQTT config code (see CLEANUP_GUIDE.md)
3. ✅ Update README with new deployment instructions
4. ✅ Share dashboard link with users!

**Congratulations! Your domain-based deployment is complete!** 🚀
