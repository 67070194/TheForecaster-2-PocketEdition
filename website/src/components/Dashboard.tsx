/**
 * ========================================
 * The Forecaster 2 - Pocket Edition
 * Dashboard Component (Main UI Controller)
 * ========================================
 *
 * Architecture:
 * - Normal Mode: ESP32 → MQTT broker → This component → Display + Chart
 * - Tester Mode: Local data generation → Display + Chart (no MQTT, no backend)
 *
 * Key Features:
 * - Real-time sensor data visualization (temperature, humidity, pressure, PM, AQI)
 * - MQTT subscription to HiveMQ broker for ESP32 sensor data
 * - Dual-mode operation: Normal (live hardware) vs Tester (UI simulation)
 * - Historical data loading from PostgreSQL backend (Normal Mode)
 * - In-memory 8-hour data simulation (Tester Mode)
 * - Firmware OTA updates via file upload and MQTT command
 * - Database health monitoring
 * - Configurable update intervals (500ms - 10 minutes)
 *
 * MQTT Topics:
 * - Subscribe: TFCT_2_PE/# (all topics)
 *   - TFCT_2_PE/status → "online" | "offline" (device connection status)
 *   - TFCT_2_PE/data → JSON sensor data
 *   - TFCT_2_PE/data/<mac> → Device-specific sensor data
 *   - TFCT_2_PE/debug → OTA and debug events
 * - Publish:
 *   - TFCT_2_PE/cmd/time → Unix epoch (RTC sync)
 *   - TFCT_2_PE/cmd/interval → Update interval in ms
 *   - TFCT_2_PE/cmd/ota_now → Firmware URL for OTA update
 *   - TFCT_2_PE/cmd/<mac>/ota_now → Device-specific OTA command
 */

import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import { SensorCard } from './SensorCard';
import { SensorChart } from './SensorChart';
import { UpdateSettings } from './UpdateSettings';
import { Thermometer, Droplets, Cloud, CloudRain, Sun, Wind, Leaf, AlertTriangle, FlaskConical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Database as DbIcon } from 'lucide-react';
import { getApiBase, getFwBase } from '@/lib/runtimeConfig';

/**
 * Interface: Current sensor readings displayed on cards
 * All values are numbers; NaN indicates unavailable/no data
 */
interface SensorData {
  temperature: number;  // Temperature in °C
  humidity: number;     // Relative humidity in %
  pressure: number;     // Atmospheric pressure in hPa
  pm1: number;          // PM1.0 particulate matter in µg/m³
  pm25: number;         // PM2.5 particulate matter in µg/m³
  pm10: number;         // PM10 particulate matter in µg/m³
  aqi: number;          // Air Quality Index (0-500)
}

/**
 * Interface: Historical data points for chart visualization
 * Includes timestamp for time-series plotting
 */
interface ChartData {
  timestamp: string;    // ISO 8601 timestamp
  temperature: number;
  humidity: number;
  pressure: number;
  pm1: number;
  pm25: number;
  pm10: number;
  aqi: number;
}

/**
 * Temperature status determination based on comfort ranges
 * @param temp - Temperature in °C
 * @returns Status level for color-coded display
 */
const getTemperatureStatus = (temp: number) => {
  if (isNaN(temp)) return 'unavailable';
  if (temp >= 18 && temp <= 24) return 'excellent';  // Optimal comfort zone
  if (temp >= 16 && temp <= 28) return 'good';       // Acceptable range
  if (temp >= 12 && temp <= 32) return 'moderate';   // Tolerable
  if (temp >= 8 && temp <= 36) return 'poor';        // Uncomfortable
  return 'hazardous';                                // Extreme conditions
};

/**
 * Humidity status determination based on comfort ranges
 * @param humidity - Relative humidity in %
 * @returns Status level for color-coded display
 */
const getHumidityStatus = (humidity: number) => {
  if (isNaN(humidity)) return 'unavailable';
  if (humidity >= 40 && humidity <= 60) return 'excellent';  // Optimal for health/comfort
  if (humidity >= 30 && humidity <= 70) return 'good';       // Acceptable
  if (humidity >= 25 && humidity <= 75) return 'moderate';   // Tolerable
  if (humidity >= 20 && humidity <= 80) return 'poor';       // Risk of mold or dryness
  return 'hazardous';                                        // Very dry or very humid
};

/**
 * AQI status determination using EPA Air Quality Index standard
 * @param aqi - Air Quality Index value
 * @returns Status level matching EPA categories
 */
const getAQIStatus = (aqi: number) => {
  if (isNaN(aqi)) return 'unavailable';
  if (aqi <= 50) return 'excellent';   // Good (Green)
  if (aqi <= 100) return 'good';       // Moderate (Yellow)
  if (aqi <= 150) return 'moderate';   // Unhealthy for Sensitive Groups (Orange)
  if (aqi <= 200) return 'poor';       // Unhealthy (Red)
  return 'hazardous';                  // Very Unhealthy / Hazardous (Purple/Maroon)
};

/**
 * PM (Particulate Matter) status determination
 * Based on WHO air quality guidelines for PM2.5
 * @param pm - PM concentration in µg/m³
 * @returns Status level for color-coded display
 */
const getPMStatus = (pm: number) => {
  if (isNaN(pm)) return 'unavailable';
  if (pm <= 12) return 'excellent';   // WHO annual guideline
  if (pm <= 35) return 'good';        // EPA 24h standard
  if (pm <= 55) return 'moderate';    // Moderate pollution
  if (pm <= 150) return 'poor';       // Unhealthy levels
  return 'hazardous';                 // Very unhealthy / hazardous
};

