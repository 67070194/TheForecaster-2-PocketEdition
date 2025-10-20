# Configuration Distribution System

This document explains how the dashboard auto-discovery system works and solves the "other users can't connect to database" problem.

---

## The Problem

### Before This Fix

**Scenario:**
1. You deploy dashboard to GitHub Pages
2. You run backend with Cloudflare Quick Tunnel: `https://random-xyz-1234.trycloudflare.com`
3. You open dashboard with: `?api=https://random-xyz-1234.trycloudflare.com`
4. Dashboard works! Database shows "Online"
5. You share link with Friend → `https://yourusername.github.io/TheForecaster-2-PocketEdition/`
6. **Friend's dashboard shows "Database: Offline"** ❌

**Why?**
- Friend doesn't have `?api=...` in URL
- Friend's browser has no API URL stored
- Quick Tunnel URL changed since you set it up
- No way for Friend to discover correct API URL

---

## The Solution

### How Config Distribution Works

We use **3-layer config discovery** with automatic MQTT distribution:

```
┌──────────────────────────────────────────────────────────────┐
│  User A (First Person - You)                                │
│  Opens: ...github.io/project/?api=https://tunnel.com       │
└────────────┬─────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────┐
    │ 1. Store in localStorage│
    │    tfct.apiBase         │
    └────────┬───────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ 2. Publish to MQTT         │
    │    Topic: TFCT_2_PE/web/   │
    │           config           │
    │    Payload: {"api":"..."}  │
    │    Retained: true          │
    └────────┬───────────────────┘
             │
             ▼
    ┌────────────────────────────┐
    │ 3. Server receives & saves │
    │    - Saves to database     │
    │    - Republishes every 60s │
    └────────┬───────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│  User B (Second Person - Friend)                          │
│  Opens: ...github.io/project/  (NO query params)          │
└────────┬───────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ 1. Subscribe to MQTT first   │
│    Topic: TFCT_2_PE/web/     │
│           config             │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ 2. Wait 500ms (critical!)    │
│    Ensures subscription       │
│    is ready                   │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ 3. Publish "online" status   │
│    Server sees this and       │
│    re-publishes config        │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ 4. Receive config via MQTT   │
│    Store in localStorage      │
│    Reload page                │
└────────┬─────────────────────┘
         │
         ▼
┌──────────────────────────────┐
│ 5. Second load uses stored   │
│    config → Database Online! │
└──────────────────────────────┘
```

---

## Implementation Details

### 1. Frontend: PresenceManager.tsx

**Key Changes:**

#### Before (Broken - Race Condition)
```typescript
client.on("connect", () => {
  client.subscribe("TFCT_2_PE/web/config");  // ← Subscribe
  publishOnline();                            // ← Publish immediately
  requestConfig();                            // ← Request config
});
// ❌ Server responds before subscribe completes → message lost
```

#### After (Fixed - Subscribe First)
```typescript
client.on("connect", () => {
  // 1. Subscribe FIRST
  client.subscribe("TFCT_2_PE/web/config", (err) => {
    console.log('Subscribed to web/config');
  });

  // 2. Wait 500ms for subscription to complete
  setTimeout(() => {
    publishOnline();     // 3. Then publish online
    requestConfig();     // 4. Then request config
  }, 500);
});
// ✅ Subscription ready before server responds → message received
```

**Message Handler:**
```typescript
const onMessage = (topic: string, payload: Buffer) => {
  if (topic !== "TFCT_2_PE/web/config") return;

  const config = JSON.parse(payload.toString());
  const api = config?.api || '';
  const fw = config?.fw || '';

  // Check if config changed
  const curApi = localStorage.getItem('tfct.apiBase') || '';
  if (api && api !== curApi) {
    localStorage.setItem('tfct.apiBase', api);
    window.location.reload();  // Reload to apply new config
  }
};
```

---

### 2. Backend: server/index.js

**Key Features:**

#### A. Database Persistence

