import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SensorCardProps {
  title: string;
  value: number | string;
  unit: string;
  status?: 'excellent' | 'good' | 'moderate' | 'poor' | 'hazardous' | 'unavailable';
  icon: React.ReactNode;
  subtitle?: string;
}

const statusColors = {
  excellent: 'bg-excellent/10 text-excellent border-excellent/20',
  good: 'bg-good/10 text-good border-good/20',
  moderate: 'bg-moderate/10 text-moderate border-moderate/20',
  poor: 'bg-poor/10 text-poor border-poor/20',
  hazardous: 'bg-hazardous/10 text-hazardous border-hazardous/20',
  unavailable: 'bg-muted/50 text-muted-foreground border-muted'
};

const statusText = {
  excellent: 'Excellent',
  good: 'Good',
  moderate: 'Moderate',
  poor: 'Poor',
  hazardous: 'Hazardous',
  unavailable: 'N/A'
};

export const SensorCard = ({ title, value, unit, status, icon, subtitle }: SensorCardProps) => {
  return (
    <Card className="group transition-all duration-300 hover:shadow-lg hover:-translate-y-1 bg-gradient-to-br from-card to-accent/30 border-border/50">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-accent/50 text-muted-foreground">
              {icon}
            </div>
            <div>
              <h3 className="font-medium text-foreground/80 text-sm">{title}</h3>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          {status && (
            <Badge variant="outline" className={`text-xs ${statusColors[status]}`}>
              {statusText[status]}
            </Badge>
          )}
        </div>
        
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light text-foreground group-hover:text-primary transition-colors">
              {value}
            </span>
            <span className="text-sm text-muted-foreground font-medium">
              {unit}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};