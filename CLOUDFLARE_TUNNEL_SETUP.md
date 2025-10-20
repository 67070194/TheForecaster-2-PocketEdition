# Cloudflare Tunnel Setup Guide

This guide explains how to set up a **permanent, free Cloudflare Tunnel** for your backend server, eliminating the URL change problem with Quick Tunnels.

## Why Use Named Tunnel?

### Problem with Quick Tunnel
```bash
cloudflared tunnel --url http://localhost:3001
# Output: https://random-words-1234.trycloudflare.com
# ❌ URL changes EVERY time you restart
# ❌ Config distribution breaks
# ❌ Users can't connect to database
```

### Solution: Named Tunnel
```bash
cloudflared tunnel run forecaster-2-pe
# Output: https://forecaster-api-uuid.cfargotunnel.com
# ✅ URL is PERMANENT (never changes)
# ✅ Config works forever
# ✅ All users connect reliably
```

---

## Prerequisites

- Cloudflare account (free tier works)
- cloudflared installed on your machine
- Backend server running (Docker or local)

---

## Step-by-Step Setup

### Step 1: Install cloudflared

#### Windows
1. Download from: https://github.com/cloudflare/cloudflared/releases
2. Download `cloudflared-windows-amd64.exe`
3. Rename to `cloudflared.exe`
4. Move to a directory in your PATH or use full path

#### Linux
```bash
# Download latest release
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64

# Make executable
chmod +x cloudflared-linux-amd64

# Move to system path
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Verify installation
cloudflared --version
```

#### macOS
```bash
# Using Homebrew
brew install cloudflare/cloudflare/cloudflared

# Or download directly
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz | tar -xz
sudo mv cloudflared /usr/local/bin/
```

---

### Step 2: Login to Cloudflare

```bash
cloudflared tunnel login
```

**What happens:**
1. Opens browser with Cloudflare login
2. Select your account (or create free account)
3. Authorize cloudflared
4. Certificate saved to `~/.cloudflared/cert.pem` (Windows: `C:\Users\<YourName>\.cloudflared\cert.pem`)

---

### Step 3: Create Named Tunnel

```bash
cloudflared tunnel create forecaster-2-pe
```

**Output example:**
```
Tunnel credentials written to C:\Users\YourName\.cloudflared\abc123-def4-5678-90ab-cdef12345678.json
Tunnel ID: abc123-def4-5678-90ab-cdef12345678
```

**⚠️ IMPORTANT**: Save the Tunnel ID! You'll need it for configuration.

---

### Step 4: Create Configuration File

Create file: `~/.cloudflared/config.yml` (Windows: `C:\Users\<YourName>\.cloudflared\config.yml`)

```yaml
# Replace <TUNNEL_ID> with your actual tunnel ID from Step 3
tunnel: abc123-def4-5678-90ab-cdef12345678

# Credentials file path (auto-generated in Step 3)
credentials-file: C:\Users\YourName\.cloudflared\abc123-def4-5678-90ab-cdef12345678.json

# Ingress rules (routes traffic)
ingress:
  # Route ALL traffic to local backend server
  - service: http://localhost:3001
```

**Linux/Mac config example:**
```yaml
tunnel: abc123-def4-5678-90ab-cdef12345678
credentials-file: /home/yourusername/.cloudflared/abc123-def4-5678-90ab-cdef12345678.json

ingress:
  - service: http://localhost:3001
```

---

### Step 5: Route DNS (Get Your Permanent URL)

```bash
cloudflared tunnel route dns forecaster-2-pe forecaster-api
```

**What this does:**
- Creates subdomain: `forecaster-api.<your-cloudflare-zone>.com`
- OR if you don't have custom domain: `forecaster-api-abc123.cfargotunnel.com`

**Output:**
```
Successfully routed tunnel forecaster-2-pe to https://forecaster-api-abc123.cfargotunnel.com
```

**🎉 This is your PERMANENT URL!** Save it for the next steps.

#### Option: Use Custom Subdomain (If You Have a Domain)

If you have a domain added to Cloudflare (e.g., `yourdomain.com`):

```bash
cloudflared tunnel route dns forecaster-2-pe api.yourdomain.com
```