/**
 * Weather condition inference from atmospheric pressure
 * Uses barometric pressure to predict weather patterns
 *
 * @param pressure - Atmospheric pressure in hPa
 * @returns Object with status, condition text, and icon
 */
const getWeatherFromPressure = (pressure: number): {
  status: 'excellent' | 'good' | 'moderate' | 'poor' | 'hazardous' | 'unavailable';
  condition: string;
  icon: React.ReactNode
} => {
  if (isNaN(pressure)) return { status: 'unavailable' as const, condition: 'No Data', icon: <Wind size={20} /> };
  if (pressure >= 1022) return { status: 'excellent' as const, condition: 'High Pressure', icon: <Sun size={20} /> };      // Clear, sunny
  if (pressure >= 1013) return { status: 'good' as const, condition: 'Fair Weather', icon: <Cloud size={20} /> };          // Normal conditions (1013.25 = sea level standard)
  if (pressure >= 1000) return { status: 'moderate' as const, condition: 'Changing', icon: <Cloud size={20} /> };          // Weather transition
  if (pressure >= 990) return { status: 'poor' as const, condition: 'Rain Likely', icon: <CloudRain size={20} /> };        // Low pressure = rain
  return { status: 'hazardous' as const, condition: 'Storm Risk', icon: <CloudRain size={20} /> };                         // Very low pressure = storm
};

