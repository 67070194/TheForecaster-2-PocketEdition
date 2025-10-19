import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from 'react';

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

interface SensorChartProps {
  data: ChartData[];
}

const timeFrames = [
  { value: 10, label: "Last 10 points" },
  { value: 30, label: "Last 30 points" },
  { value: 60, label: "Last 1 hour" },
  { value: 240, label: "Last 4 hours" },
  { value: 480, label: "Last 8 hours" }
];

const sensorConfigs = [
  { key: 'temperature', name: 'Temperature', color: 'hsl(var(--excellent))', unit: '°C' },
  { key: 'humidity',    name: 'Humidity',    color: 'hsl(200 80% 50%)',      unit: '%' },
  { key: 'pressure',    name: 'Pressure',    color: 'hsl(var(--moderate))',  unit: 'hPa' },
  { key: 'pm1',         name: 'PM1.0',       color: 'hsl(var(--poor))',      unit: 'µg/m³' },
  { key: 'pm25',        name: 'PM2.5',       color: 'hsl(var(--hazardous))', unit: 'µg/m³' },
  { key: 'pm10',        name: 'PM10',        color: 'hsl(var(--primary))',   unit: 'µg/m³' },
  { key: 'aqi',         name: 'AQI',         color: 'hsl(320 70% 60%)',      unit: 'AQI' }
] as const;

// แสดงกราฟแบบ LineChart:
// - เลือก timeFrame (จำนวนจุด/ช่วงเวลา)
// - เลือกชนิด sensor ที่ต้องการดู
// - ใช้ computeNiceTicks เพื่อจัดระยะแกน Y ให้เหมาะสมกับข้อมูลปัจจุบัน
export const SensorChart = ({ data }: SensorChartProps) => {
  const [timeFrame, setTimeFrame] = useState(30);
  const [selectedSensor, setSelectedSensor] = useState<'temperature'|'humidity'|'pressure'|'pm1'|'pm25'|'pm10'|'aqi'>('temperature');

  // Persist selected time frame and sensor across refresh
  useEffect(() => {
    try {
      const tf = localStorage.getItem('sensorChart.timeFrame');
      if (tf) {
        const n = Number(tf);
        const allowed = [10, 30, 60, 180, 240, 480];
        if (allowed.includes(n)) setTimeFrame(n);
      }
      const ss = localStorage.getItem('sensorChart.selectedSensor');
      const keys = ['temperature','humidity','pressure','pm1','pm25','pm10','aqi'];
      if (ss && keys.includes(ss)) setSelectedSensor(ss as any);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem('sensorChart.timeFrame', String(timeFrame)); } catch {} }, [timeFrame]);
  useEffect(() => { try { localStorage.setItem('sensorChart.selectedSensor', selectedSensor); } catch {} }, [selectedSensor]);

  const chartData = data.slice(-timeFrame);
  const selectedConfig = sensorConfigs.find((c) => c.key === selectedSensor)!;
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

  // Sanitize: ป้องกัน NaN/Infinity ในกราฟด้วยการแทนเป็น null
  const chartDataSafe = chartData.map((d) => {
    const v = Number((d as any)[selectedSensor]);
    return Number.isFinite(v) ? d : { ...d, [selectedSensor]: null } as any;
  });

  // Prepare numeric timestamp for time-scale X axis
  const chartDataPrepared = chartDataSafe.map((d) => ({
    ...d,
    ts: new Date(d.timestamp).getTime(),
  }));

  // สร้างชุด tick สำหรับแกน Y จากช่วงข้อมูลจริง (min/max)
  // เลือก step ที่เหมาะสมจากฐาน [0.5, 1, 5, 10] ปรับตาม magnitude
  // และบังคับไม่ติดลบสำหรับ humidity/PM/AQI
  const computeNiceTicks = (): { ticks: number[]; domain: [number, number] } => {
    const vals = chartDataSafe
      .map((d: any) => Number((d as any)[selectedSensor]))
      .filter((v) => Number.isFinite(v));
    if (vals.length === 0) {
      return { ticks: [0, 0.5, 1, 1.5, 2], domain: [0, 2] };
    }
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const range = Math.max(0, rawMax - rawMin);

    const TICKS = 5;
    const BASES = [0.5, 1, 5, 10];
    const roughStep = range > 0 ? range / (TICKS - 1) : 1;

    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 1e-12))));
    const stepCandidates = BASES.map((b) => b * magnitude)
      .concat(BASES.map((b) => b * magnitude * 10))
      .sort((a, b) => a - b);
    let step = stepCandidates.find((s) => s >= roughStep) ?? stepCandidates[stepCandidates.length - 1];

    const forceNonNegative = selectedSensor === 'humidity' || selectedSensor === 'pm1' || selectedSensor === 'pm25' || selectedSensor === 'pm10' || selectedSensor === 'aqi';

    let endTick = Math.ceil(rawMax / step) * step;
    let startTick = endTick - step * (TICKS - 1);

    if (forceNonNegative && startTick < 0) {
      startTick = 0;
      endTick = startTick + step * (TICKS - 1);
    }

    let guard = 0;
    while (endTick < rawMax && guard < 10) {
      const idx = stepCandidates.findIndex((s) => s === step);
      if (idx >= 0 && idx < stepCandidates.length - 1) {
        step = stepCandidates[idx + 1];
      } else {
        step *= 10;
      }
      endTick = Math.ceil(rawMax / step) * step;
      startTick = endTick - step * (TICKS - 1);
      if (forceNonNegative && startTick < 0) {
        startTick = 0;
        endTick = startTick + step * (TICKS - 1);
      }
      guard++;
    }

    const ticks = Array.from({ length: TICKS }, (_, i) => startTick + i * step);
    return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] };
  };
  const { ticks: yTicks, domain: yDomain } = computeNiceTicks();

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <CardTitle className="text-lg font-medium">Sensor Data Chart</CardTitle>
          <div className="flex flex-col space-y-2 sm:flex-row sm:gap-4 sm:space-y-0">
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
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={["auto", "auto"] as any}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) =>
                  new Date(value).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                }
                minTickGap={16}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: unitFor(selectedSensor), angle: -90, position: 'insideLeft' }}
                domain={yDomain as any}
                ticks={yTicks as any}
                allowDecimals
                tickFormatter={(v: any) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return '';
                  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
                }}
              />
              <Tooltip
                labelFormatter={(value) => `Time: ${new Date(value as number).toLocaleString('th-TH')}`}
                formatter={(value: number) => {
                  const val = Number.isFinite(value) ? (value as number).toFixed(2) : '-';
                  return [`${val} ${unitFor(selectedSensor)}`, selectedConfig?.name];
                }}
                contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
              />
              <Line
                type="linear"
                dataKey={selectedSensor}
                stroke={selectedConfig?.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                activeDot={{ r: 5, stroke: selectedConfig?.color, strokeWidth: 2, fill: selectedConfig?.color }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
