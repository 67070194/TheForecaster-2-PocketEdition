import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock } from "lucide-react";

interface UpdateSettingsProps {
  updateInterval: number;
  onUpdateIntervalChange: (interval: number) => void;
}

const updateIntervals = [
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
  { value: 15000, label: "15s" },
  { value: 30000, label: "30s" },
  { value: 60000, label: "1m" },
  { value: 180000, label: "3m" },
  { value: 300000, label: "5m" }
];

export const UpdateSettings = ({ updateInterval, onUpdateIntervalChange }: UpdateSettingsProps) => {
  return (
    <div className="flex items-center gap-3 bg-card/50 backdrop-blur-sm rounded-lg p-4 border border-border/50">
      <Clock size={16} className="text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Update every:</span>
      <Select 
        value={updateInterval.toString()} 
        onValueChange={(value) => onUpdateIntervalChange(Number(value))}
      >
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {updateIntervals.map((interval) => (
            <SelectItem key={interval.value} value={interval.value.toString()}>
              {interval.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};