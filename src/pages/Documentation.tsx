import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  BookOpen, 
  Code, 
  Settings, 
  Activity,
  Thermometer,
  Droplets,
  Gauge,
  Wind,
  Eye,
  Shield,
  AlertTriangle,
  Info,
  CheckCircle
} from "lucide-react";

const Documentation = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            User Documentation
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            คู่มือการใช้งานระบบมอนิเตอริ่งเซ็นเซอร์ และข้อมูลทางเทคนิค
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                ระบบมอนิเตอริ่งเซ็นเซอร์นี้ถูกพัฒนาขึ้นเพื่อติดตามสภาพแวดล้อมแบบเรียลไทม์ 
                โดยรวบรวมข้อมูลจากเซ็นเซอร์หลากหลายประเภทและแสดงผลในรูปแบบที่เข้าใจง่าย
              </p>
              
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">React + TypeScript</Badge>
                <Badge variant="secondary">Tailwind CSS</Badge>
                <Badge variant="secondary">shadcn/ui</Badge>
                <Badge variant="secondary">Recharts</Badge>
                <Badge variant="secondary">Vite</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Sensors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-green-500" />
                Supported Sensors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Thermometer className="h-5 w-5 text-red-500" />
                    <div>
                      <div className="font-medium">อุณหภูมิ (Temperature)</div>
                      <div className="text-sm text-muted-foreground">หน่วย: °C</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Droplets className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-medium">ความชื้น (Humidity)</div>
                      <div className="text-sm text-muted-foreground">หน่วย: %</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Gauge className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="font-medium">ความดันอากาศ (Pressure)</div>
                      <div className="text-sm text-muted-foreground">หน่วย: hPa</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Wind className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="font-medium">คุณภาพอากาศ (Air Quality)</div>
                      <div className="text-sm text-muted-foreground">หน่วย: AQI Index</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <div>
                      <div className="font-medium">PM1.0</div>
                      <div className="text-sm text-muted-foreground">หน่วย: µg/m³</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <div>
                      <div className="font-medium">PM2.5</div>
                      <div className="text-sm text-muted-foreground">หน่วย: µg/m³</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <div>
                      <div className="font-medium">PM10</div>
                      <div className="text-sm text-muted-foreground">หน่วย: µg/m³</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Key Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">การแสดงผลแบบเรียลไทม์</div>
                    <div className="text-sm text-muted-foreground">ข้อมูลอัปเดตทันที พร้อมแสดงผลเป็นกราฟ</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">การเลือกช่วงเวลา</div>
                    <div className="text-sm text-muted-foreground">ดูข้อมูลย้อนหลัง 1 ชั่วโมง, 6 ชั่วโมง, 12 ชั่วโมง, หรือ 24 ชั่วโมง</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">Responsive Design</div>
                    <div className="text-sm text-muted-foreground">ใช้งานได้ทั้งบนคอมพิวเตอร์และมือถือ</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <div className="font-medium">สีและธีมที่ปรับได้</div>
                    <div className="text-sm text-muted-foreground">รองรับ Dark Mode และ Light Mode</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technical Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-blue-500" />
                Technical Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2">เทคโนโลยีที่ใช้</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="p-2 bg-muted/50 rounded">React 18</div>
                    <div className="p-2 bg-muted/50 rounded">TypeScript</div>
                    <div className="p-2 bg-muted/50 rounded">Vite</div>
                    <div className="p-2 bg-muted/50 rounded">Tailwind CSS</div>
                    <div className="p-2 bg-muted/50 rounded">shadcn/ui</div>
                    <div className="p-2 bg-muted/50 rounded">Recharts</div>
                    <div className="p-2 bg-muted/50 rounded">Radix UI</div>
                    <div className="p-2 bg-muted/50 rounded">React Router</div>
                    <div className="p-2 bg-muted/50 rounded">React Query</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">การติดตั้งและรัน</h3>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1">
                    <div># ติดตั้ง dependencies</div>
                    <div>npm install</div>
                    <div className="pt-2"># รัน development server</div>
                    <div>npm run dev</div>
                    <div className="pt-2"># build สำหรับ production</div>
                    <div>npm run build</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">โครงสร้างโปรเจค</h3>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1">
                    <div>src/</div>
                    <div>├── components/          # React components</div>
                    <div>├── pages/              # Page components</div>
                    <div>├── hooks/              # Custom hooks</div>
                    <div>├── lib/                # Utility functions</div>
                    <div>└── assets/             # Static assets</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Usage Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">ข้อมูลจำลอง</div>
                    <div className="text-muted-foreground">ข้อมูลเซ็นเซอร์ที่แสดงเป็นข้อมูลจำลองเพื่อการทดสอบ</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">การปรับแต่ง</div>
                    <div className="text-muted-foreground">สามารถปรับแต่งระยะเวลาการแสดงผลได้ตามความต้องการ</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* About Us */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                About Us
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center space-y-3">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary/20 to-accent/30 rounded-full flex items-center justify-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      A
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">นักศึกษา คนที่ 1</div>
                    <div className="text-sm text-muted-foreground">รหัส: 66000001</div>
                  </div>
                </div>

                <div className="text-center space-y-3">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary/20 to-accent/30 rounded-full flex items-center justify-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      B
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">นักศึกษา คนที่ 2</div>
                    <div className="text-sm text-muted-foreground">รหัส: 66000002</div>
                  </div>
                </div>

                <div className="text-center space-y-3">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary/20 to-accent/30 rounded-full flex items-center justify-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      C
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">นักศึกษา คนที่ 3</div>
                    <div className="text-sm text-muted-foreground">รหัส: 66000003</div>
                  </div>
                </div>

                <div className="text-center space-y-3">
                  <div className="w-24 h-24 mx-auto bg-gradient-to-br from-primary/20 to-accent/30 rounded-full flex items-center justify-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      D
                    </div>
                  </div>
                  <div>
                    <div className="font-medium">นักศึกษา คนที่ 4</div>
                    <div className="text-sm text-muted-foreground">รหัส: 66000004</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Documentation;