import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import { SensorCard } from './SensorCard';
import { SensorChart } from './SensorChart';
import { UpdateSettings } from './UpdateSettings';
import { Thermometer, Droplets, Cloud, CloudRain, Sun, Wind, Leaf, AlertTriangle, FlaskConical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isTesterMode, setIsTesterMode] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const lastMqttDataRef = useRef<{ data: SensorData; timestamp: number } | null>(null);
  const hasShownConnectToast = useRef(false);
  const hasSyncedRtc = useRef(false);
  const clientRef = useRef<mqtt.MqttClient | null>(null);
  const disconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear chart data when switching modes
  useEffect(() => {
    setChartData([]);
  }, [isTesterMode]);

  // Calculate AQI from PM2.5
  const calculateAQI = (pm25: number) => {
    if (pm25 <= 12) return Math.round((50 / 12) * pm25);
    if (pm25 <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (pm25 - 12.1) + 51);
    if (pm25 <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (pm25 - 35.5) + 101);
    if (pm25 <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (pm25 - 55.5) + 151);
    return Math.min(500, Math.round(((300 - 201) / (250.4 - 150.5)) * (pm25 - 150.5) + 201));
  };

  // Publish RTC time to ESP32
  const publishSetRtcNow = () => {
    if (!clientRef.current) {
      toast({ 
        title: "MQTT Error", 
        description: "Not connected to MQTT broker",
        variant: "destructive"
      });
      return;
    }
    const epoch = Math.floor(Date.now() / 1000);
    clientRef.current.publish("kuytoojung/cmd/time", String(epoch), { qos: 0 }, (err) => {
      if (err) {
        toast({ 
          title: "MQTT Error", 
          description: "Failed to send time command",
          variant: "destructive"
        });
      } else {
        toast({ 
          title: "RTC Synced", 
          description: `Epoch time ${epoch} sent to ESP32`
        });
      }
    });
  };

  // Publish update interval to ESP32
  const publishUpdateInterval = (ms: number) => {
    if (!clientRef.current) {
      toast({ 
        title: "MQTT Error", 
        description: "Not connected to MQTT broker",
        variant: "destructive"
      });
      return;
    }
    const clamped = Math.min(Math.max(ms, 500), 600000);
    clientRef.current.publish("kuytoojung/cmd/interval", String(clamped), { qos: 0, retain: true }, (err) => {
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

  // Tester mode - generate random sensor data
  useEffect(() => {
    if (!isTesterMode) return;

    const generateRandomData = () => {
      const newData = {
        temperature: 20 + Math.random() * 15,
        humidity: 40 + Math.random() * 40,
        pressure: 1000 + Math.random() * 30,
        pm1: Math.random() * 50,
        pm25: Math.random() * 75,
        pm10: Math.random() * 100,
        aqi: 0
      };
      newData.aqi = calculateAQI(newData.pm25);

      setSensorData(newData);
      setConnectionStatus('connected');
      setLastUpdate(new Date());
      lastMqttDataRef.current = { data: newData, timestamp: Date.now() };

      setChartData(prev => {
        const newPoint = {
          timestamp: new Date().toISOString(),
          ...newData
        };
        return [...prev.slice(-500), newPoint];
      });
    };

    generateRandomData();
    const interval = setInterval(generateRandomData, updateInterval);

    return () => clearInterval(interval);
  }, [isTesterMode, updateInterval]);

  // Connect to MQTT broker and receive real sensor data
  useEffect(() => {
    if (isTesterMode) return;

    const client = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: 'esp32test01',
      clean: true,
      reconnectPeriod: 1000,
    });

    clientRef.current = client;

    client.on('connect', () => {
      console.log('Connected to MQTT broker');
      if (!hasShownConnectToast.current) {
        hasShownConnectToast.current = true;
      }
      client.subscribe('kuytoojung/#', { qos: 0 });
    });

    client.on('message', (topic, message) => {
      const messageStr = message.toString();
      
      // Handle status topic (plain text: "online" or "offline")
      if (topic === 'kuytoojung/status') {
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
            console.log('Device status: disconnected → connecting');
          }, 5000);
        }
        return;
      }

      // Handle sensor data topic (JSON) - only from kuytoojung/data
      if (topic === 'kuytoojung/data') {
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

          // Store MQTT data with timestamp
          lastMqttDataRef.current = { data: newData, timestamp: Date.now() };
          setSensorData(newData);

          // Auto-sync RTC only after first data received
          if (!hasSyncedRtc.current) {
            hasSyncedRtc.current = true;
            const epoch = Math.floor(Date.now() / 1000);
            client.publish("kuytoojung/cmd/time", String(epoch), { qos: 0 }, (err) => {
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
    if (isTesterMode) return;

    // Only run interval if connected
    if (connectionStatus !== 'connected') {
      return;
    }

    const updateUI = () => {
      if (lastMqttDataRef.current) {
        // Update last update timestamp
        setLastUpdate(new Date());
        
        // Update chart with current data
        setChartData(prev => {
          const newPoint = {
            timestamp: new Date().toISOString(),
            ...lastMqttDataRef.current!.data
          };
          return [...prev.slice(-500), newPoint];
        });
      }
    };

    // Immediate update when connected
    updateUI();

    // Set interval for periodic UI updates based on updateInterval
    const interval = setInterval(updateUI, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, isTesterMode, connectionStatus]);

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
        <div className="mb-6 flex flex-col justify-center items-center gap-4">
          <UpdateSettings 
            updateInterval={updateInterval}
            onUpdateIntervalChange={(interval: number) => {
              setUpdateInterval(interval);
              if (!isTesterMode) {
                publishUpdateInterval(interval);
              }
            }}
          />
          <div className="flex items-center gap-3">
            <Button
              variant={isTesterMode ? "default" : "outline"}
              size="sm"
              onClick={() => setIsTesterMode(!isTesterMode)}
              className="gap-2"
            >
              <FlaskConical size={16} />
              {isTesterMode ? "Tester Mode" : "Normal Mode"}
            </Button>
            {isTesterMode ? (
              <Badge variant="default" className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                Tester
              </Badge>
            ) : (
              <Badge 
                variant="default"
                className={`${
                  connectionStatus === 'connected' 
                    ? "bg-green-500 hover:bg-green-600" 
                    : connectionStatus === 'disconnected'
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-yellow-500 hover:bg-yellow-600"
                } flex items-center gap-2`}
              >
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                {connectionStatus === 'connected' 
                  ? "Connected" 
                  : connectionStatus === 'disconnected'
                  ? "Disconnected"
                  : "Connecting..."}
              </Badge>
            )}
          </div>
        </div>

        {/* Air Quality - Top Row */}
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
            value={isNaN(sensorData.temperature) ? 'N/A' : sensorData.temperature.toFixed(1)}
            unit="°C"
            status={getTemperatureStatus(sensorData.temperature)}
            icon={<Thermometer size={20} />}
          />

          <SensorCard
            title="Humidity"
            subtitle="Relative Humidity"
            value={isNaN(sensorData.humidity) ? 'N/A' : sensorData.humidity.toFixed(0)}
            unit="%"
            status={getHumidityStatus(sensorData.humidity)}
            icon={<Droplets size={20} />}
          />

          <SensorCard
            title="Weather"
            subtitle={weatherData.condition}
            value={isNaN(sensorData.pressure) ? 'N/A' : sensorData.pressure.toFixed(1)}
            unit="hPa"
            status={weatherData.status}
            icon={weatherData.icon}
          />

          <SensorCard
            title="PM1.0"
            subtitle="อนุภาคขนาดเล็ก"
            value={isNaN(sensorData.pm1) ? 'N/A' : sensorData.pm1.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm1)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM2.5"
            subtitle="อนุภาคละเอียด"
            value={isNaN(sensorData.pm25) ? 'N/A' : sensorData.pm25.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm25)}
            icon={<AlertTriangle size={20} />}
          />

          <SensorCard
            title="PM10"
            subtitle="อนุภาคขนาดใหญ่"
            value={isNaN(sensorData.pm10) ? 'N/A' : sensorData.pm10.toFixed(0)}
            unit="μg/m³"
            status={getPMStatus(sensorData.pm10)}
            icon={<AlertTriangle size={20} />}
          />
        </div>

        {/* Charts */}
        <div className="mt-8 grid grid-cols-1 gap-6">
          <SensorChart data={chartData} />
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>IoT Environmental Monitoring System</p>
        </div>
      </div>
    </div>
  );
};