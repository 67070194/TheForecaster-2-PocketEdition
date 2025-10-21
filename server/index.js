/**
 * ========================================
 * The Forecaster 2 - Pocket Edition
 * Backend Server (Express + MQTT + PostgreSQL)
 * ========================================
 *
 * This is the main server entry point that provides:
 * 1. REST API for sensor data (GET /api/latest, /api/readings)
 * 2. MQTT subscription to ingest sensor data from ESP32 devices
 * 3. Firmware file upload and distribution (POST /fw/upload, GET /fw/f/:file)
 * 4. Database connection to TimescaleDB (PostgreSQL with time-series extension)
 *
 * Architecture:
 * - ESP32 devices → MQTT broker (HiveMQ) → This server subscribes
 * - This server → Inserts readings into PostgreSQL (TimescaleDB)
 * - React frontend → Fetches data via REST API from this server
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { Pool } = pkg;

// ========================================
// Environment Configuration
// ========================================
// These values are loaded from .env file or default to safe fallbacks

/** HTTP server port (default: 3001) */
const PORT = parseInt(process.env.PORT || '3001', 10);

/** PostgreSQL connection string */
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/iotdb';

/** MQTT broker WebSocket URL (HiveMQ public broker by default) */
const MQTT_URL = process.env.MQTT_URL || 'wss://broker.hivemq.com:8884/mqtt';

/** Base MQTT topic prefix (e.g., TFCT_2_PE/data, TFCT_2_PE/cmd/time) */
const BASE_TOPIC = process.env.BASE_TOPIC || 'TFCT_2_PE';

/** MQTT credentials (optional, undefined if not set) */
const MQTT_USERNAME = process.env.MQTT_USERNAME || undefined;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || undefined;

/**
 * Sample interval in milliseconds (default: 5000ms = 5 seconds)
 * Controls how frequently we write sensor data to the database.
 * Can be updated at runtime via MQTT command: BASE_TOPIC/cmd/interval
 * Valid range: 500ms - 600000ms (0.5s - 10 minutes)
 */
let sampleIntervalMs = Number(process.env.SAMPLE_INTERVAL_MS || '5000');

/** Directory for storing uploaded firmware files (.bin) */
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');

// ========================================
// Database Connection Pool
// ========================================
/**
 * PostgreSQL connection pool using pg library
 * Automatically manages connections and handles reconnection
 */
const pool = new Pool({ connectionString: DATABASE_URL });

// ========================================
// Device Management
// ========================================
/**
 * Ensures a device exists in the database, creating it if necessary
 *
 * @param {string} mac - Device MAC address (e.g., "TFCT_2_PE-1a2b3c4d5e6f")
 * @returns {Promise<number>} - Database device ID
 *
 * Uses UPSERT pattern:
 * 1. Try to SELECT existing device by MAC
 * 2. If not found, INSERT new device with MAC as name
 * 3. Return the device ID
 */
async function ensureDevice(mac) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if device already exists
    const sel = await client.query('SELECT id FROM devices WHERE mac = $1', [mac]);
    if (sel.rowCount > 0) {
      await client.query('COMMIT');
      return sel.rows[0].id;
    }

    // Create new device (using MAC as the default name)
    const ins = await client.query('INSERT INTO devices(mac, name) VALUES ($1, $2) RETURNING id', [mac, mac]);
    await client.query('COMMIT');
    return ins.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ========================================
// Air Quality Index (AQI) Calculation
// ========================================
/**
 * Calculates AQI (Air Quality Index) from PM2.5 concentration using EPA breakpoints
 *
 * @param {number} pm25 - PM2.5 concentration in µg/m³
 * @returns {number|null} - AQI value (0-500) or null if invalid input
 *
 * EPA AQI Categories:
 * - 0-50: Good (Green)
 * - 51-100: Moderate (Yellow)
 * - 101-150: Unhealthy for Sensitive Groups (Orange)
 * - 151-200: Unhealthy (Red)
 * - 201-300: Very Unhealthy (Purple)
 * - 301-500: Hazardous (Maroon)
 *
 * Formula: AQI = ((I_high - I_low) / (C_high - C_low)) * (C - C_low) + I_low
 * Where C is the concentration and I is the AQI breakpoint
 */