Result: `https://api.yourdomain.com` (fully custom!)

---

### Step 6: Start the Tunnel

```bash
cloudflared tunnel run forecaster-2-pe
```

**Output:**
```
2025-01-20T10:30:00Z INF Starting tunnel tunnelID=abc123...
2025-01-20T10:30:01Z INF Connection registered connIndex=0
2025-01-20T10:30:01Z INF Tunnel started successfully
```

**✅ Tunnel is now running!**

Test it:
```bash
curl https://forecaster-api-abc123.cfargotunnel.com/health
# Should return: {"db":"online","server":"running"}
```

---

### Step 7: Configure Your Dashboard

Now that you have a permanent URL, you need to tell the dashboard to use it.

#### Method 1: Using Query Parameters (One-Time Setup)

Open your GitHub Pages dashboard with:
```
https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=https://forecaster-api-abc123.cfargotunnel.com
```

**What happens:**
1. Dashboard stores URL in localStorage
2. Dashboard publishes config to MQTT
3. Server saves config to database
4. ALL future users get this config automatically

#### Method 2: Set GitHub Repository Variable (Build-Time)

1. Go to: GitHub Repo → Settings → Secrets and variables → Actions → Variables
2. Create variable:
   - Name: `VITE_API_BASE`
   - Value: `https://forecaster-api-abc123.cfargotunnel.com`
3. Re-run GitHub Actions workflow (Actions → deploy-gh-pages → Re-run all jobs)

New builds will have URL baked in (no query params needed).

---

## Running Tunnel as Background Service

### Windows (Task Scheduler)

1. **Create batch file** `start-tunnel.bat`:
```batch
@echo off
cloudflared tunnel run forecaster-2-pe
```

2. **Open Task Scheduler** → Create Basic Task
   - Name: "Cloudflare Tunnel - Forecaster"
   - Trigger: "When the computer starts"
   - Action: "Start a program"
   - Program: `C:\path\to\start-tunnel.bat`
   - ✅ Run whether user is logged on or not

### Linux/Mac (systemd)

1. **Install as service**:
```bash
sudo cloudflared service install
```

2. **Start service**:
```bash
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

3. **Check status**:
```bash
sudo systemctl status cloudflared
```

4. **View logs**:
```bash
sudo journalctl -u cloudflared -f
```

---

## Testing End-to-End

### 1. Start Backend Server

```bash
# With Docker
docker compose up -d db server

# Without Docker
cd server && npm run dev
```

### 2. Start Tunnel

```bash
cloudflared tunnel run forecaster-2-pe
# Keep this running
```

### 3. Test API from Browser

Open: `https://forecaster-api-abc123.cfargotunnel.com/health`

Expected response:
```json
{"db":"online","server":"running"}
```

### 4. Configure Dashboard (First User)

**User A (You):**
1. Open: `https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=https://forecaster-api-abc123.cfargotunnel.com`
2. Dashboard loads, stores config, publishes to MQTT
3. Check console (F12): Should see `[PresenceManager] Config updated via MQTT`
4. Database status should show "Online"

### 5. Test Auto-Discovery (Second User)

**User B (Different browser/computer):**
1. Open: `https://yourusername.github.io/TheForecaster-2-PocketEdition/dashboard`
   - **NO query params needed!**
2. Wait 1-2 seconds
3. Check console: Should see:
   ```
   [PresenceManager] MQTT connected, subscribing to config...
   [PresenceManager] Subscribed to web/config
   [PresenceManager] Config updated via MQTT, reloading...
   ```
4. Page reloads automatically
5. Database shows "Online"

**✅ Success!** User B got config via MQTT without any manual setup.

---

## Troubleshooting

### Tunnel URL changes even with Named Tunnel

**Problem**: Still seeing random URLs
**Cause**: Using `cloudflared tunnel --url` instead of `cloudflared tunnel run`

**Solution**:
```bash
# ❌ Wrong (Quick Tunnel)
cloudflared tunnel --url http://localhost:3001

# ✅ Correct (Named Tunnel)
cloudflared tunnel run forecaster-2-pe
```

---

### DNS route fails

**Error**: `failed to route tunnel: no zones found`

**Cause**: No domain added to Cloudflare account

