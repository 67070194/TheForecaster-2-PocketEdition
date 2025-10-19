-- Initial TimescaleDB schema for IoT readings
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- Devices registry
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mac text UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sensor readings (hypertable on ts)
CREATE TABLE IF NOT EXISTS readings (
  id bigserial NOT NULL,
  device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  t real,
  h real,
  p real,
  pm1 real,
  pm25 real,
  pm10 real,
  aqi real,
  PRIMARY KEY (id, ts)
);

SELECT create_hypertable('readings', 'ts', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS readings_device_ts_idx ON readings(device_id, ts DESC);

-- Keep data only for the most recent 8 hours
-- Use smaller chunks for precise retention
SELECT set_chunk_time_interval('readings', INTERVAL '1 hour');
SELECT add_retention_policy('readings', INTERVAL '8 hours', if_not_exists => TRUE);