**New Table** (`db/init/02_system_config.sql`):
```sql
CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Load on Startup:**
```javascript
async function loadWebConfigFromDB() {
  const result = await pool.query(
    'SELECT value FROM system_config WHERE key = $1',
    ['web_config']
  );
  if (result.rowCount > 0) {
    latestWebConfig = result.rows[0].value;
    return latestWebConfig;
  }
  return null;
}
```

**Save on Update:**
```javascript
async function saveWebConfigToDB(configJson) {
  await pool.query(
    'INSERT INTO system_config (key, value) VALUES ($1, $2) ' +
    'ON CONFLICT (key) DO UPDATE SET value = $2',
    ['web_config', configJson]
  );
}
```

#### B. MQTT Publish on Startup

```javascript
client.on('connect', async () => {
  // Load config from database
  const config = await loadWebConfigFromDB();

  // Publish to MQTT with retain flag
  if (config && config !== '{}') {
    client.publish('TFCT_2_PE/web/config', config, {
      retain: true,  // ← Critical! Message persists on broker
      qos: 0
    });
  }
});
```

#### C. Respond to Requests

```javascript
client.on('message', async (topic, payload) => {
  // When dashboard publishes "online" or requests config
  if (
    topic === 'TFCT_2_PE/web/req_config' ||
    (topic === 'TFCT_2_PE/web/status' && payload.toString() === 'online')
  ) {
    // Re-publish latest config
    if (latestWebConfig) {
      client.publish('TFCT_2_PE/web/config', latestWebConfig, {
        retain: true,
        qos: 0
      });
    }
  }
});
```

#### D. Periodic Re-publishing

```javascript
// Republish every 60 seconds to reinforce MQTT retained message
setInterval(() => {
  if (mqttClient && mqttClient.connected && latestWebConfig) {
    mqttClient.publish('TFCT_2_PE/web/config', latestWebConfig, {
      retain: true,
      qos: 0
    });
  }
}, 60000);
```

#### E. REST API Endpoint

```javascript
app.post('/web/config', async (req, res) => {
  const payload = JSON.stringify({
    api: req.body.api,
    fw: req.body.fw
  });

  // 1. Save to database (survives restarts)
  await saveWebConfigToDB(payload);

  // 2. Publish to MQTT (instant distribution)
  mqttClient.publish('TFCT_2_PE/web/config', payload, {
    retain: true,
    qos: 0
  });

  // 3. Store in memory
  latestWebConfig = payload;

  res.json({ ok: true, persisted: true });
});
```

---

### 3. Config Resolution Priority

The dashboard resolves API URL in this order:

```javascript
1. URL Query Params (?api=...)
   ↓ (if not found)
2. localStorage (tfct.apiBase)
   ↓ (if not found)
3. Build-time Env Vars (VITE_API_BASE)
   ↓ (if not found)
4. Default: "" (relative URLs, assumes same origin)
```

**From `lib/runtimeConfig.ts`:**
```typescript
export function getApiBase(): string {
  return (
    fromQueryAndPersist('api') ??      // 1. Query param (stores to localStorage)
    fromLocalStorage('api') ??          // 2. Previously stored
    fromWindowConfig('api') ??          // 3. Injected config
    fromEnv('api')                      // 4. Build-time env var
  );
}
```

---

## User Flows

### Flow 1: First User (User A - Setting Up)

```
1. User A opens:
   https://yourusername.github.io/project/?api=https://tunnel.com

2. Dashboard loads:
   - getApiBase() → finds ?api=... query param
   - Stores to localStorage: tfct.apiBase = https://tunnel.com
   - Cleans URL (removes ?api=...)
   - Page reloads

3. After reload:
   - getApiBase() → finds localStorage value
   - PresenceManager connects to MQTT
   - Navigates to /dashboard
   - Publishes "online" to TFCT_2_PE/web/status

4. Server sees "online":
   - Checks latestWebConfig (empty on first run)
   - Dashboard is now connected!

5. (Optional) User A manually calls POST /web/config:
   - Sends: { api: "https://tunnel.com" }
   - Server saves to database
   - Server publishes to MQTT with retain
   - Now config is distributed!
```

**Note**: Currently, User A needs to manually publish config via API call or the dashboard needs a UI button to do this.

---

### Flow 2: Second User (User B - Auto-Discovery)

```
1. User B opens:
   https://yourusername.github.io/project/
   (No query params!)

2. Dashboard loads:
   - getApiBase() → no query param
   - getApiBase() → no localStorage
   - getApiBase() → returns "" (empty)
   - Dashboard shows "Database: Checking..."

3. PresenceManager connects to MQTT:
   - Attaches message handler
   - Subscribes to TFCT_2_PE/web/config
   - Waits 500ms
   - Publishes "online"
   - Publishes "req_config"

4. Server sees "online" or "req_config":
   - Loads latestWebConfig from memory
   - Publishes to TFCT_2_PE/web/config (retained)

5. User B receives config message:
   - Compares with localStorage
   - Finds new API URL
   - Stores to localStorage
   - Reloads page

6. After reload:
   - getApiBase() → finds localStorage value
   - API calls now work!
   - Database shows "Online"
```

---

## MQTT Retained Messages Explained

### What is a Retained Message?

```javascript
client.publish(topic, payload, { retain: true });
```

**Normal Message:**
- Published to topic
- Delivered to current subscribers
- Then discarded
- Late subscribers miss it

**Retained Message:**
- Published to topic
- Delivered to current subscribers
- **Stored on broker**
- **Automatically sent to future subscribers**
- Only 1 retained message per topic (latest wins)

### Why This is Critical

**Scenario A: Without Retained (Broken)**
```
10:00 AM - User A publishes config → MQTT broker
10:05 AM - User B subscribes → gets nothing (message already gone)
Result: User B can't connect
```

**Scenario B: With Retained (Works)**
```
10:00 AM - User A publishes config with retain=true → MQTT broker stores it
10:05 AM - User B subscribes → broker immediately sends stored config
Result: User B auto-connects!
```

---

## Timing Diagram

```
User B Timeline:
─────────────────────────────────────────────────────────────►

