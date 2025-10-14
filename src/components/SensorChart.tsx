import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from 'react';

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
  { value: 180, label: "Last 3 hours" },
  { value: 360, label: "Last 6 hours" }
];

const sensorConfigs = [
  { key: 'temperature', name: 'Temperature', color: 'hsl(var(--excellent))', unit: '°C' },
  { key: 'humidity', name: 'Humidity', color: 'hsl(200 80% 50%)', unit: '%' },
  { key: 'pressure', name: 'Pressure', color: 'hsl(var(--moderate))', unit: 'hPa' },
  { key: 'pm1', name: 'PM1.0', color: 'hsl(var(--poor))', unit: 'μg/m³' },
  { key: 'pm25', name: 'PM2.5', color: 'hsl(var(--hazardous))', unit: 'μg/m³' },
  { key: 'pm10', name: 'PM10', color: 'hsl(var(--primary))', unit: 'μg/m³' },
  { key: 'aqi', name: 'AQI', color: 'hsl(320 70% 60%)', unit: 'AQI' }
];

export const SensorChart = ({ data }: SensorChartProps) => {
  const [timeFrame, setTimeFrame] = useState(30);
  const [selectedSensor, setSelectedSensor] = useState('temperature');

  const chartData = data.slice(-timeFrame);
  const selectedConfig = sensorConfigs.find(config => config.key === selectedSensor);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <CardTitle className="text-lg font-medium">Sensor Data Chart</CardTitle>
          <div className="flex flex-col space-y-2 sm:flex-row sm:gap-4 sm:space-y-0">
            <Select value={selectedSensor} onValueChange={setSelectedSensor}>
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
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="timestamp" 
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => new Date(value).toLocaleTimeString('th-TH', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                label={{ 
                  value: selectedConfig?.unit || '', 
                  angle: -90, 
                  position: 'insideLeft' 
                }}
              />
              <Tooltip
                labelFormatter={(value) => `Time: ${new Date(value).toLocaleString('th-TH')}`}
                formatter={(value: number) => [
                  `${value.toFixed(1)} ${selectedConfig?.unit}`,
                  selectedConfig?.name
                ]}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <Line
                type="monotone"
                dataKey={selectedSensor}
                stroke={selectedConfig?.color}
                strokeWidth={2}
                dot={{ fill: selectedConfig?.color, strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5, stroke: selectedConfig?.color, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};