export const Dashboard = () => {
  // ========================================
  // STATE: Core Sensor Data and Display
  // ========================================

  /**
   * Current sensor readings displayed on cards
   * Initialized with NaN (Not a Number) to indicate "no data" state
   */
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: NaN,
    humidity: NaN,
    pressure: NaN,
    pm1: NaN,
    pm25: NaN,
    pm10: NaN,
    aqi: NaN
  });

  /** Timestamp of last sensor data update (for display) */
  const [lastUpdate, setLastUpdate] = useState(new Date());

  /** Update interval in milliseconds (500ms - 600000ms) */
  const [updateInterval, setUpdateInterval] = useState(5000);

  /** Historical data points for chart visualization */
  const [chartData, setChartData] = useState<ChartData[]>([]);

  /** Chart component key - increment to force remount when switching modes */
  const [chartKey, setChartKey] = useState(0);

  /** Current time for header clock display */
  const [currentTime, setCurrentTime] = useState(new Date());

  // ========================================
  // STATE: Operating Modes
  // ========================================

  /**
   * Tester Mode flag
   * - false: Normal Mode (MQTT + Backend + Real ESP32)
   * - true: Tester Mode (Local data generation, no MQTT/Backend)
   */
  const [isTesterMode, setIsTesterMode] = useState(false);

  /** Flag indicating if 8-hour historical data simulation is running (Tester Mode only) */
  const [isDbSimulating, setIsDbSimulating] = useState(false);

  /** Flag indicating if simulated historical data exists in chart (Tester Mode only) */
  const [hasSimulatedData, setHasSimulatedData] = useState(false);

  // ========================================
  // STATE: Connection Status
  // ========================================

  /**
   * ESP32/MQTT connection status (Normal Mode only)
   * - connecting: Waiting for device
   * - connected: Device online
   * - disconnected: Device offline
   */
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  /**
   * Backend database health status
   * - checking: Initial health check
   * - online: /health endpoint responding, database OK
   * - offline: Backend unreachable or database down
   */
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // ========================================
  // REFS: MQTT and Data Management
  // ========================================

  /**
   * Stores last received MQTT data packet with timestamp
   * Used to throttle UI updates based on updateInterval
   * Format: { data: SensorData, timestamp: number (milliseconds) }
   */
  const lastMqttDataRef = useRef<{ data: SensorData; timestamp: number } | null>(null);

  /** Flag to prevent duplicate connection success toasts */
  const hasShownConnectToast = useRef(false);

  /** Flag to ensure RTC sync happens only once after first data packet */
  const hasSyncedRtc = useRef(false);

  /** MQTT client instance (Normal Mode only) */
  const clientRef = useRef<mqtt.MqttClient | null>(null);

  /** Timer for delayed "connecting" status after disconnect (prevents flickering) */
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  /** Flag to prevent duplicate initial data generation in Tester Mode */
  const testerInitDoneRef = useRef(false);

  // ========================================
  // STATE: Firmware OTA Updates
  // ========================================

  /** Selected firmware file for OTA update */
  const [otaFile, setOtaFile] = useState<File | null>(null);

  /** Upload progress flag */
  const [isUploading, setIsUploading] = useState(false);

  /** List of discovered device MAC addresses (from data/<mac> topics) */
  const [devices, setDevices] = useState<string[]>([]);

  /** Target device for OTA update ('' = broadcast to all devices) */
  const [targetDevice, setTargetDevice] = useState<string | ''>('');

  /** Track which device is pending OTA to match debug events */
  const pendingOtaForRef = useRef<string | null>(null);

  /** Last uploaded firmware filename for cleanup after successful OTA */
  const lastUploadedFileRef = useRef<string | null>(null);

  // ========================================
  // REFS: Database History Tracking
  // ========================================

  /** Timestamp of last data point loaded from database (to avoid duplicates) */
  const lastDbTsRef = useRef<number>(0);

  /** Flag indicating initial history load is complete */
  const historyLoadedRef = useRef<boolean>(false);

  // ========================================
  // EFFECT: Reset Chart Data on Mode Switch
  // ========================================

  /**
   * Clears all chart-related state when switching between Normal/Tester modes
   * Prevents data mixing and ensures clean transition
   */
  useEffect(() => {
    // Clear all chart-related state and refs (in-memory only, no backend calls)
    setChartData([]);
    lastDbTsRef.current = 0;
    historyLoadedRef.current = false;
    lastMqttDataRef.current = null;
    testerInitDoneRef.current = false;
    setHasSimulatedData(false); // Reset simulation flag

    // Increment chart key to force React to remount chart components
    // This ensures complete cleanup and prevents data mixing between modes
    setChartKey(prev => prev + 1);
  }, [isTesterMode]);

  // ========================================
  // EFFECT: Database Health Monitoring
  // ========================================

  /**
   * Polls backend /health endpoint every 10 seconds (Normal Mode only)
   * Monitors database connection status and backend availability
   */
  useEffect(() => {
    if (isTesterMode) {
      setDbStatus('offline'); // No database connection in tester mode
      return;
    }

    let disposed = false;
    const poll = async () => {
      try {
        const base = getApiBase();
        const url = (base ? `${base}/health` : '/health');
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('bad status');
        const j = await res.json().catch(() => ({}));
        // Check both ok flag and db flag from health response
        if (!disposed) setDbStatus(j && j.ok && j.db ? 'online' : 'offline');
      } catch {
        if (!disposed) setDbStatus('offline');
      }
    };
    setDbStatus('checking');
    void poll();
    const id = setInterval(poll, 10000); // Poll every 10 seconds
    return () => { disposed = true; clearInterval(id); };
  }, [isTesterMode]);

  // ========================================
  // EFFECT: Load Historical Data from Database
  // ========================================

  /**
   * Loads last 8 hours (480 minutes) of sensor data from PostgreSQL backend
   * Runs once on mount in Normal Mode
   * Populates chart with historical context before live data starts appending
   */
  useEffect(() => {
    if (isTesterMode) return; // Tester Mode does not use DB
    let cancelled = false;
    (async () => {
      try {
        const API_BASE = getApiBase();
        const res = await fetch(`${API_BASE}/api/readings?minutes=480`); // 8 hours
        if (!res.ok) return;
        const rows = await res.json();
        if (cancelled || !Array.isArray(rows)) return;

        // Map backend response to ChartData format
        const mapped = rows.map((r: any) => ({
          timestamp: new Date(r.ts).toISOString(),
          temperature: Number(r.t ?? NaN),
          humidity: Number(r.h ?? NaN),
          pressure: Number(r.p ?? NaN),
          pm1: Number(r.pm1 ?? NaN),
          pm25: Number(r.pm25 ?? NaN),
          pm10: Number(r.pm10 ?? NaN),
          aqi: Number(r.aqi ?? NaN),
        })) as ChartData[];

        setChartData(mapped);

        // Track last DB timestamp to avoid duplicate appending
        if (rows.length > 0) {
          lastDbTsRef.current = new Date(rows[rows.length - 1].ts).getTime();
        }
        historyLoadedRef.current = true;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isTesterMode]);

  // ========================================
  // FUNCTION: Calculate AQI from PM2.5
  // ========================================

  /**
   * Calculates Air Quality Index (AQI) from PM2.5 concentration
   * Uses EPA AQI breakpoints (approximate)
   *
   * @param pm25 - PM2.5 concentration in µg/m³
   * @returns AQI value (0-500+) or rounded integer
   */
  const calculateAQI = (pm25: number) => {
    if (pm25 <= 12) return Math.round((50 / 12) * pm25);                                         // Good (0-50)
    if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);      // Moderate (51-100)
    if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);    // Unhealthy for Sensitive (101-150)
    if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);  // Unhealthy (151-200)
    return Math.min(500, Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201));    // Very Unhealthy+ (201-500)
  };

  // ========================================
  // FUNCTION: Simulate 8 Hours of Historical Data
  // ========================================

  /**
   * Generates 8 hours of realistic sensor data in-memory (Tester Mode only)
   * - Creates smooth, realistic transitions between data points
   * - Uses current live data as starting point for continuity
   * - Randomizes intervals to simulate real-world sampling
   * - No backend/database involved (all in-memory)
   *
   * This allows testing chart behavior without needing real hardware or backend
   */
  const simulateDatabaseData = async () => {
    // Validation: Only available in Tester Mode
    if (!isTesterMode) {
      toast({
        title: "Historical Data Simulation",
        description: "Only available in Tester Mode",
        variant: "destructive"
      });
      return;
    }

    // Prevent concurrent simulations
    if (isDbSimulating) {
      toast({
        title: "Already Simulating",
        description: "Historical data generation is already running",
        variant: "destructive"
      });
      return;
    }

    setIsDbSimulating(true);

    toast({
      title: "Generating Historical Data",
      description: "Creating 8 hours of realistic sensor data..."
    });

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(() => {
      try {
        const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
        const now = Date.now();
        const startTime = now - EIGHT_HOURS_MS;

        // Generate data points with randomized intervals (in-memory only)
        const dataPoints: ChartData[] = [];
        let currentTime = startTime;

        // Helper: Clamp value to valid range
        const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

        // Helper: Smooth random step (smaller changes = more realistic)
        const smoothStep = (v: number, maxStep: number) => {
          const change = (Math.random() * 2 - 1) * maxStep;
          return v + change;
        };

        // Starting values - use current live sensor data for smooth transition
        const currentLive = lastMqttDataRef.current?.data ?? sensorData;
        let prevData = {
          temperature: Number.isFinite(currentLive.temperature) ? currentLive.temperature : 26.5,
          humidity: Number.isFinite(currentLive.humidity) ? currentLive.humidity : 65,
          pressure: Number.isFinite(currentLive.pressure) ? currentLive.pressure : 1013.25,
          pm1: Number.isFinite(currentLive.pm1) ? currentLive.pm1 : 8,
          pm25: Number.isFinite(currentLive.pm25) ? currentLive.pm25 : 12,
          pm10: Number.isFinite(currentLive.pm10) ? currentLive.pm10 : 18
        };

        // Generate points until we reach current time
        while (currentTime <= now) {
          // Generate next data point with smooth, realistic transitions
          const nextData = {
            temperature: Number(clamp(smoothStep(prevData.temperature, 0.3), 18, 32).toFixed(2)),     // ±0.3°C steps
            humidity: Number(clamp(smoothStep(prevData.humidity, 1.5), 40, 80).toFixed(2)),           // ±1.5% steps
            pressure: Number(clamp(smoothStep(prevData.pressure, 0.3), 1000, 1025).toFixed(2)),       // ±0.3 hPa steps
            pm1: Math.round(clamp(smoothStep(prevData.pm1, 2), 5, 80)),                               // ±2 µg/m³ steps
            pm25: Math.round(clamp(smoothStep(prevData.pm25, 3), 8, 120)),                            // ±3 µg/m³ steps
            pm10: Math.round(clamp(smoothStep(prevData.pm10, 4), 12, 150)),                           // ±4 µg/m³ steps
          };

          const aqi = calculateAQI(nextData.pm25);

          dataPoints.push({
            timestamp: new Date(currentTime).toISOString(),
            temperature: nextData.temperature,
            humidity: nextData.humidity,
            pressure: nextData.pressure,
            pm1: nextData.pm1,
            pm25: nextData.pm25,
            pm10: nextData.pm10,
            aqi: aqi
          });

          prevData = nextData;

          // Randomize interval: base updateInterval ± 50%
          const randomInterval = updateInterval * (0.5 + Math.random());
          currentTime += randomInterval;
        }

        // Load data directly into chart (no backend/database involved)
        setChartData(dataPoints);
        setHasSimulatedData(true);

        // Debug: Calculate actual time range
        const firstTs = new Date(dataPoints[0].timestamp).getTime();
        const lastTs = new Date(dataPoints[dataPoints.length - 1].timestamp).getTime();
        const actualHours = ((lastTs - firstTs) / (1000 * 60 * 60)).toFixed(2);

        toast({
          title: "Historical Data Generated",
          description: `Created ${dataPoints.length} data points spanning ${actualHours} hours (in-memory only)`
        });

      } catch (error: any) {
        toast({
          title: "Simulation Failed",
          description: error.message || "Failed to generate historical data",
          variant: "destructive"
        });
      } finally {
        setIsDbSimulating(false);
      }
    }, 100);
  };

  // ========================================
  // FUNCTION: Remove Simulated Data
  // ========================================

  /**
   * Clears simulated 8-hour historical data from memory (Tester Mode only)
   * Does not affect backend database
   */
  const removeSimulatedData = () => {
    if (!isTesterMode) {
      toast({
        title: "Remove Data",
        description: "Only available in Tester Mode",
        variant: "destructive"
      });
      return;
    }

    if (isDbSimulating) {
      toast({
        title: "Cannot Remove",
        description: "Wait for data generation to complete",
        variant: "destructive"
      });
      return;
    }

    const pointCount = chartData.length;

    // Clear chart data from memory
    setChartData([]);
    setHasSimulatedData(false);

    toast({
      title: "Historical Data Cleared",
      description: `Removed ${pointCount} data points from memory`
    });
  };

  // ========================================
  // MQTT COMMAND: Sync RTC (Real-Time Clock)
  // ========================================

  /**
   * Publishes current Unix epoch time to ESP32 for RTC synchronization
   * ESP32 subscribes to TFCT_2_PE/cmd/time
   * Disabled in Tester Mode (no MQTT connection)
   */
  const publishSetRtcNow = () => {
    if (isTesterMode) {
      toast({
        title: "Tester Mode",
        description: "MQTT disabled in Tester Mode",
      });
      return;
    }
    if (!clientRef.current) {
      toast({
        title: "MQTT Error",
        description: "Not connected to MQTT broker",
        variant: "destructive"
      });
      return;
    }
    const epoch = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const base = 'TFCT_2_PE';
    clientRef.current.publish(`${base}/cmd/time`, String(epoch), { qos: 0 }, (err) => {
      if (err) {
        toast({
          title: "MQTT Error",
          description: "Failed to send time command",
          variant: "destructive"
        });
      } else {
        toast({
          title: "RTC Synced",
          description: `Epoch time ${epoch} sent`
        });
      }
    });
  };

  // ========================================
  // MQTT COMMAND: Set Update Interval
  // ========================================

  /**
   * Publishes new update interval to ESP32
   * ESP32 subscribes to TFCT_2_PE/cmd/interval
   * Valid range: 500ms - 600000ms (0.5s - 10 minutes)
   * Retained message ensures new devices receive the setting
   *
   * @param ms - Update interval in milliseconds
   */
  const publishUpdateInterval = (ms: number) => {
    if (isTesterMode) {
      toast({
        title: "Tester Mode",
        description: "MQTT disabled in Tester Mode",
      });
      return;
    }
    if (!clientRef.current) {
      toast({
        title: "MQTT Error",
        description: "Not connected to MQTT broker",
        variant: "destructive"
      });
      return;
    }
    const clamped = Math.min(Math.max(ms, 500), 600000); // Clamp to valid range
    clientRef.current.publish("TFCT_2_PE/cmd/interval", String(clamped), { qos: 0, retain: true }, (err) => {
      if (err) {
        toast({
          title: "MQTT Error",
          description: "Failed to set interval",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Interval Updated",
          description: `ESP32 will update every ${clamped} ms`
        });
      }
    });
  };

  // ========================================
  // MQTT COMMAND: Start Firmware OTA Update
  // ========================================

  /**
   * Publishes firmware download URL to ESP32 to start OTA update
   * ESP32 subscribes to TFCT_2_PE/cmd/ota_now (broadcast) or TFCT_2_PE/cmd/<mac>/ota_now (targeted)
   * ESP32 will download .bin file from URL and flash firmware
   *
   * @param url - HTTP/HTTPS URL pointing to .bin firmware file
   */
  const publishStartOta = (url: string) => {
    if (isTesterMode) {
      toast({ title: 'Tester Mode', description: 'MQTT disabled in Tester Mode' });
      return;
    }
    if (!clientRef.current) {
      toast({ title: 'MQTT Error', description: 'Not connected to MQTT broker', variant: 'destructive' });
      return;
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast({ title: 'Invalid URL', description: 'Must start with http:// or https://', variant: 'destructive' });
      return;
    }

    // Determine topic based on target device selection
    const topic = targetDevice
      ? `TFCT_2_PE/cmd/${targetDevice}/ota_now`  // Device-specific OTA
      : 'TFCT_2_PE/cmd/ota_now';                 // Broadcast to all devices

    pendingOtaForRef.current = targetDevice || null;

    clientRef.current.publish(topic, trimmed, { qos: 1 }, (err) => {
      if (err) {
        toast({ title: 'MQTT Error', description: 'Failed to publish firmware command', variant: 'destructive' });
      } else {
        toast({
          title: 'Firmware',
          description: targetDevice
            ? `Updating... (device ${targetDevice})`
            : 'Updating...',
        });
      }
    });
  };

  // ========================================
  // FUNCTION: Upload Firmware and Start OTA
  // ========================================

  /**
   * Uploads firmware .bin file to backend/Vite dev server, then publishes download URL via MQTT
   *
   * Flow:
   * 1. POST file to /fw/upload endpoint
   * 2. Backend saves file and returns download URL
   * 3. Publish URL to TFCT_2_PE/cmd/ota_now
   * 4. ESP32 downloads and flashes firmware
   * 5. ESP32 publishes debug events to TFCT_2_PE/debug
   *
   * @param file - Firmware binary file (.bin)
   */
  const uploadAndStartOtaWithFile = async (file: File) => {
    if (isTesterMode) {
      toast({ title: 'Tester Mode', description: 'MQTT/Firmware OTA disabled in Tester Mode' });
      return;
    }
    try {
      setIsUploading(true);
      const form = new FormData();
      form.append('file', file);
      const FW_BASE = getFwBase();
      const res = await fetch(`${FW_BASE}/fw/upload`, { method: 'POST', body: form });
      if (!res.ok) {
        const msg = await res.text().catch(() => 'Upload failed');
        throw new Error(msg || 'Upload failed');
      }
      const json: { url: string; name?: string; file?: string } = await res.json();
      if (!json.url) throw new Error('Uploader did not return URL');

      // Remember saved filename for later cleanup
      try {
        lastUploadedFileRef.current = (json.file && String(json.file)) || (() => {
          const u = new URL(json.url);
          const parts = u.pathname.split('/');
          return decodeURIComponent(parts[parts.length - 1] || '');
        })();
      } catch {
        lastUploadedFileRef.current = null;
      }

      publishStartOta(json.url);
    } catch (e: any) {
      toast({ title: 'Upload Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // ========================================
  // FUNCTION: Legacy Wrapper for Upload
  // ========================================

  /**
   * Backward-compatible wrapper for uploadAndStartOtaWithFile
   * Uses otaFile state instead of direct file parameter
   */
  const uploadAndStartOta = async () => {
    if (isTesterMode) {
      toast({ title: 'Tester Mode', description: 'MQTT/Firmware OTA disabled in Tester Mode' });
      return;
    }
    if (!otaFile) {
      toast({ title: 'No file', description: 'Please choose a .bin firmware file', variant: 'destructive' });
      return;
    }
    return uploadAndStartOtaWithFile(otaFile);
  };

  // ========================================
  // EFFECT: Tester Mode - Live Data Generation
  // ========================================

  /**
   * Generates realistic sensor data locally in Tester Mode
   * - Updates sensor cards with new values every updateInterval
   * - Appends to chart ONLY if no historical simulation exists
   * - Uses smooth random walks to simulate realistic sensor behavior
   *
   * When historical data exists (hasSimulatedData = true):
   * - Sensor cards continue updating (live values)
   * - Chart remains frozen with 8-hour historical data
   */
  useEffect(() => {
    if (!isTesterMode) {
      testerInitDoneRef.current = false;
      return;
    }

    // Log the mode
    if (hasSimulatedData) {
      console.log('[Dashboard] Live sensor updates ONLY (chart frozen) - historical data exists');
    } else {
      console.log('[Dashboard] Live data generation with chart updates (updateInterval:', updateInterval, 'ms)');
    }

    const generateData = (initial = false) => {
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      // Smoother step function with smaller random variations
      const smoothStep = (v: number, maxStep: number) => {
        const change = (Math.random() * 2 - 1) * maxStep;
        return v + change;
      };

      // Default starting values if no previous data exists
      const defaults = { temperature: 26.5, humidity: 65, pressure: 1013.25, pm1: 8, pm25: 12, pm10: 18 } as const;
      const prev = lastMqttDataRef.current?.data ?? sensorData;
      const base = (initial || !Number.isFinite(prev.temperature))
        ? defaults
        : {
            temperature: prev.temperature,
            humidity: prev.humidity,
            pressure: prev.pressure,
            pm1: prev.pm1,
            pm25: prev.pm25,
            pm10: prev.pm10,
          };

      // Realistic bounds + small smooth steps to avoid chart spikes
      const next = {
        temperature: Number(clamp(smoothStep(base.temperature, 0.3), 18, 32).toFixed(2)),
        humidity: Number(clamp(smoothStep(base.humidity, 1.5), 40, 80).toFixed(2)),
        pressure: Number(clamp(smoothStep(base.pressure, 0.3), 1000, 1025).toFixed(2)),
        pm1: Math.round(clamp(smoothStep(base.pm1, 2), 5, 80)),
        pm25: Math.round(clamp(smoothStep(base.pm25, 3), 8, 120)),
        pm10: Math.round(clamp(smoothStep(base.pm10, 4), 12, 150)),
        aqi: 0,
      } as any;
      next.aqi = calculateAQI(next.pm25);
      const newData = next as typeof defaults & { aqi: number } as SensorData;

      // Always update sensor cards (live values)
      setSensorData(newData);
      setConnectionStatus('connected');
      setLastUpdate(new Date());
      lastMqttDataRef.current = { data: newData, timestamp: Date.now() };

      // Update chart data ONLY if no historical simulation exists
      setChartData(prev => {
        // CRITICAL: Never modify chart data if we have historical simulation
        // This prevents live generation from destroying simulated 8-hour data
        // But sensor card values continue updating normally
        if (hasSimulatedData) {
          return prev; // Return unchanged - chart frozen with historical data
        }

        const newPoint = {
          timestamp: new Date().toISOString(),
          ...newData,
        };
        // Only keep last 500 points for live tester data (not historical simulation)
        return [...prev.slice(-500), newPoint];
      });
    };

    // Generate initial data point
    if (!testerInitDoneRef.current) {
      generateData(true);
      testerInitDoneRef.current = true;
    }

    // Set interval for continuous data generation
    const interval = setInterval(() => generateData(false), updateInterval);

    return () => clearInterval(interval);
  }, [isTesterMode, updateInterval, hasSimulatedData]);

  // ========================================
  // EFFECT: MQTT Connection and Message Handling
  // ========================================

  /**
   * Connects to HiveMQ public MQTT broker (Normal Mode only)
   * Subscribes to TFCT_2_PE/# (all topics)
   * Handles incoming messages for sensor data, status, and debug events
   *
   * Topics:
   * - TFCT_2_PE/status → "online" | "offline"
   * - TFCT_2_PE/data → JSON sensor data (temperature, humidity, etc.)
   * - TFCT_2_PE/data/<mac> → Device-specific sensor data
   * - TFCT_2_PE/debug → OTA and debug events (ota_ok, ota_fail, etc.)
   */
  useEffect(() => {
    if (isTesterMode) {
      // Do not connect/publish any MQTT in tester mode
      return;
    }

    const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: 'esp32test01',
      clean: true,
      reconnectPeriod: 1000,
    });

    clientRef.current = client;
    const base = 'TFCT_2_PE';

    // Event: MQTT broker connection established
    client.on('connect', () => {
      console.log('✅ Connected to MQTT broker');
      toast({
        title: "MQTT Connected",
        description: "Successfully connected to broker"
      });
      client.subscribe(`${base}/#`, { qos: 0 }); // Subscribe to all topics under TFCT_2_PE
    });

    // Event: Incoming MQTT message
    client.on('message', (topic, message) => {
      const messageStr = message.toString();

      // ========================================
      // TOPIC: Device Status (online/offline)
      // ========================================
      if (topic === `${base}/status`) {
        if (messageStr === 'online') {
          // Clear any pending disconnect timer
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          setConnectionStatus('connected');
          console.log('Device status: online');
        } else if (messageStr === 'offline') {
          setConnectionStatus('disconnected');
          console.log('Device status: offline');

          // Set timer to change to "connecting" after 5 seconds
          // Prevents status flickering on brief disconnections
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
          }
          disconnectTimerRef.current = setTimeout(() => {
            setConnectionStatus('connecting');
            console.log('Device status: disconnected -> connecting');
          }, 5000);
        }
        return;
      }

      // ========================================
      // TOPIC: Sensor Data (JSON)
      // ========================================
      if (topic === `${base}/data` || topic.startsWith(`${base}/data/`)) {
        try {
          const data = JSON.parse(messageStr);
          console.log('Received sensor data:', data);

          // Map incoming data to SensorData interface
          const newData = {
            temperature: data.t ?? NaN,
            humidity: data.h ?? NaN,
            pressure: data.p ?? NaN,
            pm1: data.pm1 ?? NaN,
            pm25: data.pm25 ?? NaN,
            pm10: data.pm10 ?? NaN,
            aqi: calculateAQI(data.pm25 ?? NaN)
          };

          // Store MQTT data with timestamp (UI updates are throttled by updateInterval)
          lastMqttDataRef.current = { data: newData, timestamp: Date.now() };
          // Single-device mode; no device list tracking

          // Auto-sync RTC only after first data received
          if (!hasSyncedRtc.current) {
            hasSyncedRtc.current = true;
            const epoch = Math.floor(Date.now() / 1000);
            client.publish(`${base}/cmd/time`, String(epoch), { qos: 0 }, (err) => {
              if (!err) {
                console.log(`RTC synced: ${epoch}`);
                toast({
                  title: "RTC Auto-Synced",
                  description: `Time synchronized with ESP32`
                });
              }
            });
          }
        } catch (error) {
          console.error('Error parsing sensor data:', error);
        }
      }

      // ========================================
      // TOPIC: Debug Events (OTA status, errors)
      // ========================================
      if (topic === `${base}/debug`) {
        try {
          const evt = JSON.parse(messageStr);

          // Event: OTA Success or Failure
          if (evt && (evt.event === 'ota_ok' || evt.event === 'ota_fail')) {
            const id = evt.id as string | undefined;
            const match = pendingOtaForRef.current ? (id === pendingOtaForRef.current) : true;
            if (match) {
              const extra = evt.event === 'ota_fail'
                ? [
                    typeof evt.code === 'number' ? `code ${evt.code}` : undefined,
                    typeof evt.err === 'string' ? evt.err : undefined,
                  ].filter(Boolean).join(' – ')
                : undefined;
              toast({
                title: 'Firmware',
                description: evt.event === 'ota_ok' ? 'Update Successful' : 'Update Failed',
                variant: evt.event === 'ota_ok' ? undefined : 'destructive',
              });

              // After successful OTA, delete older firmware files and keep the latest only
              if (evt.event === 'ota_ok' && lastUploadedFileRef.current) {
                try {
                  const FW_BASE = getFwBase();
                  void fetch(`${FW_BASE}/fw/cleanup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keep: lastUploadedFileRef.current }),
                  });
                } catch {}
              }
              pendingOtaForRef.current = null;
            }
          }
          // Event: OTA Write Mismatch (partial write error)
          else if (evt && evt.event === 'ota_write_mismatch') {
            const id = evt.id as string | undefined;
            const rd = evt.rd as number | undefined;
            const w  = evt.w as number | undefined;
            const details = [
              id ? `Device ${id}` : undefined,
              (typeof rd === 'number' && typeof w === 'number') ? `wrote ${w}/${rd} bytes` : undefined,
            ].filter(Boolean).join(' – ');
            toast({ title: 'Firmware', description: 'Write Error', variant: 'destructive' });
          }
          // Event: OTA Begin Failure (flash partition error)
          else if (evt && evt.event === 'ota_begin_fail') {
            const id = evt.id as string | undefined;
            const reason = evt.reason as string | undefined;
            const details = [id ? `Device ${id}` : undefined, reason].filter(Boolean).join(' – ');
            toast({ title: 'Firmware', description: 'Begin Failed', variant: 'destructive' });
          }
          // Event: OTA HTTP Error (download failed)
          else if (evt && evt.event === 'ota_http') {
            const id = evt.id as string | undefined;
            const code = evt.code as number | undefined;
            const details = [id ? `Device ${id}` : undefined, typeof code === 'number' ? `HTTP ${code}` : undefined]
              .filter(Boolean).join(' – ');
            toast({ title: 'Firmware', description: 'HTTP Error', variant: 'destructive' });
          }
        } catch {}
      }
    });

    // Event: MQTT connection error
    client.on('error', (error) => {
      console.error('MQTT connection error:', error);
    });

    // Cleanup on unmount or mode switch
    return () => {
      client.end();
      clientRef.current = null;
      hasSyncedRtc.current = false;
      if (disconnectTimerRef.current) {
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = null;
      }
    };
  }, [isTesterMode]);

  // ========================================
  // EFFECT: UI Update Interval (Normal Mode)
  // ========================================

  /**
   * Periodically updates UI with latest MQTT data (Normal Mode only)
   * - Refreshes sensor cards with current values
   * - Appends new data points to chart
   * - Throttles updates based on updateInterval setting
   *
   * DISABLED in Tester Mode (tester has its own data generation)
   */
  useEffect(() => {
    // Skip this entire effect in Tester Mode
    if (isTesterMode) {
      console.log('[Dashboard] UI update effect SKIPPED - tester mode active');
      return;
    }

    const updateUI = () => {
      const ref = lastMqttDataRef.current;
      if (!ref) return;

      // Update visible cards to the latest data at this cadence
      setSensorData(ref.data);

      // Update last update timestamp
      setLastUpdate(new Date());

      // Append live point to chart (DB provides the history)
      setChartData(prev => {
        const newPoint = {
          timestamp: new Date().toISOString(),
          ...ref.data
        };
        // Keep last 1000 points in chart (prevents memory bloat)
        return [...prev.slice(-1000), newPoint];
      });
    };

    // Immediate update
    updateUI();

    // Set interval for periodic UI updates based on updateInterval
    const interval = setInterval(updateUI, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, isTesterMode]);

  // ========================================
  // EFFECT: Real-Time Clock Display
  // ========================================

  /**
   * Updates header clock every second
   * Shows current date and time in user's locale
   */
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Weather condition derived from pressure
  const weatherData = getWeatherFromPressure(sensorData.pressure);

  // ========================================
  // RENDER: Dashboard UI
  // ========================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light text-foreground mb-2">
            The Forecaster 2 [Pocket Edition]
          </h1>
          <div className="space-y-1">
            <p className="text-lg font-medium text-foreground">
              {currentTime.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdate.toLocaleTimeString('en-US')}
            </p>
          </div>
        </div>

        {/* Update Settings & Mode Toggle */}
        {/* Update Settings & Firmware (inline row) */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex w-full flex-col sm:flex-row items-center justify-center gap-3">
            <UpdateSettings
              updateInterval={updateInterval}
              onUpdateIntervalChange={(interval: number) => {
                setUpdateInterval(interval);
                if (!isTesterMode) {
                  publishUpdateInterval(interval);
                }
              }}
            />
            {/* Historical Data Generation (only in Tester Mode - in-memory, no backend needed) */}
            {isTesterMode && (
              <div className="flex items-center gap-3 bg-card/50 backdrop-blur-sm rounded-lg p-4 border border-border/50">
                <DbIcon size={16} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Historical Data</div>
                  <div className="text-xs text-muted-foreground">Generate or clear 8h test data (in-memory)</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={hasSimulatedData ? removeSimulatedData : simulateDatabaseData}
                  disabled={isDbSimulating}
                  className="gap-2"
                >
                  {isDbSimulating ? 'Generating...' : hasSimulatedData ? 'Clear' : 'Generate'}
                </Button>
              </div>
            )}
            {/* Firmware Update is hidden in Tester Mode */}
            {!isTesterMode && (
              <div className="flex items-center gap-3 bg-card/50 backdrop-blur-sm rounded-lg p-4 border border-border/50">
                <Upload size={16} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Firmware Update</div>
                  <div className="text-xs text-muted-foreground">Upload .bin and start Firmware OTA</div>
                </div>
                <input
                  id="otaFileInline"
                  type="file"
                  accept=".bin"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  if (f) {
                    setOtaFile(f);
                    // Start OTA immediately with the selected file (avoid race with state update)
                    void uploadAndStartOtaWithFile(f);
                  }
                  e.currentTarget.value = '';
                }}
                  className="hidden"
                />
                <Button size="sm" variant="outline" onClick={() => {
                  const el = document.getElementById('otaFileInline') as HTMLInputElement | null;
                  el?.click();
                }} disabled={isUploading} className="gap-2">
                  <Upload size={16} /> {isUploading ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Button
              variant={isTesterMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsTesterMode(!isTesterMode)}
              className="gap-2"
            >
              <FlaskConical size={16} />
              {isTesterMode ? "Tester Mode" : "Normal Mode"}
            </Button>
            {/* ESP32 (MQTT) status */}
            <Badge
              variant="default"
              className={`${
                isTesterMode
                  ? "bg-blue-500 hover:bg-blue-600"
                  : connectionStatus === 'connected'
                  ? "bg-green-500 hover:bg-green-600"
                  : connectionStatus === 'disconnected'
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-yellow-500 hover:bg-yellow-600"
              } flex items-center gap-2`}
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              {isTesterMode
                ? "ESP32: Tester"
                : connectionStatus === 'connected'
                ? "ESP32: Connected"
                : connectionStatus === 'disconnected'
                ? "ESP32: Disconnected"
                : "ESP32: Connecting..."}
            </Badge>
            {/* Database status (via /health) */}
            <Badge
              variant="default"
              className={`${
                // In tester mode: red if no data, blue if simulated
                isTesterMode
                  ? hasSimulatedData
                    ? "bg-blue-500 hover:bg-blue-600"
                    : "bg-red-500 hover:bg-red-600"
                  : // In normal mode: green if online, red if offline
                    dbStatus === 'online'
                    ? "bg-green-500 hover:bg-green-600"
                    : dbStatus === 'offline'
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-yellow-500 hover:bg-yellow-600"
              } flex items-center gap-2`}
            >
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              {isTesterMode
                ? hasSimulatedData
                  ? 'History: Loaded'
                  : 'History: Empty'
                : dbStatus === 'online'
                ? 'Database: Online'
                : dbStatus === 'offline'
                ? 'Database: Offline'
                : 'Database: Checking...'}
            </Badge>
          </div>
      </div>
      {/* OTA Panel moved inline next to Update Settings */}
        <div className="mb-6">
          <div className="grid grid-cols-1 gap-6">
          <SensorCard
            title="Air Quality"
            subtitle="AQI Index"
            value={isNaN(sensorData.aqi) ? 'N/A' : sensorData.aqi.toFixed(0)}
            unit="AQI"
            status={getAQIStatus(sensorData.aqi)}
            icon={<Leaf size={20} />}
          />
          </div>
        </div>

        {/* Other Sensors - 2 Rows x 3 Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <SensorCard
            title="Temperature"
            subtitle="Indoor Climate"
            value={isNaN(sensorData.temperature) ? 'N/A' : sensorData.temperature.toFixed(2)}
            unit="°C"
            status={getTemperatureStatus(sensorData.temperature)}
            icon={<Thermometer size={20} />}
          />

          <SensorCard
            title="Humidity"
            subtitle="Relative Humidity"
            value={isNaN(sensorData.humidity) ? 'N/A' : sensorData.humidity.toFixed(2)}
            unit="%"
            status={getHumidityStatus(sensorData.humidity)}
            icon={<Droplets size={20} />}
          />

          <SensorCard
            title="Weather"
            subtitle={weatherData.condition}
            value={isNaN(sensorData.pressure) ? 'N/A' : sensorData.pressure.toFixed(2)}
            unit="hPa"
            status={weatherData.status}
            icon={weatherData.icon}
          />

          <SensorCard
            title="PM1.0"
            subtitle="Particles < 1.0 μm"
            value={isNaN(sensorData.pm1) ? 'N/A' : sensorData.pm1.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm1)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM2.5"
            subtitle="Particles < 2.5 μm"
            value={isNaN(sensorData.pm25) ? 'N/A' : sensorData.pm25.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm25)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM10"
            subtitle="Particles < 10 μm"
            value={isNaN(sensorData.pm10) ? 'N/A' : sensorData.pm10.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm10)}
            icon={<AlertTriangle size={20} />}
          />
        </div>

        {/* Charts */}
        <div className="mt-8 grid grid-cols-1 gap-6">
          <SensorChart key={chartKey} data={chartData} />
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>The Forecaster 2 [Pocket Edition] - IoT Environmental Monitoring System</p>
        </div>
      </div>
    </div>
  );
};
