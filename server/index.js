import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mqtt from 'mqtt';
import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import os from 'os';

const { Pool } = pkg;

// Env
const PORT = parseInt(process.env.PORT || '3001', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/iotdb';
const MQTT_URL = process.env.MQTT_URL || 'wss://broker.hivemq.com:8884/mqtt';
const BASE_TOPIC = process.env.BASE_TOPIC || 'TFCT_2_PE';
const MQTT_USERNAME = process.env.MQTT_USERNAME || undefined;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || undefined;
// Default sample interval; can be updated at runtime via MQTT cmd/interval
let sampleIntervalMs = Number(process.env.SAMPLE_INTERVAL_MS || '5000');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve(process.cwd(), 'uploads');

// DB
const pool = new Pool({ connectionString: DATABASE_URL });

async function ensureDevice(mac) {
  // Upsert by mac and return id
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sel = await client.query('SELECT id FROM devices WHERE mac = $1', [mac]);
    if (sel.rowCount > 0) {
      await client.query('COMMIT');
      return sel.rows[0].id;
    }
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

function calcAQI(pm25) {
  const x = Number(pm25);
  if (!Number.isFinite(x)) return null;
  if (x <= 12) return Math.round((50 / 12) * x);
  if (x <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (x - 12.1) + 51);
  if (x <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (x - 35.5) + 101);
  if (x <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (x - 55.5) + 151);
  return Math.min(500, Math.round(((300 - 201) / (250.4 - 150.5)) * (x - 150.5) + 201));
}

// MQTT ingest
function startIngest() {
  const options = {
    reconnectPeriod: 1000,
    clean: true,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  };
  const client = mqtt.connect(MQTT_URL, options);

  client.on('connect', () => {
    console.log('[MQTT] connected', MQTT_URL);
    client.subscribe(`${BASE_TOPIC}/#`, { qos: 0 });
  });

  client.on('message', async (topic, payload) => {
    const msg = payload.toString();
    try {
      // Update ingest sampling interval from UI command: BASE_TOPIC/cmd/interval (ms)
      if (topic === `${BASE_TOPIC}/cmd/interval`) {
        const ms = Number(msg);
        if (Number.isFinite(ms)) {
          const clamped = Math.min(Math.max(Math.floor(ms), 500), 600000);
          sampleIntervalMs = clamped;
          console.log(`[Ingest] sampling interval set to ${sampleIntervalMs} ms`);
        }
        return;
      }
      // Only process data topics
      if (topic === `${BASE_TOPIC}/data` || topic.startsWith(`${BASE_TOPIC}/data/`)) {
        const data = JSON.parse(msg);
        // MAC or device id from topic suffix if present
        let mac = undefined;
        const parts = topic.split('/');
        if (parts.length >= 3 && parts[1] === 'data' && parts[2]) mac = parts[2];
        if (!mac && typeof data.id === 'string' && data.id.length > 0) mac = data.id;
        if (!mac) mac = 'default';

        const deviceId = await ensureDevice(mac);
        const nowMs = Date.now();
        const tsMs = Number.isFinite(Number(data.ts)) ? Number(data.ts) * 1000 : nowMs;
        const ts = new Date(tsMs);
        const row = {
          t: toNum(data.t),
          h: toNum(data.h),
          p: toNum(data.p),
          pm1: toNum(data.pm1),
          pm25: toNum(data.pm25),
          pm10: toNum(data.pm10),
        };
        const aqi = calcAQI(row.pm25);
        // Throttle inserts to align with UI sampling cadence (every SAMPLE_INTERVAL_MS)
        if (!startIngest.lastWrite) startIngest.lastWrite = new Map();
        const last = startIngest.lastWrite.get(deviceId) || 0;
        if (nowMs - last >= sampleIntervalMs) {
          await pool.query(
            'INSERT INTO readings(device_id, ts, t, h, p, pm1, pm25, pm10, aqi) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [deviceId, ts.toISOString(), row.t, row.h, row.p, row.pm1, row.pm25, row.pm10, aqi]
          );
          startIngest.lastWrite.set(deviceId, nowMs);
        }
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

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// HTTP API
const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch {}

// Serve built static website if present (optional, does not affect dev)
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(process.cwd(), 'public');
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
}

app.get('/health', async (_req, res) => {
  try {
    const r = await pool.query('SELECT 1');
    res.json({ ok: true, db: true, rows: r.rows });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// Firmware file serve: GET /fw/f/:file
app.get('/fw/f/:file', (req, res) => {
  const fname = path.basename(req.params.file || '');
  if (!fname) return res.status(400).send('Missing filename');
  const filePath = path.join(UPLOADS_DIR, fname);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/octet-stream');
  try {
    const stat = fs.statSync(filePath);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-store');
  } catch {}
  fs.createReadStream(filePath).pipe(res);
});

// Firmware upload: POST /fw/upload (single file multipart)
app.post('/fw/upload', (req, res) => {
  const ct = req.headers['content-type'] || '';
  const m = /boundary=(?:"([^"]+)"|([^;]+))$/i.exec(String(ct));
  if (!m) return res.status(400).json({ error: 'No boundary' });
  const boundary = '--' + (m[1] || m[2]);

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
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
        const headers = rawHeaders.split('\r\n').filter(Boolean);
        const disp = headers.find((h) => /^Content-Disposition/i.test(h)) || '';
        const fnameMatch = /filename="([^"]+)"/.exec(disp);
        if (!fnameMatch) continue;
        const original = fnameMatch[1];
        const safe = original.replace(/[^a-zA-Z0-9_.-]/g, '_');
        const out = `${Date.now()}_${safe}`;
        const buf = Buffer.from(dataBin, 'binary');
        fs.writeFileSync(path.join(UPLOADS_DIR, out), buf);
        saved = { name: original, path: out };
        break;
      }
      if (!saved) return res.status(400).json({ error: 'No file' });

      // Cleanup older files, keep only latest
      try {
        for (const entry of fs.readdirSync(UPLOADS_DIR)) {
          if (entry === saved.path) continue;
          try { fs.unlinkSync(path.join(UPLOADS_DIR, entry)); } catch {}
        }
      } catch {}

      // Build device URL using server host:PORT
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
      const xfProto = String(req.headers['x-forwarded-proto'] || 'http');
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
      if (hm) { hostOnly = hm[1]; port = Number(hm[2]); }
      // Ensure we point to server port
      if (port !== PORT) port = PORT;
      if (hostOnly === 'localhost' || hostOnly === '127.0.0.1') {
        const ip = pickLanIPv4();
        if (ip) hostOnly = ip;
      }
      const fileUrl = `${xfProto}://${hostOnly}:${PORT}/fw/f/${encodeURIComponent(saved.path)}`;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json({ url: fileUrl, name: saved.name, file: saved.path });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });
});

// Cleanup: POST /fw/cleanup { keep: filename }
app.post('/fw/cleanup', (req, res) => {
  try {
    const keepBase = path.basename(String(req.body?.keep || ''));
    if (!keepBase) return res.status(400).json({ error: "Missing 'keep' filename" });
    let removed = 0;
    try {
      for (const entry of fs.readdirSync(UPLOADS_DIR)) {
        if (entry === keepBase) continue;
        try { fs.unlinkSync(path.join(UPLOADS_DIR, entry)); removed++; } catch {}
      }
    } catch {}
    res.json({ ok: true, kept: keepBase, removed });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// GET /api/latest?mac=<mac>
app.get('/api/latest', async (req, res) => {
  try {
    const macRaw = req.query.mac;
    let deviceId;
    if (typeof macRaw === 'string' && macRaw.trim().length > 0) {
      deviceId = await ensureDevice(macRaw.toString());
    } else {
      // Pick the device that has the most recent reading
      const r = await pool.query('SELECT device_id FROM readings ORDER BY ts DESC LIMIT 1');
      if (r.rowCount === 0) return res.json(null);
      deviceId = r.rows[0].device_id;
    }
    const q = await pool.query(
      'SELECT ts, t, h, p, pm1, pm25, pm10, aqi FROM readings WHERE device_id = $1 ORDER BY ts DESC LIMIT 1',
      [deviceId]
    );
    res.json(q.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// GET /api/readings?minutes=60&mac=<mac>
// or /api/readings?from=iso8601&to=iso8601
app.get('/api/readings', async (req, res) => {
  try {
    const macRaw = req.query.mac;
    let deviceId;
    if (typeof macRaw === 'string' && macRaw.trim().length > 0) {
      deviceId = await ensureDevice(macRaw.toString());
    } else {
      // If no mac provided, use the device with the newest data
      const r = await pool.query('SELECT device_id FROM readings ORDER BY ts DESC LIMIT 1');
      if (r.rowCount === 0) return res.json([]);
      deviceId = r.rows[0].device_id;
    }

    const from = req.query.from ? new Date(req.query.from.toString()) : null;
    const to = req.query.to ? new Date(req.query.to.toString()) : null;

    let sql = 'SELECT ts, t, h, p, pm1, pm25, pm10, aqi FROM readings WHERE device_id = $1';
    const params = [deviceId];

    if (from) {
      sql += ' AND ts >= $2';
      params.push(from.toISOString());
      if (to) {
        sql += ' AND ts <= $3';
        params.push(to.toISOString());
      }
    } else {
      // Default to last up to 8 hours; clamp to [1, 480]
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

// Start
app.listen(PORT, () => {
  console.log(`[HTTP] listening on :${PORT}`);
});

// Run MQTT ingest in background and keep reference for publishing
const mqttClient = startIngest();

// Publish web shared config to MQTT retained topic
app.post('/web/config', (req, res) => {
  try {
    const apiRaw = (req.body?.api ?? '').toString();
    const fwRaw = (req.body?.fw ?? '').toString();
    const api = apiRaw.replace(/\/$/, '');
    const fw = fwRaw.replace(/\/$/, '');
    if (!api && !fw) return res.status(400).json({ error: 'Missing api or fw' });
    if (!mqttClient || !mqttClient.connected) return res.status(503).json({ error: 'MQTT not connected' });
    const payload = JSON.stringify({ ...(api ? { api } : {}), ...(fw ? { fw } : {}) });
    mqttClient.publish(`${BASE_TOPIC}/web/config`, payload, { retain: true, qos: 0 }, (err) => {
      if (err) return res.status(500).json({ error: String(err?.message || err) });
      res.json({ ok: true, topic: `${BASE_TOPIC}/web/config`, payload: JSON.parse(payload) });
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
