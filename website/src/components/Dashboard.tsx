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

// Dashboard
// - Reads data from ESP32 via MQTT (Tester Mode = no MQTT; UI simulates data)
// - Subscribe: TFCT_2_PE/# for status, data, debug
// - Publish: cmd/time, cmd/interval, cmd/ota_now (disabled in Tester Mode)
// - Maintains chartData and renders SensorCard/SensorChart

interface SensorData {
  temperature: number;
  humidity: number;
  pressure: number;
  pm1: number;
  pm25: number;
  pm10: number;
  aqi: number;
}

interface ChartData {
  timestamp: string;
  temperature: number;
  humidity: number;
  pressure: number;
  pm1: number;
  pm25: number;
  pm10: number;
  aqi: number;
}

// Utility functions for status determination
const getTemperatureStatus = (temp: number) => {
  if (isNaN(temp)) return 'unavailable';
  if (temp >= 18 && temp <= 24) return 'excellent';
  if (temp >= 16 && temp <= 28) return 'good';
  if (temp >= 12 && temp <= 32) return 'moderate';
  if (temp >= 8 && temp <= 36) return 'poor';
  return 'hazardous';
};

const getHumidityStatus = (humidity: number) => {
  if (isNaN(humidity)) return 'unavailable';
  if (humidity >= 40 && humidity <= 60) return 'excellent';
  if (humidity >= 30 && humidity <= 70) return 'good';
  if (humidity >= 25 && humidity <= 75) return 'moderate';
  if (humidity >= 20 && humidity <= 80) return 'poor';
  return 'hazardous';
};

const getAQIStatus = (aqi: number) => {
  if (isNaN(aqi)) return 'unavailable';
  if (aqi <= 50) return 'excellent';
  if (aqi <= 100) return 'good';
  if (aqi <= 150) return 'moderate';
  if (aqi <= 200) return 'poor';
  return 'hazardous';
};

const getPMStatus = (pm: number) => {
  if (isNaN(pm)) return 'unavailable';
  if (pm <= 12) return 'excellent';
  if (pm <= 35) return 'good';
  if (pm <= 55) return 'moderate';
  if (pm <= 150) return 'poor';
  return 'hazardous';
};

const getWeatherFromPressure = (pressure: number): { 
  status: 'excellent' | 'good' | 'moderate' | 'poor' | 'hazardous' | 'unavailable'; 
  condition: string; 
  icon: React.ReactNode 
} => {
  if (isNaN(pressure)) return { status: 'unavailable' as const, condition: 'No Data', icon: <Wind size={20} /> };
  if (pressure >= 1022) return { status: 'excellent' as const, condition: 'High Pressure', icon: <Sun size={20} /> };
  if (pressure >= 1013) return { status: 'good' as const, condition: 'Fair Weather', icon: <Cloud size={20} /> };
  if (pressure >= 1000) return { status: 'moderate' as const, condition: 'Changing', icon: <Cloud size={20} /> };
  if (pressure >= 990) return { status: 'poor' as const, condition: 'Rain Likely', icon: <CloudRain size={20} /> };
  return { status: 'hazardous' as const, condition: 'Storm Risk', icon: <CloudRain size={20} /> };
};