function calcAQI(pm25) {
  const x = Number(pm25);
  if (!Number.isFinite(x)) return null;

  // Good (0-50): PM2.5 0-12 µg/m³
  if (x <= 12) return Math.round((50 / 12) * x);

  // Moderate (51-100): PM2.5 12.1-35.4 µg/m³
  if (x <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (x - 12.1) + 51);

  // Unhealthy for Sensitive (101-150): PM2.5 35.5-55.4 µg/m³
  if (x <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (x - 35.5) + 101);

  // Unhealthy (151-200): PM2.5 55.5-150.4 µg/m³
  if (x <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (x - 55.5) + 151);

  // Very Unhealthy / Hazardous (201-500): PM2.5 150.5-250.4 µg/m³
  return Math.min(500, Math.round(((300 - 201) / (250.4 - 150.5)) * (x - 150.5) + 201));
}

// ========================================
// MQTT Data Ingestion
// ========================================
/**
 * Starts MQTT client to subscribe to sensor data topics and ingest to database
 *
 * Subscribed Topics:
 * - BASE_TOPIC/data - Default sensor data topic
 * - BASE_TOPIC/data/<mac> - Device-specific sensor data topic
 * - BASE_TOPIC/cmd/interval - Update sampling interval command
 *
 * Expected Message Format (JSON):
 * {
 *   "ts": 1698765432,     // Unix timestamp (seconds)
 *   "id": "device-mac",   // Device MAC address (optional)
 *   "t": 25.3,            // Temperature (°C)
 *   "h": 60.2,            // Humidity (%)
 *   "p": 1013.2,          // Pressure (hPa)
 *   "pm1": 5.2,           // PM1.0 (µg/m³)
 *   "pm25": 12.5,         // PM2.5 (µg/m³)
 *   "pm10": 18.3          // PM10 (µg/m³)
 * }
 *
 * Throttling:
 * - Only writes to database every SAMPLE_INTERVAL_MS to avoid overwhelming DB
 * - Tracks last write time per device ID
 *
 * @returns {mqtt.MqttClient} - MQTT client instance
 */
function startIngest() {
  const options = {
    reconnectPeriod: 1000,     // Auto-reconnect every 1 second if disconnected
    clean: true,                // Start with a clean session (don't persist subscriptions)
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  };
  const client = mqtt.connect(MQTT_URL, options);

  client.on('connect', () => {
    console.log('[MQTT] connected', MQTT_URL);
    // Subscribe to all sub-topics under BASE_TOPIC (# is wildcard)
    client.subscribe(`${BASE_TOPIC}/#`, { qos: 0 });
  });

  client.on('message', async (topic, payload) => {
    const msg = payload.toString();
    try {
      // ========================================
      // Handle Sampling Interval Update Command
      // ========================================
      // Topic: BASE_TOPIC/cmd/interval
      // Payload: Number (milliseconds)
      if (topic === `${BASE_TOPIC}/cmd/interval`) {
        const ms = Number(msg);
        if (Number.isFinite(ms)) {
          // Clamp to valid range: 500ms - 600000ms (0.5s - 10 min)
          const clamped = Math.min(Math.max(Math.floor(ms), 500), 600000);
          sampleIntervalMs = clamped;
          console.log(`[Ingest] sampling interval set to ${sampleIntervalMs} ms`);
        }
        return;
      }

      // ========================================
      // Handle Sensor Data Topics
      // ========================================
      // Only process topics matching BASE_TOPIC/data or BASE_TOPIC/data/<mac>
      if (topic === `${BASE_TOPIC}/data` || topic.startsWith(`${BASE_TOPIC}/data/`)) {
        const data = JSON.parse(msg);

        // Extract device MAC address from topic suffix or message payload
        // Priority: topic suffix > data.id > 'default'
        let mac = undefined;
        const parts = topic.split('/');
        if (parts.length >= 3 && parts[1] === 'data' && parts[2]) {
          mac = parts[2];  // From topic: BASE_TOPIC/data/<mac>
        }
        if (!mac && typeof data.id === 'string' && data.id.length > 0) {
          mac = data.id;   // From payload: data.id
        }
        if (!mac) {
          mac = 'default'; // Fallback for devices without MAC
        }

        // Get or create device in database
        const deviceId = await ensureDevice(mac);

        // Parse timestamp (convert seconds to milliseconds)
        const nowMs = Date.now();
        const tsMs = Number.isFinite(Number(data.ts)) ? Number(data.ts) * 1000 : nowMs;
        const ts = new Date(tsMs);

        // Extract sensor readings (convert to numbers, null if invalid)
        const row = {
          t: toNum(data.t),       // Temperature
          h: toNum(data.h),       // Humidity
          p: toNum(data.p),       // Pressure
          pm1: toNum(data.pm1),   // PM1.0
          pm25: toNum(data.pm25), // PM2.5
          pm10: toNum(data.pm10), // PM10
        };

        // Calculate AQI from PM2.5
        const aqi = calcAQI(row.pm25);

        // ========================================
        // Throttled Database Insert
        // ========================================
        // Only write to DB every SAMPLE_INTERVAL_MS to reduce database load
        // Prevents flooding the database with high-frequency sensor readings
        if (!startIngest.lastWrite) {
          startIngest.lastWrite = new Map(); // Track last write time per device
        }
        const last = startIngest.lastWrite.get(deviceId) || 0;

        if (nowMs - last >= sampleIntervalMs) {
          // Enough time has passed, write to database
          await pool.query(
            'INSERT INTO readings(device_id, ts, t, h, p, pm1, pm25, pm10, aqi) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [deviceId, ts.toISOString(), row.t, row.h, row.p, row.pm1, row.pm25, row.pm10, aqi]
          );
          startIngest.lastWrite.set(deviceId, nowMs);
        }
        // If not enough time has passed, silently drop this reading (throttled)
      }
    } catch (e) {
      console.error('[MQTT] parse/ingest error', e);
    }
  });

  client.on('error', (err) => {
    console.error('[MQTT] error', err.message);
  });

  return client;
}

