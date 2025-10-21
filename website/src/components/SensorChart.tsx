/**
 * ========================================
 * The Forecaster 2 - Pocket Edition
 * SensorChart Component (Time-Series Visualization)
 * ========================================
 *
 * Purpose:
 * - Displays historical sensor data in interactive line charts
 * - Supports multiple sensor types (temperature, humidity, pressure, PM, AQI)
 * - Offers flexible time frame selection (points-based or time-based)
 * - Automatically computes optimal Y-axis ticks for readability
 *
 * Features:
 * - Dual filtering modes:
 *   - Points mode: Show last N data points (10, 30)
 *   - Time mode: Show data from last N minutes (60, 240, 480)
 * - Persistent user preferences (localStorage)
 * - Adaptive Y-axis scaling with nice tick intervals
 * - Time-scale X-axis showing HH:MM timestamps
 * - Handles missing/invalid data gracefully (NaN → null)
 *
 * Technical Notes:
 * - Uses Recharts library for visualization
 * - Time-based filtering anchors to LATEST data point (not current time)
 * - Prevents negative Y values for humidity/PM/AQI sensors
 * - Disables animations for performance with large datasets
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from 'react';

/**
 * Interface: Chart data point structure
 * Matches the SensorData from Dashboard with added timestamp
 */
interface ChartData {
  timestamp: string;    // ISO 8601 timestamp
  temperature: number;  // °C
  humidity: number;     // %
  pressure: number;     // hPa
  pm1: number;          // µg/m³
  pm25: number;         // µg/m³
  pm10: number;         // µg/m³
  aqi: number;          // Air Quality Index (0-500)
}

/**
 * Component props interface
 */
interface SensorChartProps {
  data: ChartData[];    // Historical data points from Dashboard
}

/**
 * Available time frame options
 * - isPoints: true → Show last N data points (regardless of time)
 * - isPoints: false → Show data from last N minutes (time-based filtering)
 */
const timeFrames = [
  { value: 10, label: "Last 10 points", isPoints: true },   // Points mode: Quick view
  { value: 30, label: "Last 30 points", isPoints: true },   // Points mode: Recent trend
  { value: 60, label: "Last 1 hour", isPoints: false },     // Time mode: 1 hour history
  { value: 240, label: "Last 4 hours", isPoints: false },   // Time mode: 4 hour history
  { value: 480, label: "Last 8 hours", isPoints: false }    // Time mode: 8 hour history (default)
];

/**
 * Sensor configuration for chart display
 * - key: Data property name
 * - name: Display name
 * - color: Line color (HSL format, uses CSS variables)
 * - unit: Measurement unit for tooltip/axis
 */
const sensorConfigs = [
  { key: 'temperature', name: 'Temperature', color: 'hsl(var(--excellent))', unit: '°C' },
  { key: 'humidity',    name: 'Humidity',    color: 'hsl(200 80% 50%)',      unit: '%' },
  { key: 'pressure',    name: 'Pressure',    color: 'hsl(var(--moderate))',  unit: 'hPa' },
  { key: 'pm1',         name: 'PM1.0',       color: 'hsl(var(--poor))',      unit: 'µg/m³' },
  { key: 'pm25',        name: 'PM2.5',       color: 'hsl(var(--hazardous))', unit: 'µg/m³' },
  { key: 'pm10',        name: 'PM10',        color: 'hsl(var(--primary))',   unit: 'µg/m³' },
  { key: 'aqi',         name: 'AQI',         color: 'hsl(320 70% 60%)',      unit: 'AQI' }
] as const;

/**
 * SensorChart Component
 * Renders interactive time-series chart with sensor selection and time frame controls
 *
 * @param data - Array of sensor readings with timestamps (from Dashboard)
 */
