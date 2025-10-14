import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { 
  Activity, 
  TrendingUp, 
  Gauge, 
  Thermometer,
  Droplets,
  Wind,
  Eye,
  Shield,
  BarChart3,
  ArrowRight
} from "lucide-react";

const Home = () => {
  const features = [
    {
      icon: <Thermometer className="h-6 w-6" />,
      title: "Temperature",
      description: "ตรวจสอบอุณหภูมิแบบเรียลไทม์"
    },
    {
      icon: <Droplets className="h-6 w-6" />,
      title: "Humidity",
      description: "วัดความชื้นในอากาศอย่างแม่นยำ"
    },
    {
      icon: <Gauge className="h-6 w-6" />,
      title: "Air Pressure",
      description: "ติดตามความดันบรรยากาศ"
    },
    {
      icon: <Wind className="h-6 w-6" />,
      title: "Air Quality",
      description: "วิเคราะห์คุณภาพอากาศและดัชนี AQI"
    },
    {
      icon: <Activity className="h-6 w-6" />,
      title: "PM Sensors",
      description: "เซ็นเซอร์วัดอนุภาคฝุ่น PM1.0, PM2.5, PM10 ครบครัน"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <Badge variant="secondary" className="mb-4">
            <Activity className="h-3 w-3 mr-1" />
            ระบบมอนิเตอริ่งเซ็นเซอร์
          </Badge>
          
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              Real-time <span className="text-primary">Sensor</span>
              <br />
              Monitoring
            </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            ระบบมอนิเตอริ่งสภาพแวดล้อมที่ครบครัน ตรวจสอบอุณหภูมิ ความชื้น คุณภาพอากาศ 
            และเซ็นเซอร์อื่นๆ ได้แบบเรียลไทม์
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Button asChild size="lg" className="text-lg">
              <Link to="/dashboard">
                เริ่มใช้งาน
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            
            <Button asChild variant="outline" size="lg" className="text-lg">
              <Link to="/docs">
                <BarChart3 className="mr-2 h-5 w-5" />
                ดูเอกสาร
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Key Features</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            ระบบมอนิเตอริ่งที่ครอบคลุมเซ็นเซอร์หลากหลายประเภท พร้อมการแสดงผลแบบกราฟิก
          </p>
        </div>

        {/* Top row - 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 max-w-5xl mx-auto">
          {features.slice(0, 3).map((feature, index) => (
            <Card key={index} className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bottom row - 2 columns centered */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {features.slice(3, 5).map((feature, index) => (
            <Card key={index + 3} className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">5</div>
              <div className="text-muted-foreground">ประเภทเซ็นเซอร์</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">24/7</div>
              <div className="text-muted-foreground">มอนิเตอริ่งตลอดเวลา</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">
                <TrendingUp className="inline h-8 w-8 mr-2" />
                แบบเรียลไทม์
              </div>
              <div className="text-muted-foreground">อัปเดตทันที</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <Card className="max-w-2xl mx-auto border-primary/20">
          <CardContent className="pt-8 pb-8">
            <h3 className="text-2xl font-bold mb-4">พร้อมเริ่มต้นแล้วหรือยัง?</h3>
            <p className="text-muted-foreground mb-6">
              เข้าสู่แดshboard เพื่อดูข้อมูลเซ็นเซอร์แบบเรียลไทม์ และติดตามสถิติต่างๆ
            </p>
            <Button asChild size="lg">
              <Link to="/dashboard">
                ดูแดชบอร์ด
                <Activity className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Home;