export const Dashboard = () => {
  // Core UI state (current values / timers / modes / connection)
  const [sensorData, setSensorData] = useState<SensorData>({
    temperature: NaN,
    humidity: NaN,
    pressure: NaN,
    pm1: NaN,
    pm25: NaN,
    pm10: NaN,
    aqi: NaN
  });

  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [updateInterval, setUpdateInterval] = useState(5000);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [chartKey, setChartKey] = useState(0); // Increment to force chart remount on mode change
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isTesterMode, setIsTesterMode] = useState(false); // Tester mode: do not use MQTT
  const [isDbSimulating, setIsDbSimulating] = useState(false); // DB simulation: populate 8h of data
  const [hasSimulatedData, setHasSimulatedData] = useState(false); // Track if DB has simulated data
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const lastMqttDataRef = useRef<{ data: SensorData; timestamp: number } | null>(null); // stash last MQTT packet with ts
  const hasShownConnectToast = useRef(false);
  const hasSyncedRtc = useRef(false); // sync RTC once after first data
  const clientRef = useRef<mqtt.MqttClient | null>(null); // MQTT client instance
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null); // delay offline -> connecting
  const testerInitDoneRef = useRef(false); // prevent double initial sample in tester mode

  // OTA state
  const [otaFile, setOtaFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Devices discovered from data/<id>
  const [devices, setDevices] = useState<string[]>([]);
  const [targetDevice, setTargetDevice] = useState<string | ''>(''); // '' = all devices
  const pendingOtaForRef = useRef<string | null>(null);
  const lastUploadedFileRef = useRef<string | null>(null); // saved filename in /f/
  // DB history tracking for initial load + reference
  const lastDbTsRef = useRef<number>(0);
  const historyLoadedRef = useRef<boolean>(false);
  // DB-driven chart is disabled for now (reverted to MQTT-only)

  // Reset chart data when switching (real/test)
  useEffect(() => {
    // Clear all chart-related state and refs
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

  // Database/Backend health status polling
  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      try {
        const base = getApiBase();
        const url = (base ? `${base}/health` : '/health');
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('bad status');
        const j = await res.json().catch(() => ({}));
        if (!disposed) setDbStatus(j && j.ok && j.db ? 'online' : 'offline');
      } catch {
        if (!disposed) setDbStatus('offline');
      }
    };
    setDbStatus('checking');
    void poll();
    const id = setInterval(poll, 10000);
    return () => { disposed = true; clearInterval(id); };
  }, [isTesterMode]);

  // Load historical data from DB once (Normal Mode) then keep appending from MQTT
  useEffect(() => {
    if (isTesterMode) return; // Tester Mode does not use DB
    let cancelled = false;
    (async () => {
      try {
        const API_BASE = getApiBase();
        const res = await fetch(`${API_BASE}/api/readings?minutes=480`);
        if (!res.ok) return;
        const rows = await res.json();
        if (cancelled || !Array.isArray(rows)) return;
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
        if (rows.length > 0) {
          lastDbTsRef.current = new Date(rows[rows.length - 1].ts).getTime();
        }
        historyLoadedRef.current = true;
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isTesterMode]);

  // Calculate AQI from PM2.5 (approx. breakpoints)
  const calculateAQI = (pm25: number) => {
    if (pm25 <= 12) return Math.round((50 / 12) * pm25);
    if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
    if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
    if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
    return Math.min(500, Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201));
  };

  // Database simulation: populate 8 hours of test data with randomized intervals
  const simulateDatabaseData = async () => {
    if (!isTesterMode) {
      toast({
        title: "Database Simulation",
        description: "Only available in Tester Mode",
        variant: "destructive"
      });
      return;
    }

    if (isDbSimulating) {
      toast({
        title: "Already Simulating",
        description: "Database simulation is already running",
        variant: "destructive"
      });
      return;
    }

    setIsDbSimulating(true);

    toast({
      title: "Database Simulation Started",
      description: "Generating 8 hours of data with random intervals..."
    });

    try {
      const API_BASE = getApiBase();
      const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
      const now = Date.now();
      const startTime = now - EIGHT_HOURS_MS;

      // Generate data points with randomized intervals
      const dataPoints: any[] = [];
      let currentTime = startTime;

      // Helper functions for data generation
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      const stepFrom = (v: number, step: number) => v + (Math.random() * 2 - 1) * step;

      // Starting values
      let prevData = {
        temperature: 25,
        humidity: 70,
        pressure: 1010.10,
        pm1: 16,
        pm25: 8,
        pm10: 12
      };

      // Generate points until we reach current time
      while (currentTime <= now) {
        // Generate next data point with smooth transitions
        const nextData = {
          temperature: Number(clamp(stepFrom(prevData.temperature, 0.5), 15, 35).toFixed(2)),
          humidity: Number(clamp(stepFrom(prevData.humidity, 2.0), 30, 85).toFixed(2)),
          pressure: Number(clamp(stepFrom(prevData.pressure, 0.5), 995, 1030).toFixed(2)),
          pm1: Math.round(clamp(stepFrom(prevData.pm1, 3), 0, 120)),
          pm25: Math.round(clamp(stepFrom(prevData.pm25, 5), 0, 150)),
          pm10: Math.round(clamp(stepFrom(prevData.pm10, 5), 0, 180)),
        };

        const aqi = calculateAQI(nextData.pm25);

        dataPoints.push({
          ts: new Date(currentTime).toISOString(),
          t: nextData.temperature,
          h: nextData.humidity,
          p: nextData.pressure,
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

      // Send data to backend API in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < dataPoints.length; i += BATCH_SIZE) {
        const batch = dataPoints.slice(i, i + BATCH_SIZE);

        const response = await fetch(`${API_BASE}/api/readings/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ readings: batch })
        });

        if (!response.ok) {
          throw new Error(`Failed to insert batch ${i / BATCH_SIZE + 1}`);
        }

        // Show progress
        const progress = Math.round(((i + batch.length) / dataPoints.length) * 100);
        if (progress % 20 === 0 || i + BATCH_SIZE >= dataPoints.length) {
          toast({
            title: "Simulation Progress",
            description: `${progress}% complete (${i + batch.length}/${dataPoints.length} points)`
          });
        }
      }

      toast({
        title: "Simulation Complete",
        description: `Successfully generated ${dataPoints.length} data points over 8 hours`
      });

      // Reload the chart with new data
      const res = await fetch(`${API_BASE}/api/readings?minutes=480`);
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) {
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
          setHasSimulatedData(true); // Mark as simulated
        }
      }

    } catch (error: any) {
      toast({
        title: "Simulation Failed",
        description: error.message || "Failed to generate database data",
        variant: "destructive"
      });
    } finally {
      setIsDbSimulating(false);
    }
  };

  // Remove simulated database data
  const removeSimulatedData = async () => {
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
        description: "Wait for simulation to complete",
        variant: "destructive"
      });
      return;
    }

    try {
      const API_BASE = getApiBase();

      toast({
        title: "Removing Data",
        description: "Clearing simulated database data..."
      });

      const response = await fetch(`${API_BASE}/api/readings/clear`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to clear data');
      }

      const result = await response.json();

      toast({
        title: "Data Removed",
        description: `Deleted ${result.deleted || 0} data points`
      });

      // Clear chart
      setChartData([]);
      setHasSimulatedData(false);

    } catch (error: any) {
      toast({
        title: "Remove Failed",
        description: error.message || "Failed to remove database data",
        variant: "destructive"
      });
    }
  };

  // Command: set RTC on device (disabled in Tester Mode)
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
    const epoch = Math.floor(Date.now() / 1000);
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

  // Command: set update interval (ms) on device (disabled in Tester Mode)
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
    const clamped = Math.min(Math.max(ms, 500), 600000);
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

  // Command: start Firmware OTA by URL (ESP32 accepts URL on SUB_OTA_NOW)
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
    const topic = targetDevice
      ? `TFCT_2_PE/cmd/${targetDevice}/ota_now`
      : 'TFCT_2_PE/cmd/ota_now';
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

  // Upload firmware to dev uploader then publish URL to start update (disabled in Tester Mode)
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

  // Backward-compatible wrapper (in case any callers still use it)
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

  // Tester mode - first fixed sample, then random
  useEffect(() => {
    if (!isTesterMode) {
      testerInitDoneRef.current = false;
      return;
    }

    const generateData = (initial = false) => {
      const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
      const stepFrom = (v: number, step: number) => v + (Math.random() * 2 - 1) * step; // uniform step

      const defaults = { temperature: 25, humidity: 70, pressure: 1010.10, pm1: 16, pm25: 8, pm10: 12 } as const;
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

      // plausible bounds + small steps to avoid chart spikes
      const next = {
        temperature: Number(clamp(stepFrom(base.temperature, 0.5), 15, 35).toFixed(2)),
        humidity: Number(clamp(stepFrom(base.humidity, 2.0), 30, 85).toFixed(2)),
        pressure: Number(clamp(stepFrom(base.pressure, 0.5), 995, 1030).toFixed(2)),
        pm1: Math.round(clamp(stepFrom(base.pm1, 3), 0, 120)),
        pm25: Math.round(clamp(stepFrom(base.pm25, 5), 0, 150)),
        pm10: Math.round(clamp(stepFrom(base.pm10, 5), 0, 180)),
        aqi: 0,
      } as any;
      next.aqi = calculateAQI(next.pm25);
      const newData = next as typeof defaults & { aqi: number } as SensorData;

      setSensorData(newData);
      setConnectionStatus('connected');
      setLastUpdate(new Date());
      lastMqttDataRef.current = { data: newData, timestamp: Date.now() };

      setChartData(prev => {
        const newPoint = {
          timestamp: new Date().toISOString(),
          ...newData,
        };
        return [...prev.slice(-500), newPoint];
      });
    };

    if (!testerInitDoneRef.current) {
      generateData(true);
      testerInitDoneRef.current = true;
    }
    const interval = setInterval(() => generateData(false), updateInterval);

    return () => clearInterval(interval);
  }, [isTesterMode, updateInterval]);

  // ????????? MQTT ?????????????????????? (????????????? Tester Mode)
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

    client.on('connect', () => {
      console.log('Connected to MQTT broker');
      if (!hasShownConnectToast.current) {
        hasShownConnectToast.current = true;
      }
      client.subscribe(`${base}/#`, { qos: 0 });
    });

    client.on('message', (topic, message) => {
      const messageStr = message.toString();
      
      // Handle status topic (plain text: "online" or "offline")
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

      // Handle sensor data topic (JSON) - supports MAC suffix: base/data/<mac>
      if (topic === `${base}/data` || topic.startsWith(`${base}/data/`)) {
        try {
          const data = JSON.parse(messageStr);
          console.log('Received sensor data:', data);
          
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

      // OTA debug events
      if (topic === `${base}/debug`) {
        try {
          const evt = JSON.parse(messageStr);
          // Surface key firmware statuses as toasts
          if (evt && (evt.event === 'ota_ok' || evt.event === 'ota_fail')) {
            const id = evt.id as string | undefined;
            const match = pendingOtaForRef.current ? (id === pendingOtaForRef.current) : true;
            if (match) {
              const extra = evt.event === 'ota_fail'
                ? [
                    typeof evt.code === 'number' ? `code ${evt.code}` : undefined,
                    typeof evt.err === 'string' ? evt.err : undefined,
                  ].filter(Boolean).join(' � ')
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
          } else if (evt && evt.event === 'ota_write_mismatch') {
            const id = evt.id as string | undefined;
            const rd = evt.rd as number | undefined;
            const w  = evt.w as number | undefined;
            const details = [
              id ? `Device ${id}` : undefined,
              (typeof rd === 'number' && typeof w === 'number') ? `wrote ${w}/${rd} bytes` : undefined,
            ].filter(Boolean).join(' � ');
            toast({ title: 'Firmware', description: 'Write Error', variant: 'destructive' });
          } else if (evt && evt.event === 'ota_begin_fail') {
            const id = evt.id as string | undefined;
            const reason = evt.reason as string | undefined;
            const details = [id ? `Device ${id}` : undefined, reason].filter(Boolean).join(' � ');
            toast({ title: 'Firmware', description: 'Begin Failed', variant: 'destructive' });
          } else if (evt && evt.event === 'ota_http') {
            const id = evt.id as string | undefined;
            const code = evt.code as number | undefined;
            const details = [id ? `Device ${id}` : undefined, typeof code === 'number' ? `HTTP ${code}` : undefined]
              .filter(Boolean).join(' � ');
            toast({ title: 'Firmware', description: 'HTTP Error', variant: 'destructive' });
          }
        } catch {}
      }
    });

    client.on('error', (error) => {
      console.error('MQTT connection error:', error);
    });

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

  // Update UI periodically - refresh display from latest MQTT data
  useEffect(() => {
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
        return [...prev.slice(-1000), newPoint];
      });
    };

    // Immediate update
    updateUI();

    // Set interval for periodic UI updates based on updateInterval
    const interval = setInterval(updateUI, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, isTesterMode]);

  // DB preload disabled (will reintroduce later once stable)

  // Real-time clock
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  const weatherData = getWeatherFromPressure(sensorData.pressure);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/30 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-light text-foreground mb-2">
            Environmental Monitor
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
            {/* Database Simulation (only in Tester Mode) */}
            {isTesterMode && (
              <div className="flex items-center gap-3 bg-card/50 backdrop-blur-sm rounded-lg p-4 border border-border/50">
                <DbIcon size={16} className="text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">Database Simulation</div>
                  <div className="text-xs text-muted-foreground">Generate or remove 8h test data</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={simulateDatabaseData}
                    disabled={isDbSimulating || dbStatus !== 'online' || hasSimulatedData}
                    className="gap-2"
                  >
                    {isDbSimulating ? 'Simulating...' : 'Simulate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={removeSimulatedData}
                    disabled={isDbSimulating || dbStatus !== 'online' || !hasSimulatedData}
                    className="gap-2"
                  >
                    Remove
                  </Button>
                </div>
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
                  <Upload size={16} /> {isUploading ? 'Uploading�' : 'Upload'}
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
              <DbIcon size={16} />
              {isTesterMode
                ? hasSimulatedData
                  ? 'Database: Simulated'
                  : 'Database: Empty'
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
            unit="�?C"
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
            subtitle="Particles < 1.0 �m"
            value={isNaN(sensorData.pm1) ? 'N/A' : sensorData.pm1.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm1)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM2.5"
            subtitle="Particles < 2.5 �m"
            value={isNaN(sensorData.pm25) ? 'N/A' : sensorData.pm25.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm25)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM10"
            subtitle="Particles < 10 �m"
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
          <p>IoT Environmental Monitoring System</p>
        </div>
      </div>
    </div>
  );
};