export const SensorChart = ({ data }: SensorChartProps) => {
  // ========================================
  // STATE: User Preferences
  // ========================================

  /** Selected time frame value (minutes or point count) */
  const [timeFrame, setTimeFrame] = useState(480); // Default: Last 8 hours

  /** Currently displayed sensor type */
  const [selectedSensor, setSelectedSensor] = useState<'temperature'|'humidity'|'pressure'|'pm1'|'pm25'|'pm10'|'aqi'>('temperature');

  // ========================================
  // EFFECT: Persist User Preferences
  // ========================================

  /**
   * Load saved preferences from localStorage on mount
   * Persists user's time frame and sensor selection across page refreshes
   */
  useEffect(() => {
    try {
      // Load time frame preference
      const tf = localStorage.getItem('sensorChart.timeFrame');
      if (tf) {
        const n = Number(tf);
        const allowed = [10, 30, 60, 240, 480]; // All valid time frames
        if (allowed.includes(n)) setTimeFrame(n);
      }

      // Load sensor selection preference
      const ss = localStorage.getItem('sensorChart.selectedSensor');
      const keys = ['temperature','humidity','pressure','pm1','pm25','pm10','aqi'];
      if (ss && keys.includes(ss)) setSelectedSensor(ss as any);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Save time frame to localStorage when changed */
  useEffect(() => { try { localStorage.setItem('sensorChart.timeFrame', String(timeFrame)); } catch {} }, [timeFrame]);

  /** Save sensor selection to localStorage when changed */
  useEffect(() => { try { localStorage.setItem('sensorChart.selectedSensor', selectedSensor); } catch {} }, [selectedSensor]);

  // ========================================
  // DATA FILTERING: Points Mode vs Time Mode
  // ========================================

  // Determine if current time frame uses points-based or time-based filtering
  const currentMode = timeFrames.find(tf => tf.value === timeFrame);
  const isPointsMode = currentMode?.isPoints ?? false;

  let chartData: ChartData[];

  if (isPointsMode) {
    // ========================================
    // POINTS MODE: Show last N data points
    // ========================================
    // Simple array slicing - shows most recent N points regardless of time
    chartData = data.slice(-timeFrame);
  } else {
    // ========================================
    // TIME MODE: Show data from last N minutes
    // ========================================
    // Filters data based on time duration from the LATEST data point (not current time)
    // This ensures historical data shows correctly even if generated in the past
    if (data.length === 0) {
      chartData = [];
    } else {
      const latestTimestamp = new Date(data[data.length - 1].timestamp).getTime();
      const timeFrameMs = timeFrame * 60 * 1000; // Convert minutes to milliseconds

      chartData = data.filter(d => {
        const ts = new Date(d.timestamp).getTime();
        return (latestTimestamp - ts) <= timeFrameMs;
      });

      // Debug logging for large datasets (helps diagnose time filtering issues)
      if (data.length > 100) {
        const firstDataTs = new Date(data[0].timestamp).getTime();
        const lastDataTs = new Date(data[data.length - 1].timestamp).getTime();
        const dataSpanHours = ((lastDataTs - firstDataTs) / (1000 * 60 * 60)).toFixed(2);
        const chartSpanHours = chartData.length > 0
          ? ((new Date(chartData[chartData.length - 1].timestamp).getTime() - new Date(chartData[0].timestamp).getTime()) / (1000 * 60 * 60)).toFixed(2)
          : '0';
        console.log(`[SensorChart] Total data: ${data.length} points (${dataSpanHours}h), Filtered: ${chartData.length} points (${chartSpanHours}h), TimeFrame: ${timeFrame}min`);
      }
    }
  }

  // ========================================
  // HELPER: Get Sensor Configuration
  // ========================================

  const selectedConfig = sensorConfigs.find((c) => c.key === selectedSensor)!;

  /**
   * Returns display unit for a given sensor type
   * @param key - Sensor type key
   * @returns Unit string (°C, %, hPa, µg/m³, AQI)
   */
  const unitFor = (key: typeof selectedSensor): string => {
    switch (key) {
      case 'temperature': return '°C';
      case 'humidity': return '%';
      case 'pressure': return 'hPa';
      case 'pm1':
      case 'pm25':
      case 'pm10': return 'µg/m³';
      case 'aqi': return 'AQI';
      default: return selectedConfig?.unit || '';
    }
  };

  // ========================================
  // DATA SANITIZATION: Handle NaN/Infinity
  // ========================================

  /**
   * Sanitize data: Replace NaN/Infinity values with null to prevent chart rendering issues
   * Recharts gracefully handles null values by skipping those points
   */
  const chartDataSafe = chartData.map((d) => {
    const v = Number((d as any)[selectedSensor]);
    return Number.isFinite(v) ? d : { ...d, [selectedSensor]: null } as any;
  });

  // ========================================
  // DATA PREPARATION: Add Numeric Timestamp
  // ========================================

  /**
   * Add numeric timestamp (milliseconds) for Recharts time-scale X-axis
   * Recharts requires numeric values for continuous time scales
   */
  const chartDataPrepared = chartDataSafe.map((d) => ({
    ...d,
    ts: new Date(d.timestamp).getTime(),
  }));

  // ========================================
  // FUNCTION: Compute Optimal Y-Axis Ticks
  // ========================================

  /**
   * Computes nice-looking Y-axis tick values based on actual data range
   *
   * Algorithm:
   * 1. Find min/max values in filtered data
   * 2. Calculate rough step size for 5 ticks
   * 3. Round step to nearest "nice" value (0.5, 1, 5, 10, or multiples)
   * 4. Adjust ticks to fully contain data range
   * 5. Force non-negative domain for humidity/PM/AQI sensors
   *
   * @returns Object with tick array and Y-axis domain
   */
  const computeNiceTicks = (): { ticks: number[]; domain: [number, number] } => {
    // Extract valid numeric values for the selected sensor
    const vals = chartDataSafe
      .map((d: any) => Number((d as any)[selectedSensor]))
      .filter((v) => Number.isFinite(v));

    // Fallback for empty data
    if (vals.length === 0) {
      return { ticks: [0, 0.5, 1, 1.5, 2], domain: [0, 2] };
    }

    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const range = Math.max(0, rawMax - rawMin);

    // Target 5 ticks for readability
    const TICKS = 5;
    // Preferred step base values (0.5, 1, 5, 10)
    const BASES = [0.5, 1, 5, 10];
    const roughStep = range > 0 ? range / (TICKS - 1) : 1;

    // Find appropriate magnitude (powers of 10)
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1e-12))));

    // Generate step candidates: base values * magnitude and * magnitude * 10
    const stepCandidates = BASES.map((b) => b * magnitude)
      .concat(BASES.map((b) => b * magnitude * 10))
      .sort((a, b) => a - b);

    // Select smallest step that's >= rough step
    let step = stepCandidates.find((s) => s >= roughStep) ?? stepCandidates[stepCandidates.length - 1];

    // Force non-negative Y-axis for certain sensors (can't have negative humidity/PM/AQI)
    const forceNonNegative = selectedSensor === 'humidity' || selectedSensor === 'pm1' || selectedSensor === 'pm25' || selectedSensor === 'pm10' || selectedSensor === 'aqi';

    // Calculate initial tick range
    let endTick = Math.ceil(rawMax / step) * step;
    let startTick = endTick - step * (TICKS - 1);

    // Adjust if forcing non-negative
    if (forceNonNegative && startTick < 0) {
      startTick = 0;
      endTick = startTick + step * (TICKS - 1);
    }

    // Ensure endTick covers max value (with safety guard to prevent infinite loop)
    let guard = 0;
    while (endTick < rawMax && guard < 10) {
      // Increase step size
      const idx = stepCandidates.findIndex((s) => s === step);
      if (idx >= 0 && idx < stepCandidates.length - 1) {
        step = stepCandidates[idx + 1];
      } else {
        step *= 10;
      }
      // Recalculate ticks
      endTick = Math.ceil(rawMax / step) * step;
      startTick = endTick - step * (TICKS - 1);
      if (forceNonNegative && startTick < 0) {
        startTick = 0;
        endTick = startTick + step * (TICKS - 1);
      }
      guard++;
    }

    // Generate final tick array
    const ticks = Array.from({ length: TICKS }, (_, i) => startTick + i * step);
    return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] };
  };

  const { ticks: yTicks, domain: yDomain } = computeNiceTicks();

  // ========================================
  // RENDER: Chart UI
  // ========================================

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <CardTitle className="text-lg font-medium">Sensor Data Chart</CardTitle>
          <div className="flex flex-col space-y-2 sm:flex-row sm:gap-4 sm:space-y-0">
            {/* Sensor Type Selector */}
            <Select value={selectedSensor} onValueChange={(v) => setSelectedSensor(v as any)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sensorConfigs.map((config) => (
                  <SelectItem key={config.key} value={config.key}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Time Frame Selector */}
            <Select value={timeFrame.toString()} onValueChange={(value) => setTimeFrame(Number(value))}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeFrames.map((frame) => (
                  <SelectItem key={frame.value} value={frame.value.toString()}>
                    {frame.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataPrepared as any}>
              {/* Grid Lines */}
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />

              {/* X-Axis: Time Scale */}
              <XAxis
                dataKey="ts"                          // Numeric timestamp (milliseconds)
                type="number"                         // Numeric axis type
                scale="time"                          // Time-scale (continuous, not categorical)
                domain={["auto", "auto"]}            // Use data range, not fixed window
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => {
                  // Format as HH:MM time
                  const date = new Date(value);
                  return date.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                }}
                minTickGap={60}                       // Minimum 60px between ticks (prevents overlap)
                interval="preserveStartEnd"           // Always show first and last tick
              />

              {/* Y-Axis: Sensor Value */}
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: unitFor(selectedSensor), angle: -90, position: 'insideLeft' }}
                domain={yDomain as any}               // Computed domain from computeNiceTicks
                ticks={yTicks as any}                 // Computed tick values
                allowDecimals                         // Allow decimal values for precision
                tickFormatter={(v: any) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return '';
                  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
                }}
              />

              {/* Tooltip: Hover Information */}
              <Tooltip
                labelFormatter={(value) => `Time: ${new Date(value as number).toLocaleString('th-TH')}`}
                formatter={(value: number) => {
                  const val = Number.isFinite(value) ? (value as number).toFixed(2) : '-';
                  return [`${val} ${unitFor(selectedSensor)}`, selectedConfig?.name];
                }}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />

              {/* Data Line */}
              <Line
                type="linear"                         // Linear interpolation between points
                dataKey={selectedSensor}             // Data property to plot
                stroke={selectedConfig?.color}       // Line color
                strokeWidth={2}
                dot={false}                          // Don't show dots (too cluttered for large datasets)
                connectNulls                         // Skip gaps (null values)
                isAnimationActive={false}            // Disable animations for performance
                activeDot={{                         // Highlight dot on hover
                  r: 5,
                  stroke: selectedConfig?.color,
                  strokeWidth: 2,
                  fill: selectedConfig?.color
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