/**
 * Helper: Safely convert value to number
 * @param {any} v - Value to convert
 * @returns {number|null} - Number or null if invalid
 */
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ========================================
// Express HTTP Server Setup
// ========================================
const app = express();

// Middleware
app.use(cors());              // Enable CORS for all routes (allows frontend on different domain)
app.use(express.json());      // Parse JSON request bodies

// Ensure uploads directory exists for firmware files
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {}

// ========================================
// Static File Serving (Optional)
// ========================================
// Serve built static website if public/ directory exists
// This allows the server to serve the React frontend in production
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(process.cwd(), 'public');
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
}

// ========================================
// Health Check Endpoint
// ========================================
/**
 * GET /health
 * Returns server health status and database connectivity
 *
 * Response (success): { ok: true, db: true, rows: [{...}] }
 * Response (error): { ok: false } (HTTP 500)
 */
app.get('/health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1');
    res.json({ ok: true, db: true, rows: r.rows });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// ========================================
// Firmware Distribution Endpoints
// ========================================

/**
 * GET /fw/f/:file
 * Serves firmware binary file for ESP32 OTA updates
 *
 * Used by ESP32 devices to download firmware over HTTP
 * Files are served with proper headers for OTA:
 * - Content-Type: application/octet-stream
 * - Content-Length: <file size>
 * - Cache-Control: no-store
 * - Access-Control-Allow-Origin: * (for CORS)
 */
app.get('/fw/f/:file', (req, res) => {
  const fname = path.basename(req.params.file || '');
  if (!fname) return res.status(400).send('Missing filename');

  const filePath = path.join(UPLOADS_DIR, fname);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  // Set headers for binary file download
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/octet-stream');
  try {
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
  } catch {}

  // Stream file to client
  fs.createReadStream(filePath).pipe(res);
});

/**
 * POST /fw/upload
 * Uploads firmware binary file (.bin) for ESP32 OTA updates
 *
 * Accepts multipart/form-data with a single file
 * - Saves file with timestamp prefix: <timestamp>_<filename>
 * - Deletes all old firmware files (keeps only latest)
 * - Returns download URL for the uploaded file
 *
 * Response: { url: "http://...", name: "original.bin", file: "123456_original.bin" }
 *
 * URL Format:
 * - Local: http://<LAN-IP>:<PORT>/fw/f/<filename>
 * - Tunnel: https://<tunnel-host>/fw/f/<filename> (no port)
 */