**Solution**: Use Cloudflare-provided subdomain:
```bash
# This gives you: forecaster-api-<uuid>.cfargotunnel.com
cloudflared tunnel route dns forecaster-2-pe forecaster-api
```

---

### Tunnel connects but API returns 502

**Possible causes:**
1. Backend server not running
2. Wrong port in config.yml
3. Firewall blocking localhost:3001

**Check:**
```bash
# Test local server directly
curl http://localhost:3001/health

# If this works but tunnel doesn't, check config.yml:
# ingress:
#   - service: http://localhost:3001  ← Make sure this matches your server port
```

---

### User B doesn't get config via MQTT

**Check:**
1. **Server logs**: `docker compose logs -f server`
   - Should see: `[Config] Published to MQTT and saved to DB`
2. **Database**:
   ```bash
   docker compose exec db psql -U postgres -d iotdb
   SELECT * FROM system_config WHERE key = 'web_config';
   ```
3. **MQTT broker**: Use MQTT client to test:
   ```bash
   # Subscribe to config topic
   mosquitto_sub -h broker.hivemq.com -t "TFCT_2_PE/web/config" -v
   ```

**Fix**: Republish config via User A:
```
https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=https://forecaster-api-abc123.cfargotunnel.com
```

---

## Cost & Limits

### Cloudflare Tunnel (Free Tier)
- ✅ Unlimited tunnels
- ✅ Unlimited bandwidth
- ✅ HTTPS included
- ✅ DDoS protection
- ✅ No credit card required

### What's NOT Free
- Custom domain (optional, ~$10/year if you want `api.yourdomain.com`)
- Cloudflare Teams features (not needed for this project)

---

## Comparison: Quick Tunnel vs Named Tunnel

| Feature | Quick Tunnel | Named Tunnel |
|---------|-------------|--------------|
| **Setup Time** | 10 seconds | 5 minutes |
| **Command** | `cloudflared tunnel --url ...` | `cloudflared tunnel run ...` |
| **URL** | Changes every restart | Permanent forever |
| **DNS** | Random subdomain | Custom subdomain |
| **Config File** | Not needed | Required |
| **Use Case** | Testing/demos | Production |
| **Reliability** | ⚠️ Low (URL changes) | ✅ High (stable) |

---

## Advanced: Multiple Services

If you want to expose multiple services (e.g., separate web + API):

**config.yml:**
```yaml
tunnel: abc123-def4-5678-90ab-cdef12345678
credentials-file: /path/to/abc123.json

ingress:
  # Route api subdomain to backend
  - hostname: api.yourdomain.com
    service: http://localhost:3001

  # Route web subdomain to frontend (if self-hosting)
  - hostname: web.yourdomain.com
    service: http://localhost:8080

  # Catch-all (required)
  - service: http_status:404
```

**Route DNS:**
```bash
cloudflared tunnel route dns forecaster-2-pe api.yourdomain.com
cloudflared tunnel route dns forecaster-2-pe web.yourdomain.com
```

---

## Next Steps

After setting up Named Tunnel:

1. ✅ **Test with multiple browsers** (User A, User B)
2. ✅ **Add tunnel to startup** (systemd/Task Scheduler)
3. ✅ **Update README** with your tunnel URL
4. ✅ **Share GitHub Pages link** with others (they'll auto-connect)

**Your users just need:**
```
https://yourusername.github.io/TheForecaster-2-PocketEdition/
```

Config is distributed automatically! 🎉

---

## Summary

| Step | Command | Result |
|------|---------|--------|
| 1. Install | `brew install cloudflared` (Mac) | ✅ Tool ready |
| 2. Login | `cloudflared tunnel login` | ✅ Authenticated |
| 3. Create | `cloudflared tunnel create forecaster-2-pe` | ✅ Tunnel ID |
| 4. Config | Edit `~/.cloudflared/config.yml` | ✅ Route rules |
| 5. DNS | `cloudflared tunnel route dns ...` | ✅ Permanent URL |
| 6. Run | `cloudflared tunnel run forecaster-2-pe` | ✅ Live! |

**Result**: Permanent, free HTTPS URL that never changes. Perfect for this project! 🚀