0ms     Dashboard loads, PresenceManager starts
        |
        ▼
50ms    MQTT connect() called
        |
        ▼
100ms   "connect" event fires
        |
        ▼
105ms   Subscribe to "web/config"
        |  (subscription in progress...)
        |
        ▼
150ms   (subscription confirmed by broker)
        |
        ▼
600ms   500ms delay completes
        |
        ▼
605ms   Publish "online" status
        |
        ▼
610ms   Server receives "online"
        |
        ▼
615ms   Server publishes config to "web/config"
        |
        ▼
620ms   User B receives config (subscription ready!)
        |
        ▼
625ms   Store to localStorage, reload page
        |
        ▼
1000ms  Page reloads with correct API URL
        |
        ▼
        Dashboard connects to database successfully!
```

**Critical**: The 500ms delay ensures step 150ms (subscription confirmed) happens before step 605ms (publish online).

---

## Why This Fixes Everything

### Problem 1: Race Condition
**Before**: Subscribe and publish happened simultaneously → message lost
**After**: Subscribe → wait → publish → guaranteed delivery

### Problem 2: No Persistence
**Before**: Config only in memory (lost on server restart)
**After**: Config saved to database, reloaded on startup

### Problem 3: Cloudflare URL Changes
**Before**: Quick Tunnel URL changes → old config useless
**After**: Use Named Tunnel (permanent URL) + config auto-updates

### Problem 4: Manual Configuration
**Before**: Every user needs `?api=...` in URL
**After**: Only first user needs it, others auto-discover via MQTT

---

## Testing the System

### Test 1: First User Setup

```bash
# 1. Start backend
docker compose up -d db server

# 2. Start Cloudflare Named Tunnel
cloudflared tunnel run forecaster-2-pe
# Note the URL: https://forecaster-api-abc123.cfargotunnel.com

# 3. Open dashboard with API param
https://yourusername.github.io/project/?api=https://forecaster-api-abc123.cfargotunnel.com

# 4. Check localStorage (F12 → Application → Local Storage)
tfct.apiBase = "https://forecaster-api-abc123.cfargotunnel.com"

# 5. Check database
docker compose exec db psql -U postgres -d iotdb -c "SELECT * FROM system_config;"

# 6. Check MQTT (using mosquitto_sub)
mosquitto_sub -h broker.hivemq.com -t "TFCT_2_PE/web/config" -v
```

### Test 2: Second User Auto-Discovery

```bash
# 1. Open DIFFERENT browser (or incognito)
# 2. Clear all data (or just use fresh browser)
# 3. Open dashboard WITHOUT query params
https://yourusername.github.io/project/

# 4. Open DevTools Console (F12 → Console)
# 5. Watch for these logs:
[PresenceManager] MQTT connected, subscribing to config...
[PresenceManager] Subscribed to web/config
[PresenceManager] Publishing online status and requesting config...
[PresenceManager] Config updated via MQTT, reloading...

# 6. Page should reload automatically
# 7. Check localStorage after reload
tfct.apiBase = "https://forecaster-api-abc123.cfargotunnel.com"

# 8. Database status should show "Online"
```

### Test 3: Server Restart Resilience

```bash
# 1. Set up config (User A)
# 2. Restart server
docker compose restart server

# 3. Check server logs
docker compose logs -f server

# Should see:
[DB] Loaded web config: {"api":"https://...","fw":"https://..."}
[MQTT] Publishing loaded config to MQTT retained topic...

# 4. Open new browser (User C)
# 5. Should still auto-discover config (from database + MQTT)
```

---

## Fallback Strategy

Config resolution has multiple fallback layers:

```
1. MQTT Retained Message (instant, but not 100% reliable)
   ↓ (if MQTT fails)
2. Database (reliable, but needs server running)
   ↓ (if server down)
3. Build-time Env Vars (requires redeploy, but always works)
   ↓ (if nothing set)
4. Relative URLs (works for same-origin deployments)
```

This ensures the system degrades gracefully even if parts fail.

---

## Limitations & Trade-offs

### What This Solves
✅ Multi-user config distribution
✅ Automatic API discovery
✅ Survives server restarts
✅ Works with Cloudflare Named Tunnel
✅ No manual setup for additional users

### What This Doesn't Solve
❌ Requires first user to set config manually
❌ 500ms delay on page load (UX impact)
❌ Depends on HiveMQ public broker (free but not guaranteed)
❌ Config changes require page reload

### Future Improvements
- Add UI button for User A to publish config
- Store config in GitHub Pages static file (backup method)
- Support multiple backend URLs (load balancing)
- Add config version/timestamp checking

---

## Summary

The config distribution system ensures that **only the first user needs to manually set the API URL** via query params. All subsequent users automatically discover the correct configuration through a combination of:

1. **MQTT retained messages** (instant distribution)
2. **Database persistence** (survives restarts)
3. **Cloudflare Named Tunnel** (permanent URL)
4. **Subscribe-first pattern** (no race conditions)

This makes the project truly **zero-configuration** for end users while staying **100% free** and **self-hosted**. 🎉