app.post('/fw/upload', (req, res) => {
  const ct = req.headers['content-type'] || '';
  const m = /boundary=(?:"([^"]+)"|([^;]+))$/i.exec(String(ct));
  if (!m) return res.status(400).json({ error: 'No boundary' });
  const boundary = '--' + (m[1] || m[2]);

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      // Parse multipart/form-data manually (no external dependencies)
      const bodyBin = Buffer.concat(chunks).toString('binary');
      const rawParts = bodyBin.split(boundary).slice(1, -1);
      let saved = null;

      for (let part of rawParts) {
        if (part.startsWith('\r\n')) part = part.slice(2);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd < 0) continue;

        const rawHeaders = part.slice(0, headerEnd);
        let dataBin = part.slice(headerEnd + 4);
        if (dataBin.endsWith('\r\n')) dataBin = dataBin.slice(0, -2);

        // Extract filename from Content-Disposition header
        const headers = rawHeaders.split('\r\n').filter(Boolean);
        const disp = headers.find((h) => /^Content-Disposition/i.test(h)) || '';
        const fnameMatch = /filename="([^"]+)"/.exec(disp);
        if (!fnameMatch) continue;

        // Sanitize filename and add timestamp
        const original = fnameMatch[1];
        const safe = original.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const out = `${Date.now()}_${safe}`;

        // Write binary file
        const buf = Buffer.from(dataBin, 'binary');
        fs.writeFileSync(path.join(UPLOADS_DIR, out), buf);
        saved = { name: original, path: out };
        break; // Only process first file
      }

      if (!saved) return res.status(400).json({ error: 'No file' });

      // ========================================
      // Cleanup Old Firmware Files
      // ========================================
      // Delete all files except the one we just uploaded
      // Keeps uploads directory clean (only 1 firmware file at a time)
      try {
        for (const entry of fs.readdirSync(UPLOADS_DIR)) {
          if (entry === saved.path) continue;
          try { fs.unlinkSync(path.join(UPLOADS_DIR, entry)); } catch {}
        }
      } catch {}

      // ========================================
      // Build Device-Accessible URL
      // ========================================
      // ESP32 needs to download from LAN IP, not localhost
      // When behind Cloudflare Tunnel, use HTTPS without port
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
      const xfProto = String(req.headers['x-forwarded-proto'] || 'http');

      // Helper: Get primary LAN IPv4 address
      const pickLanIPv4 = () => {
        const nets = os.networkInterfaces();
        for (const k of Object.keys(nets)) {
          for (const n of nets[k] || []) {
            if (!n.internal && n.family === 'IPv4') return n.address;
          }
        }
        return undefined;
      };

      let hostname = reqHost.split(',')[0].trim();
      let hostOnly = hostname;
      let port = PORT;
      const hm = /^(.*?):(\d+)$/.exec(hostname);
      if (hm) {
        hostOnly = hm[1];
        port = Number(hm[2]);
      }

      // Ensure we point to server port (not frontend port)
      if (port !== PORT) port = PORT;

      // Replace localhost with LAN IP for ESP32 accessibility
      if (hostOnly === 'localhost' || hostOnly === '127.0.0.1') {
        const ip = pickLanIPv4();
        if (ip) hostOnly = ip;
      }

      // Build URL:
      // - HTTPS (Cloudflare Tunnel): No port needed
      // - HTTP (Local LAN): Include port
      const fileUrl = xfProto === 'https'
        ? `${xfProto}://${hostOnly}/fw/f/${encodeURIComponent(saved.path)}`
        : `${xfProto}://${hostOnly}:${PORT}/fw/f/${encodeURIComponent(saved.path)}`;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ url: fileUrl, name: saved.name, file: saved.path });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
});

/**
 * POST /fw/cleanup
 * Manually cleanup firmware files, keeping only specified file
 *
 * Request Body: { keep: "filename.bin" }
 * Response: { ok: true, kept: "filename.bin", removed: 2 }
 */
app.post('/fw/cleanup', (req, res) => {
  try {
    const keepBase = path.basename(String(req.body?.keep || ''));
    if (!keepBase) return res.status(400).json({ error: "Missing 'keep' filename" });

    let removed = 0;
    try {
      for (const entry of fs.readdirSync(UPLOADS_DIR)) {
        if (entry === keepBase) continue;
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, entry));
          removed++;
        } catch {}
      }
    } catch {}

    res.json({ ok: true, kept: keepBase, removed });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ========================================
// Sensor Data API Endpoints
// ========================================

/**
 * GET /api/latest?mac=<mac>
 * Returns the most recent sensor reading for a device
 *
 * Query Parameters:
 * - mac (optional): Device MAC address
 *   If not provided, returns data from the device with the most recent reading
 *
 * Response: { ts, t, h, p, pm1, pm25, pm10, aqi } or null
 * Example: { ts: "2024-01-01T12:00:00Z", t: 25.3, h: 60.2, ... }
 */
