/**
 * Documentation Page Component
 * Comprehensive user and developer documentation for The Forecaster 2 - Pocket Edition
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CheckCircle,
  FileCode,
  Database,
  Boxes,
  Terminal,
  GitBranch,
  Wifi
} from "lucide-react";

const Documentation = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-3">
            <BookOpen className="h-8 w-8 text-primary" />
            Documentation
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Complete guide for users and developers of The Forecaster 2 IoT Environmental Monitoring System
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          {/* System Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                System Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                The Forecaster 2 - Pocket Edition is a complete end-to-end IoT solution for monitoring environmental conditions.
                It combines custom ESP32-S3 hardware with multiple sensors, a scalable backend infrastructure, and a modern web dashboard
                to provide real-time and historical environmental data visualization.
              </p>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">ESP32-S3</Badge>
                <Badge variant="secondary">React + TypeScript</Badge>
                <Badge variant="secondary">Node.js + Express</Badge>
                <Badge variant="secondary">PostgreSQL + TimescaleDB</Badge>
                <Badge variant="secondary">MQTT Protocol</Badge>
                <Badge variant="secondary">Docker</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Architecture */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-purple-500" />
                System Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">ESP32-S3 Device</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Multi-sensor hardware with OLED display, WiFi connectivity, and OTA firmware updates
                  </p>
                </div>

                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">Backend Server</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Node.js + Express API with MQTT subscription and TimescaleDB storage
                  </p>
                </div>

                <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">Web Dashboard</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    React-based UI with real-time charts, dual-mode operation, and responsive design
                  </p>
                </div>
              </div>

              <Separator />

              <div className="bg-muted/30 p-4 rounded-lg overflow-hidden">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Data Flow
                </h4>
                <div className="text-sm text-muted-foreground space-y-1 font-mono break-words overflow-x-auto">
                  <div className="whitespace-nowrap overflow-x-auto">ESP32 Sensors → MQTT Broker (HiveMQ)</div>
                  <div className="ml-8">↓</div>
                  <div className="whitespace-nowrap overflow-x-auto">Backend Server → TimescaleDB (8h retention)</div>
                  <div className="ml-8">↓</div>
                  <div className="whitespace-nowrap overflow-x-auto">REST API → React Dashboard</div>
                </div>
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
                      <div className="font-medium">Temperature (SHT31)</div>
                      <div className="text-sm text-muted-foreground">Range: 18-32°C | Unit: °C</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Droplets className="h-5 w-5 text-blue-500" />
                    <div>
                      <div className="font-medium">Humidity (SHT31)</div>
                      <div className="text-sm text-muted-foreground">Range: 40-80% | Unit: %</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Gauge className="h-5 w-5 text-purple-500" />
                    <div>
                      <div className="font-medium">Pressure (BMP280)</div>
                      <div className="text-sm text-muted-foreground">Range: 1000-1025 hPa | Unit: hPa</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Wind className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="font-medium">Air Quality Index</div>
                      <div className="text-sm text-muted-foreground">EPA Standard | Range: 0-500 AQI</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <div>
                      <div className="font-medium">PM1.0, PM2.5, PM10</div>
                      <div className="text-sm text-muted-foreground">PMS7003 Sensor | Unit: µg/m³</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Settings className="h-5 w-5 text-gray-500" />
                    <div>
                      <div className="font-medium">RTC Clock (DS3231)</div>
                      <div className="text-sm text-muted-foreground">Accurate timestamping + auto-sync</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Real-time Monitoring</div>
                      <div className="text-sm text-muted-foreground">Live MQTT updates with 5-second intervals</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Historical Data</div>
                      <div className="text-sm text-muted-foreground">8-hour retention with 1-hour chunks</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Dual Mode Operation</div>
                      <div className="text-sm text-muted-foreground">Normal (hardware) + Tester (simulation)</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">OTA Firmware Updates</div>
                      <div className="text-sm text-muted-foreground">~10 second updates via HTTP</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Interactive Charts</div>
                      <div className="text-sm text-muted-foreground">Points mode (10, 30) & time mode (1h, 4h, 8h)</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Responsive Design</div>
                      <div className="text-sm text-muted-foreground">Desktop, tablet, and mobile support</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Dark/Light Theme</div>
                      <div className="text-sm text-muted-foreground">Automatic theme switching</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <div className="font-medium">Docker Deployment</div>
                      <div className="text-sm text-muted-foreground">Full stack with health checks & backups</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Code Documentation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-blue-500" />
                Code Documentation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                All major source files include comprehensive inline documentation with JSDoc-style comments,
                architecture explanations, and data flow diagrams.
              </p>

              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="font-semibold break-all">server/index.js</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Backend entry point: MQTT subscription, REST API, AQI calculation, firmware distribution
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="font-semibold break-all">Dashboard.tsx</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Main UI component: MQTT flow, state management, dual-mode operation, OTA uploads
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Code className="h-4 w-4 text-purple-500 flex-shrink-0" />
                    <span className="font-semibold break-all">SensorChart.tsx</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Chart component: Filtering modes, adaptive Y-axis algorithm, localStorage persistence
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    <span className="font-semibold break-all">docker-compose.yml</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Docker orchestration: Service configuration, health checks, environment variables
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    <span className="font-semibold break-all">commands/*.cmd</span>
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Launch scripts: dev-start.cmd (development) and prod-start.cmd (production + tunnel)
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">For Developers</div>
                    <div className="text-muted-foreground">
                      Start with <code className="bg-muted px-1 py-0.5 rounded">server/index.js</code> for backend logic,
                      then read <code className="bg-muted px-1 py-0.5 rounded">Dashboard.tsx</code> for frontend architecture.
                      All files include section dividers and detailed comments.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Start */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-green-500" />
                Quick Start
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold mb-2">Development Mode (Port 8081)</h3>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1 overflow-x-auto">
                    <div className="whitespace-nowrap"># Windows - Start development environment</div>
                    <div className="whitespace-nowrap">commands\dev-start.cmd</div>
                    <div className="pt-2 text-muted-foreground whitespace-nowrap"># Opens Vite dev server with hot reload</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Production Mode (Port 8080)</h3>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1 overflow-x-auto">
                    <div className="whitespace-nowrap"># Windows - Start production stack + Cloudflare tunnel</div>
                    <div className="whitespace-nowrap">commands\prod-start.cmd</div>
                    <div className="pt-2 text-muted-foreground whitespace-nowrap"># Nginx production build + remote access</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-2">Manual Docker Setup</h3>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm space-y-1 overflow-x-auto">
                    <div className="whitespace-nowrap"># Clone repository</div>
                    <div className="whitespace-nowrap break-all">git clone https://github.com/67070194/TheForecaster-2-PocketEdition.git</div>
                    <div className="pt-2 whitespace-nowrap"># Create environment file</div>
                    <div className="whitespace-nowrap">cp .env.example .env</div>
                    <div className="pt-2 whitespace-nowrap"># Start Docker services</div>
                    <div className="whitespace-nowrap">docker compose up -d</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technology Stack */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-blue-500" />
                Technology Stack
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-green-500" />
                    Hardware
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-muted/50 rounded">ESP32-S3</div>
                    <div className="p-2 bg-muted/50 rounded">SHT31</div>
                    <div className="p-2 bg-muted/50 rounded">BMP280</div>
                    <div className="p-2 bg-muted/50 rounded">PMS7003</div>
                    <div className="p-2 bg-muted/50 rounded">DS3231 RTC</div>
                    <div className="p-2 bg-muted/50 rounded">SH1106 OLED</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    Backend
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-muted/50 rounded">Node.js 20.x</div>
                    <div className="p-2 bg-muted/50 rounded">Express.js</div>
                    <div className="p-2 bg-muted/50 rounded">PostgreSQL 16</div>
                    <div className="p-2 bg-muted/50 rounded">TimescaleDB</div>
                    <div className="p-2 bg-muted/50 rounded">MQTT.js</div>
                    <div className="p-2 bg-muted/50 rounded">Docker</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Eye className="h-4 w-4 text-purple-500" />
                    Frontend
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-muted/50 rounded">React 18.3</div>
                    <div className="p-2 bg-muted/50 rounded">TypeScript</div>
                    <div className="p-2 bg-muted/50 rounded">Vite</div>
                    <div className="p-2 bg-muted/50 rounded">Tailwind CSS</div>
                    <div className="p-2 bg-muted/50 rounded">shadcn/ui</div>
                    <div className="p-2 bg-muted/50 rounded">Recharts</div>
                    <div className="p-2 bg-muted/50 rounded">React Query</div>
                    <div className="p-2 bg-muted/50 rounded">React Router</div>
                    <div className="p-2 bg-muted/50 rounded">Nginx</div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-orange-500" />
                    Infrastructure
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-muted/50 rounded">GitHub Actions</div>
                    <div className="p-2 bg-muted/50 rounded">GitHub Pages</div>
                    <div className="p-2 bg-muted/50 rounded">Cloudflare Tunnel</div>
                    <div className="p-2 bg-muted/50 rounded">HiveMQ Broker</div>
                    <div className="p-2 bg-muted/50 rounded">Docker Compose</div>
                    <div className="p-2 bg-muted/50 rounded">Alpine Linux</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MQTT Topics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5 text-green-500" />
                MQTT Topics Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-green-600 dark:text-green-400 break-all">
                    TFCT_2_PE/status
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Device connection status: "online" or "offline"
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-blue-600 dark:text-blue-400 break-all">
                    TFCT_2_PE/data
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    JSON sensor readings: {"{"} ts, id, t, h, p, pm1, pm25, pm10 {"}"}
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-purple-600 dark:text-purple-400 break-all">
                    TFCT_2_PE/cmd/time
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    RTC sync command: Unix epoch timestamp
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-orange-600 dark:text-orange-400 break-all">
                    TFCT_2_PE/cmd/interval
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Update interval command: milliseconds (500-600000)
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-red-600 dark:text-red-400 break-all">
                    TFCT_2_PE/cmd/ota_now
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Firmware OTA command: HTTP/HTTPS URL to .bin file
                  </p>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                  <div className="font-mono text-sm font-semibold mb-1 text-gray-600 dark:text-gray-400 break-all">
                    TFCT_2_PE/debug
                  </div>
                  <p className="text-sm text-muted-foreground break-words">
                    Debug events: OTA status (ota_ok, ota_fail, ota_begin_fail)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* API Reference */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5 text-blue-500" />
                REST API Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">GET</Badge>
                  <code className="text-sm break-all">/health</code>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Health check endpoint - Returns: {"{"} ok, db, timestamp {"}"}
                </p>
              </div>

              <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">GET</Badge>
                  <code className="text-sm break-all">/api/latest</code>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Get most recent sensor reading
                </p>
              </div>

              <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">GET</Badge>
                  <code className="text-sm break-all">/api/readings?minutes=480</code>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Get historical readings (default: 8 hours)
                </p>
              </div>

              <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="bg-green-100 dark:bg-green-950 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">POST</Badge>
                  <code className="text-sm break-all">/fw/upload</code>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Upload firmware binary - Returns download URL
                </p>
              </div>

              <div className="bg-muted/50 p-3 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">GET</Badge>
                  <code className="text-sm break-all">/fw/f/{'<filename>'}</code>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  Download firmware binary for ESP32 OTA
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Usage Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                Usage Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Tester Mode</div>
                    <div className="text-muted-foreground">
                      Switch to Tester Mode for UI testing without hardware. Generates realistic simulated data.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Data Retention</div>
                    <div className="text-muted-foreground">
                      Historical data is retained for 8 hours with 1-hour chunks. Backup runs every 24 hours.
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium">Port Configuration</div>
                    <div className="text-muted-foreground">
                      Dev mode uses port 8081 (Vite). Production uses port 8080 (Nginx). Backend API runs on 3001.
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-500" />
                Additional Resources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="https://github.com/67070194/TheForecaster-2-PocketEdition"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <GitBranch className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">GitHub Repository</div>
                  <div className="text-sm text-muted-foreground">Source code, README, and documentation</div>
                </div>
              </a>

              <a
                href="https://github.com/67070194/TheForecaster-2-PocketEdition/blob/main/README.md"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
              >
                <FileCode className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="font-medium">Complete README</div>
                  <div className="text-sm text-muted-foreground">Installation, deployment, and troubleshooting guides</div>
                </div>
              </a>
            </CardContent>
          </Card>

          {/* Project Team */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-purple-500" />
                Project Team
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Team Member 1 */}
                <div className="text-center space-y-3">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500/20 to-purple-500/30 rounded-full flex items-center justify-center">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-muted-foreground">A</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Student Name 1</div>
                    <div className="text-sm text-muted-foreground">ID: 67000001</div>
                    <div className="text-xs text-muted-foreground mt-2">Role: Hardware & Firmware</div>
                  </div>
                </div>

                {/* Team Member 2 */}
                <div className="text-center space-y-3">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-green-500/20 to-blue-500/30 rounded-full flex items-center justify-center">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-muted-foreground">B</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Student Name 2</div>
                    <div className="text-sm text-muted-foreground">ID: 67000002</div>
                    <div className="text-xs text-muted-foreground mt-2">Role: Backend & Database</div>
                  </div>
                </div>

                {/* Team Member 3 */}
                <div className="text-center space-y-3">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-orange-500/20 to-red-500/30 rounded-full flex items-center justify-center">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-muted-foreground">C</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Student Name 3</div>
                    <div className="text-sm text-muted-foreground">ID: 67000003</div>
                    <div className="text-xs text-muted-foreground mt-2">Role: Frontend & UI/UX</div>
                  </div>
                </div>

                {/* Team Member 4 */}
                <div className="text-center space-y-3">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-purple-500/20 to-pink-500/30 rounded-full flex items-center justify-center">
                    <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-3xl font-bold text-muted-foreground">D</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Student Name 4</div>
                    <div className="text-sm text-muted-foreground">ID: 67000004</div>
                    <div className="text-xs text-muted-foreground mt-2">Role: DevOps & Documentation</div>
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
