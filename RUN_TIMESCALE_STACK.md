IoT stack with TimescaleDB and MQTT ingest

Quick start
- Prereqs: Docker Desktop (or Docker + Compose)
- One command: `docker compose up -d`
- Web dev UI: open http://localhost:8080 (proxied to API)
- API health: http://localhost:3001/health

What gets started
- db: TimescaleDB (Postgres 16) with init SQL in `db/init/01_init.sql`
- server: Node.js service that
  - subscribes to MQTT topic `TFCT_2_PE/#` (HiveMQ public broker by default)
  - ingests `.../data` JSON payloads into `readings` hypertable
  - exposes REST API: `/api/readings`, `/api/latest`, and `/health`
- web: Vite dev server with proxy `/api` → `server:3001`

Configure
- Edit `docker-compose.yml` if you want a different broker or credentials
- Or set env vars when running `docker compose`:
  - `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `BASE_TOPIC`

Database schema
- devices(id uuid, mac text unique, ...)
- readings(id bigserial, device_id uuid, ts timestamptz, t,h,p,pm1,pm25,pm10, aqi)
- readings is a Timescale hypertable; index on `(device_id, ts desc)`

ESP32 payload format (example)
```
Topic: TFCT_2_PE/data/<mac>
Payload: {"t":24.3,"h":55.2,"p":1012.6,"pm1":5,"pm25":11,"pm10":16,"ts":1730000000}
```
- `ts` is optional (epoch seconds). If omitted, server uses current time
- If topic suffix `<mac>` is missing, server uses `default`

Frontend usage
- The dashboard still connects to MQTT for presence/live status
- Historical chart fetches from `/api/readings?minutes=60` every ~3s, so DB and graph stay in sync

Common commands
- Start: `docker compose up -d`
- Logs server: `docker compose logs -f server`
- Stop: `docker compose down`
- Reset DB (DANGER): `docker compose down -v` then `docker compose up -d`