app.get('/api/latest', async (req, res) => {
  try {
    const macRaw = req.query.mac;
    let deviceId;

    if (typeof macRaw === 'string' && macRaw.trim().length > 0) {
      // Get device ID for specified MAC
      deviceId = await ensureDevice(macRaw.toString());
    } else {
      // No MAC specified: find device with most recent reading
      const r = await pool.query('SELECT device_id FROM readings ORDER BY ts DESC LIMIT 1');
      if (r.rowCount === 0) return res.json(null);
      deviceId = r.rows[0].device_id;
    }

    // Fetch latest reading for this device
    const q = await pool.query(
      'SELECT ts, t, h, p, pm1, pm25, pm10, aqi FROM readings WHERE device_id = $1 ORDER BY ts DESC LIMIT 1',
      [deviceId]
    );
    res.json(q.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * GET /api/readings?minutes=60&mac=<mac>
 * GET /api/readings?from=<iso8601>&to=<iso8601>&mac=<mac>
 * Returns historical sensor readings within a time range
 *
 * Query Parameters:
 * - mac (optional): Device MAC address (defaults to device with newest data)
 * - minutes (optional): Number of minutes to fetch (1-480, default: 480 = 8 hours)
 * - from (optional): ISO8601 start timestamp (e.g., "2024-01-01T00:00:00Z")
 * - to (optional): ISO8601 end timestamp
 *
 * If from/to provided, uses those; otherwise uses minutes parameter
 *
 * Response: Array of readings
 * Example: [{ ts, t, h, p, pm1, pm25, pm10, aqi }, ...]
 */
app.get('/api/readings', async (req, res) => {
  try {
    const macRaw = req.query.mac;
    let deviceId;

    if (typeof macRaw === 'string' && macRaw.trim().length > 0) {
      deviceId = await ensureDevice(macRaw.toString());
    } else {
      // No MAC specified: use device with newest data
      const r = await pool.query('SELECT device_id FROM readings ORDER BY ts DESC LIMIT 1');
      if (r.rowCount === 0) return res.json([]);
      deviceId = r.rows[0].device_id;
    }

    // Parse time range parameters
    const from = req.query.from ? new Date(req.query.from.toString()) : null;
    const to = req.query.to ? new Date(req.query.to.toString()) : null;

    let sql = 'SELECT ts, t, h, p, pm1, pm25, pm10, aqi FROM readings WHERE device_id = $1';
    const params = [deviceId];

    if (from) {
      // Use explicit from/to timestamps
      sql += ' AND ts >= $2';
      params.push(from.toISOString());
      if (to) {
        sql += ' AND ts <= $3';
        params.push(to.toISOString());
      }
    } else {
      // Use minutes parameter (default: 480 minutes = 8 hours)
      // Clamped to range [1, 480] to prevent excessive queries
      const minutesRaw = Number(req.query.minutes);
      const minutes = Number.isFinite(minutesRaw) ? Math.max(1, Math.min(480, minutesRaw)) : 480;
      const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
      sql += ' AND ts >= $2';
      params.push(since);
    }

    sql += ' ORDER BY ts ASC';
    const q = await pool.query(sql, params);
    res.json(q.rows);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * POST /api/readings/bulk
 * Bulk insert sensor readings (for testing/simulation)
 *
 * Request Body:
 * {
 *   readings: [
 *     { ts: "2024-01-01T12:00:00Z", t: 25.3, h: 60.2, p: 1013.2, pm1: 5, pm25: 12, pm10: 18, aqi: 50 },
 *     ...
 *   ],
 *   mac: "test-device" (optional)
 * }
 *
 * Used by Tester Mode to populate database with historical data
 * Uses transaction to ensure all-or-nothing insert
 *
 * Response: { ok: true, inserted: 5000, deviceId: 1 }
 */
app.post('/api/readings/bulk', async (req, res) => {
  try {
    const { readings, mac } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty readings array' });
    }

    // Get or create device
    const deviceMac = typeof mac === 'string' && mac.length > 0 ? mac : 'test-device';
    const deviceId = await ensureDevice(deviceMac);

    // Bulk insert using transaction (all-or-nothing)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const reading of readings) {
        const ts = new Date(reading.ts).toISOString();
        const t = toNum(reading.t);
        const h = toNum(reading.h);
        const p = toNum(reading.p);
        const pm1 = toNum(reading.pm1);
        const pm25 = toNum(reading.pm25);
        const pm10 = toNum(reading.pm10);
        const aqi = toNum(reading.aqi);

        await client.query(
          'INSERT INTO readings(device_id, ts, t, h, p, pm1, pm25, pm10, aqi) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [deviceId, ts, t, h, p, pm1, pm25, pm10, aqi]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, inserted: readings.length, deviceId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/**
 * DELETE /api/readings/clear
 * Deletes ALL sensor readings from database (for testing)
 *
 * WARNING: This removes all historical data!
 * Should only be used in development/testing
 *
 * Response: { ok: true, deleted: 12345 }
 */
app.delete('/api/readings/clear', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM readings');
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// ========================================
// Server Startup
// ========================================

/** Start HTTP server on configured port */
app.listen(PORT, () => {
  console.log(`[HTTP] listening on :${PORT}`);
});

/** Start MQTT ingestion in background */
startIngest();
