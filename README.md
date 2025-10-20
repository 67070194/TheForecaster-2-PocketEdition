# The Forecaster 2 - Pocket Edition

An IoT Environmental Monitoring System for real-time air quality and environmental parameter tracking using ESP32-S3 microcontroller, Node.js backend, and React dashboard.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-ESP32--S3-orange.svg)
![Node](https://img.shields.io/badge/node-20.x-green.svg)
![React](https://img.shields.io/badge/react-18.3.1-blue.svg)

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Core Principles](#core-principles)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Deployment Options](#deployment-options)
  - [Option 1: Full Docker Stack (LAN/Local)](#option-1-full-docker-stack-lanlocal)
  - [Option 2: GitHub Pages Frontend + Cloudflare Tunnel](#option-2-github-pages-frontend--cloudflare-tunnel)
- [Configuration](#configuration)
- [Hardware Setup](#hardware-setup)
- [Usage](#usage)
- [API Reference](#api-reference)
- [MQTT Topics](#mqtt-topics)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

**The Forecaster 2 - Pocket Edition** is a complete end-to-end IoT solution for monitoring environmental conditions. It combines custom ESP32-S3 hardware with multiple sensors, a scalable backend infrastructure, and a modern web dashboard to provide real-time and historical environmental data visualization.

### What It Does

- Measures temperature, humidity, atmospheric pressure, and particulate matter (PM1, PM2.5, PM10)
- Calculates Air Quality Index (AQI) using EPA standards
- Displays data on an integrated OLED screen with 7 display modes
- Publishes sensor readings via MQTT to cloud broker
- Stores time-series data in TimescaleDB with 8-hour retention
- Visualizes real-time and historical data in a responsive web dashboard
- Supports Over-The-Air (OTA) firmware updates via HTTP
- Provides device control through MQTT commands (RTC sync, sampling interval adjustment)

---

## Key Features

### Hardware Features
- **Multi-Sensor Integration**: SHT31 (temp/humidity), BMP280 (pressure), PMS7003 (particulate matter)
- **Local Display**: 128×64 OLED screen with 7 selectable display modes
- **Status Indicators**: RGB LED indicating AQI levels (Green/Yellow/Red)
- **WiFi Configuration**: Captive portal for easy WiFi setup (5-minute AP mode)
- **Battery Monitoring**: ADC-based voltage monitoring with auto-shutdown at low voltage
- **Real-Time Clock**: DS3231 RTC for accurate timestamping
- **OTA Updates**: ~10 second firmware updates via HTTP

### Software Features
- **Real-Time Dashboard**: React-based UI with live MQTT subscriptions
- **Time-Series Database**: TimescaleDB with automatic 8-hour retention and 1-hour chunks
- **RESTful API**: Express.js server for historical data queries
- **MQTT Communication**: HiveMQ public broker for device-to-cloud messaging
- **Device Management**: Automatic device registration by MAC address
- **Firmware Distribution**: Built-in firmware hosting and distribution system
- **Docker Containerization**: Full stack orchestration with health checks
- **CI/CD Pipeline**: Automated GitHub Pages deployment

---

## System Architecture

```
┌─────────────────────┐
│   ESP32-S3 Device   │
│  ┌───────────────┐  │
│  │ Sensors       │  │
│  │ - SHT31       │  │
│  │ - BMP280      │  │
│  │ - PMS7003     │  │
│  │ - RTC DS3231  │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │ MQTT Client   │  │
│  │ (PubSubClient)│  │
│  └───────┬───────┘  │
└──────────┼──────────┘
           │
           │ MQTT over WiFi
           ▼
   ┌───────────────────┐
   │  HiveMQ Public    │
   │  MQTT Broker      │
   │ (broker.hivemq.   │
   │     com:1883)     │
   └───────┬───────────┘
           │
      ┌────┴────┐
      │         │
      ▼         ▼
┌──────────┐  ┌──────────────────┐
│ Node.js  │  │ React Web        │
│ Server   │  │ Dashboard        │
│          │  │                  │
│ - MQTT   │  │ - MQTT Sub       │
│   Ingest │  │ - REST API       │
│ - REST   │  │   Queries        │
│   API    │  │ - Real-Time      │
│ - FW     │  │   Charts         │
│   Upload │  │ - Device Control │
└────┬─────┘  └──────────────────┘
     │
     ▼
┌──────────────────┐
│  TimescaleDB     │
│  (PostgreSQL 16) │
│                  │
│ - readings table │
│ - devices table  │
│ - 8h retention   │
│ - 1h chunks      │
└──────────────────┘
```

### Data Flow

1. **Sensor Reading**: ESP32 reads sensors every ~1-5 seconds (configurable)
2. **MQTT Publish**: Device publishes JSON payload to `TFCT_2_PE/data/<mac>`
3. **Server Ingest**: Node.js server subscribes and throttles inserts (5s default)
4. **Database Storage**: Readings inserted into TimescaleDB hypertable
5. **Web Display**: Dashboard receives same MQTT message for real-time updates
6. **Historical Queries**: Dashboard fetches time-range data via REST API

---

## Core Principles

### 1. **Separation of Concerns**
- **Hardware Layer**: ESP32 handles sensor readings and local display
- **Transport Layer**: MQTT provides decoupled pub/sub messaging
- **Storage Layer**: TimescaleDB optimizes time-series data with automatic retention
- **API Layer**: Node.js serves as REST gateway to database
- **Presentation Layer**: React dashboard consumes MQTT + REST API

### 2. **Real-Time First**
- MQTT subscriptions provide instant sensor updates
- WebSocket-based MQTT in browser for sub-second latency
- Historical data supplements live stream for trend analysis

### 3. **IoT Best Practices**
- **Last Will & Testament**: Device publishes "offline" on disconnect
- **Retained Messages**: Status and config persist on broker
- **QoS Levels**: QoS 0 for sensor data (performance), QoS 1 for commands (reliability)
- **Device Scoping**: Per-device command topics (`/cmd/<id>/...`)
- **Presence Detection**: Web dashboard announces online/offline status

### 4. **Scalability & Efficiency**
- **TimescaleDB Hypertables**: Automatic time-based partitioning
- **Retention Policies**: Auto-delete data older than 8 hours
- **Throttled Ingest**: Server aligns database inserts with UI refresh rate
- **Containerization**: Docker Compose for horizontal scaling readiness

### 5. **Developer Experience**
- **Hot Reload**: Vite dev server with HMR for rapid frontend iteration
- **Node --watch**: Auto-restart server on code changes
- **Docker Health Checks**: Automatic service recovery
- **Unified Configuration**: Single `.env` file for all services
- **AP Portal**: Zero-configuration WiFi setup for end users

---

## Technology Stack

### Microcontroller
- **MCU**: ESP32-S3 (Xtensa dual-core 240MHz, WiFi 802.11b/g/n)
- **IDE**: Arduino IDE 2.x with Espressif ESP32 core
- **Libraries**:
  - `Adafruit SHT31` (temp/humidity sensor)
  - `Adafruit BMP280` (pressure sensor)
  - `Adafruit GFX` + `Adafruit SH110X` (OLED display)
  - `RTClib` (DS3231 real-time clock)
  - `PubSubClient` (MQTT client)
  - Built-in: `WiFi`, `Preferences`, `DNSServer`, `HTTPClient`, `Update`

### Backend
- **Runtime**: Node.js 20 (Alpine Linux)
- **Framework**: Express.js 4.19
- **Database**: TimescaleDB (PostgreSQL 16 with TimescaleDB extension)
- **MQTT**: MQTT.js 5.5 (WebSocket & TCP support)
- **Database Driver**: pg 8.11 (PostgreSQL client)

### Frontend
- **Framework**: React 18.3.1 with TypeScript 5.8
- **Build Tool**: Vite 7.1.10
- **Routing**: React Router DOM 6.30
- **UI Library**: shadcn/ui (Radix UI primitives + Tailwind)
- **Styling**: Tailwind CSS 3.4.17
- **Charts**: Recharts 2.15.4
- **State Management**: TanStack React Query 5.83
- **MQTT Client**: MQTT.js 5.14.1 (browser WebSocket)
- **Icons**: Lucide React

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Frontend Hosting**: GitHub Pages
- **Tunnel**: Cloudflare Tunnel (for GitHub Pages deployment)
- **MQTT Broker**: HiveMQ Public Cloud Broker

---

## Prerequisites

### For Full Docker Deployment
- **Docker Desktop** (Windows/Mac) or **Docker + Docker Compose** (Linux)
- **Git** (to clone repository)
- **Port Availability**: 3001 (API), 8080 (Web), 5432 (DB)

### For GitHub Pages Deployment
- **GitHub Account** with repository access
- **Cloudflare Account** (for Cloudflare Tunnel)
- **Linux/Windows Server** or local machine to run backend + tunnel
- **Docker** (recommended) or Node.js 20+ and PostgreSQL/TimescaleDB

### For Firmware Development
- **Arduino IDE 2.x**
- **ESP32-S3 Dev Board**
- **USB Cable** (USB-C for most ESP32-S3 boards)
- **Sensors**: SHT31, BMP280, PMS7003, DS3231, SH1106 OLED

---

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/TheForecaster-2-PocketEdition.git
cd TheForecaster-2-PocketEdition
```

### 2. Create Configuration File

```bash
# Windows Command Prompt
copy .env.example .env

# Linux/Mac/Git Bash
cp .env.example .env
```

### 3. Edit Configuration (Optional)

Open `.env` and customize settings:

```env
# MQTT Configuration (default uses HiveMQ public broker)
MQTT_URL=wss://broker.hivemq.com:8884/mqtt
BASE_TOPIC=TFCT_2_PE

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@db:5432/iotdb
POSTGRES_PASSWORD=postgres

# Server Configuration
SERVER_PORT=3001
SAMPLE_INTERVAL_MS=5000

# Backup Configuration
BACKUP_INTERVAL_SECONDS=86400
```

---

## Deployment Options

### Option 1: Full Docker Stack (LAN/Local)

This deployment runs the entire stack (database, server, web frontend) on a single machine using Docker Compose. Ideal for:
- Local development
- LAN-only deployments
- Air-gapped environments
- Testing and prototyping

#### Quick Start

```bash
# Windows
docker-start.cmd

# Linux/Mac
docker compose up -d
```

#### Step-by-Step

1. **Ensure Docker is Running**
   - Start Docker Desktop (Windows/Mac)
   - Verify with `docker --version`

2. **Start Services**
   ```bash
   docker compose up -d
   ```

3. **Wait for Services to Initialize** (30-60 seconds)
   ```bash
   docker compose logs -f server
   # Wait for: "MQTT client connected" and "Server listening on port 3001"
   ```

4. **Access Web Dashboard**
   - Local: `http://localhost:8080`
   - LAN: `http://<YOUR_IP>:8080` (e.g., `http://192.168.1.100:8080`)
   - To find your IP:
     ```bash
     # Windows
     ipconfig

     # Linux/Mac
     ifconfig
     ```

5. **Verify Services**
   - API Health: `http://localhost:3001/health`
   - Database: `docker compose exec db psql -U postgres -d iotdb -c "SELECT COUNT(*) FROM readings;"`

#### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Web Frontend | 8080 | React dashboard (Vite dev server) |
| API Server | 3001 | REST API & firmware hosting |
| Database | 5432 | TimescaleDB (internal only) |

#### Management Commands

```bash
# View logs
docker compose logs -f server   # Server logs
docker compose logs -f web      # Frontend logs
docker compose logs -f db       # Database logs

# Stop services
docker compose down

# Stop and remove volumes (DELETE ALL DATA)
docker compose down -v

# Restart single service
docker compose restart server

# View service status
docker compose ps
```

#### Folder Structure

```
TheForecaster-2-PocketEdition/
├── docker-compose.yml      ← Main orchestration file
├── .env                    ← Configuration file (create from .env.example)
├── server/                 ← Node.js API server
│   ├── Dockerfile
│   └── index.js
├── website/                ← React frontend
│   └── src/
├── db/                     ← Database initialization
│   └── init/
│       └── 01_init.sql
└── volumes/                ← Created by Docker
    ├── timescale-data/     ← Database persistence
    └── backups/            ← Database backups
```

#### Advantages
✅ Zero configuration networking (Docker internal DNS)
✅ Automatic service dependency management
✅ Built-in health checks and auto-restart
✅ Database backups to `backups/` volume
✅ Full control over all components
✅ No external dependencies or cloud services

#### Disadvantages
❌ Requires machine to stay running 24/7
❌ Only accessible within LAN (unless port forwarding configured)
❌ No HTTPS (requires reverse proxy like nginx/Caddy)
❌ All components on single machine (no horizontal scaling)

---

### Option 2: GitHub Pages Frontend + Cloudflare Tunnel

This deployment separates the frontend (GitHub Pages) from the backend (self-hosted server + database), with Cloudflare Tunnel providing secure HTTPS access. Ideal for:
- Public-facing deployments
- Remote device access
- Free frontend hosting
- HTTPS without manual certificate management

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Pages                         │
│  https://yourusername.github.io/TheForecaster-2-PE/     │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │  React App (Static Files)                      │     │
│  │  - index.html, bundle.js, assets/              │     │
│  │  - VITE_API_BASE = tunnel URL                  │     │
│  │  - VITE_FW_BASE = tunnel URL                   │     │
│  └────────────────────────────────────────────────┘     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ HTTPS Requests
                       │ (GET /api/*, POST /fw/upload)
                       ▼
        ┌──────────────────────────────────────────┐
        │   Cloudflare Tunnel                      │
        │   https://your-tunnel.trycloudflare.com  │
        │   (or custom domain)                     │
        └──────────────┬───────────────────────────┘
                       │
                       │ Proxied to localhost
                       ▼
┌──────────────────────────────────────────────────────────┐
│          Your Server (Linux/Windows/Mac)                 │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  Docker Compose Stack (server + db + backup)    │     │
│  │                                                 │     │
│  │  ┌──────────────┐      ┌──────────────────┐     │     │
│  │  │ Node.js      │      │  TimescaleDB     │     │     │
│  │  │ Server       │◄─────┤  (PostgreSQL)    │     │     │
│  │  │              │      │                  │     │     │
│  │  │ - MQTT Sub   │      │ - readings       │     │     │
│  │  │ - REST API   │      │ - devices        │     │     │
│  │  │ - FW Upload  │      │ - 8h retention   │     │     │
│  │  └──────────────┘      └──────────────────┘     │     │
│  │                                                 │     │
│  │  Port 3001 → Cloudflare Tunnel                  │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐     │
│  │  Cloudflare Tunnel Agent (cloudflared)          │     │
│  │  - Listens on localhost:3001                    │     │
│  │  - Forwards to Cloudflare Edge                  │     │
│  └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

#### Prerequisites

1. **GitHub Repository** with GitHub Pages enabled
2. **Cloudflare Account** (free tier is sufficient)
3. **Server/Machine** to run backend (can be same LAN machine, cloud VM, or home server)

#### Step 1: Setup Backend Server

1. **Clone Repository on Server**
   ```bash
   git clone https://github.com/yourusername/TheForecaster-2-PocketEdition.git
   cd TheForecaster-2-PocketEdition
   ```

2. **Create `.env` File**
   ```bash
   cp .env.example .env
   # Edit .env if needed (defaults work fine)
   ```

3. **Start Backend Services**
   ```bash
   # Start only server + database (exclude web frontend)
   docker compose up -d db server backup
   ```

4. **Verify Backend Health**
   ```bash
   curl http://localhost:3001/health
   # Should return: {"db":"online","server":"running"}
   ```

#### Step 2: Setup Cloudflare Tunnel

##### Option A: Quick Tunnel (No Account Required)

```bash
# Install cloudflared
# Windows: Download from https://github.com/cloudflare/cloudflared/releases
# Linux:
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared

# Start quick tunnel
cloudflared tunnel --url http://localhost:3001
```

This will output a URL like: `https://random-name-1234.trycloudflare.com`

**Note**: Quick tunnel URLs change every time you restart. For production, use a named tunnel (Option B).

##### Option B: Named Tunnel (Persistent URL)

1. **Login to Cloudflare**
   ```bash
   cloudflared tunnel login
   ```

2. **Create Tunnel**
   ```bash
   cloudflared tunnel create forecaster-2-pe
   # Save the Tunnel ID shown
   ```

3. **Create Config File** `~/.cloudflared/config.yml`
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: /home/yourusername/.cloudflared/<TUNNEL_ID>.json

   ingress:
     - hostname: forecaster-api.yourdomain.com  # Optional custom domain
       service: http://localhost:3001
     - service: http_status:404
   ```

4. **Route DNS** (if using custom domain)
   ```bash
   cloudflared tunnel route dns forecaster-2-pe forecaster-api.yourdomain.com
   ```

5. **Run Tunnel**
   ```bash
   cloudflared tunnel run forecaster-2-pe
   ```

6. **Run as Service** (Optional)
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   ```

#### Step 3: Configure GitHub Pages

1. **Set Repository Variables** ⚠️ **IMPORTANT**

   GitHub Actions needs these variables to build the website with the correct API endpoint.

   **Steps**:
   - Navigate to your repository on GitHub
   - Go to: `Settings → Secrets and variables → Actions → Variables`
   - Click **"New repository variable"**
   - Add these two variables:

   | Name | Value Example | Description |
   |------|---------------|-------------|
   | `VITE_API_BASE` | `https://tfct_2_api.hcn.in.net` | Your Cloudflare tunnel URL or custom domain |
   | `VITE_FW_BASE` | `https://tfct_2_api.hcn.in.net` | Firmware endpoint (usually same as API_BASE) |

   **Why this is needed**:
   - The website is built as **static files** during GitHub Actions
   - API URLs must be **embedded at build time** (not runtime)
   - Without these variables, website cannot connect to backend
   - You'll see **"Database: Offline"** if missing or incorrect

2. **Enable GitHub Pages**
   - Go to: `Settings → Pages`
   - Source: `Deploy from a branch`
   - Branch: `gh-pages`
   - Folder: `/` (root)

3. **Trigger Deployment**
   ```bash
   # Push to main branch triggers GitHub Action
   git add .
   git commit -m "Configure API endpoint"
   git push origin main
   ```

4. **Wait for Deployment** (2-3 minutes)
   - Check: `Actions` tab for workflow status
   - Site will be available at: `https://yourusername.github.io/TheForecaster-2-PocketEdition/`

#### Step 4: Test End-to-End

1. **Open Dashboard**
   - Navigate to: `https://yourusername.github.io/TheForecaster-2-PocketEdition/`

2. **Check Database Connection**
   - Should show "Database: Online" in status indicators

3. **Verify MQTT Connection**
   - Dashboard should show "ESP32: Connecting..." or "Connected"

4. **Test Firmware Upload**
   - Upload a test `.bin` file in "Update Settings" panel
   - Should return a URL starting with your tunnel domain

#### Advantages
✅ Free frontend hosting (GitHub Pages)
✅ Automatic HTTPS with valid certificates
✅ Global CDN for frontend (fast worldwide access)
✅ No port forwarding or firewall configuration needed
✅ Backend remains private on LAN
✅ Automatic CI/CD with GitHub Actions
✅ Can use custom domain for API (via Cloudflare)

#### Disadvantages
❌ Requires two separate services to run (backend + tunnel)
❌ Tunnel URL changes if using quick tunnel (use named tunnel for production)
❌ Cloudflare Tunnel requires persistent connection
❌ Free Cloudflare Tunnel limits bandwidth (100GB/month)
❌ More complex debugging (need to check GitHub Actions logs)

#### Helper Scripts for Windows

Create `start-tunnel.cmd`:
```cmd
@echo off
echo Starting Cloudflare Tunnel...
cloudflared tunnel --url http://localhost:3001
pause
```

Create `start-all.cmd`:
```cmd
@echo off
echo Starting Docker stack...
docker compose up -d db server backup

timeout /t 10

echo Starting Cloudflare Tunnel...
start cmd /k cloudflared tunnel --url http://localhost:3001

echo Opening dashboard...
timeout /t 5
start https://yourusername.github.io/TheForecaster-2-PocketEdition/
```

---

## Configuration

### Environment Variables

Complete `.env` reference:

```env
# ============================================
#  MQTT Configuration
# ============================================
# MQTT broker URL (WebSocket for browser compatibility)
MQTT_URL=wss://broker.hivemq.com:8884/mqtt

# Optional MQTT authentication
MQTT_USERNAME=
MQTT_PASSWORD=

# Base topic prefix for all device communication
BASE_TOPIC=TFCT_2_PE

# ============================================
#  Database Configuration
# ============================================
# TimescaleDB connection string
DATABASE_URL=postgresql://postgres:postgres@db:5432/iotdb

# PostgreSQL credentials (used by db service and backup)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=iotdb

# ============================================
#  Server Configuration
# ============================================
# HTTP server port
SERVER_PORT=3001

# Minimum interval (ms) between database inserts (throttle)
SAMPLE_INTERVAL_MS=5000

# Directory for uploaded firmware files
UPLOADS_DIR=/app/uploads

# Directory for static files (if serving frontend from server)
STATIC_DIR=/app/public

# ============================================
#  Backup Configuration
# ============================================
# Database backup interval in seconds (default: 86400 = 24 hours)
BACKUP_INTERVAL_SECONDS=86400
```

### Runtime Configuration (Web Dashboard)

The dashboard supports runtime configuration via URL query parameters:

```
# Override API base URL
https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=https://custom-api.example.com

# Override firmware base URL
https://yourusername.github.io/TheForecaster-2-PocketEdition/?fw=https://custom-fw.example.com

# Override both
https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=...&fw=...

# Clear saved configuration
https://yourusername.github.io/TheForecaster-2-PocketEdition/?api=clear
```

Priority order:
1. URL query parameters (`?api=...`)
2. localStorage (persisted from previous query params)
3. Build-time environment variables (`VITE_API_BASE`)

---

## Hardware Setup

### Required Components

| Component | Quantity | Interface | Purpose |
|-----------|----------|-----------|---------|
| ESP32-S3 Dev Board | 1 | - | Main microcontroller |
| SHT31 | 1 | I2C (0x44) | Temperature & Humidity |
| BMP280 | 1 | I2C (0x76/0x77) | Atmospheric Pressure |
| PMS7003 | 1 | UART | Particulate Matter (PM1/2.5/10) |
| DS3231 | 1 | I2C | Real-Time Clock |
| SH1106 OLED (128×64) | 1 | I2C (0x3C) | Display |
| LED (RGB or 3x single) | 3 | GPIO 10, 11, 12 | Status indicators |
| Push Button | 1 | GPIO 5 (pull-up) | Wake/Config trigger |
| Battery (LiPo 3.7V) | 1 | - | Power source |
| Resistors & Wiring | - | - | Circuit construction |

### Wiring Diagram

```
ESP32-S3 Pin Configuration:

I2C Bus (SDA=8, SCL=9):
├─ SHT31      (0x44)
├─ BMP280     (0x76 or 0x77)
├─ DS3231     (0x68)
└─ SH1106 OLED(0x3C)

UART1 (RX=17, TX=18):
└─ PMS7003 (5V logic level)

GPIO:
├─ LED_GREEN  (10)  ── 220Ω ── LED ── GND
├─ LED_YELLOW (11)  ── 220Ω ── LED ── GND
├─ LED_RED    (12)  ── 220Ω ── LED ── GND
└─ BTN_WAKE   (5)   ── Button ── GND (internal pull-up enabled)

ADC:
└─ PIN_VBAT   (4)   ── Voltage divider (÷5) from battery
```

### Firmware Upload

1. **Install Arduino IDE 2.x**
   - Download from: https://www.arduino.cc/en/software

2. **Install ESP32 Board Support**
   - File → Preferences → Additional Board Manager URLs:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Tools → Board → Boards Manager → Search "esp32" → Install

3. **Install Required Libraries**
   - Tools → Manage Libraries → Search and install:
     - Adafruit SHT31
     - Adafruit BMP280
     - Adafruit GFX Library
     - Adafruit SH110X
     - RTClib (by Adafruit)
     - PubSubClient

4. **Configure Board**
   - Tools → Board → esp32 → ESP32S3 Dev Module
   - Tools → USB CDC On Boot → Enabled
   - Tools → Upload Speed → 921600
   - Tools → Port → (select your COM port)

5. **Open and Upload**
   - Open `microcontroller/ESP32-S3_CODE.ino`
   - Click "Upload" button
   - Wait for "Done uploading" message

6. **Serial Monitor**
   - Tools → Serial Monitor
   - Baud Rate: 115200
   - View debug messages and WiFi setup instructions

### WiFi Configuration

1. **Trigger AP Portal**
   - Press and hold button for 5 seconds
   - Device creates AP: `TFCT_2_PE-XXXX` (XXXX = last 4 MAC chars)

2. **Connect to AP**
   - Use phone/laptop to connect to `TFCT_2_PE-XXXX`
   - Captive portal should open automatically

3. **Enter WiFi Credentials**
   - Select your WiFi network from dropdown
   - Enter password
   - Click "Save"
   - Device reboots and connects to WiFi

4. **Verify Connection**
   - OLED should show WiFi icon and IP address
   - Serial monitor shows: "WiFi connected, IP: xxx.xxx.xxx.xxx"

---

## Usage

### Dashboard Overview

#### Main Dashboard (`/dashboard`)

**Top Status Bar**:
- **ESP32 Status**: Connected / Disconnected / Connecting
- **Database Status**: Online / Offline / Checking
- **Last Update**: Timestamp of latest sensor reading

**Sensor Cards** (6 cards):
1. **AQI** (Air Quality Index): 0-500 with color coding
   - Green (0-50): Good
   - Yellow (51-100): Moderate
   - Orange (101-150): Unhealthy for Sensitive Groups
   - Red (151+): Unhealthy
2. **Temperature**: °C or °F
3. **Humidity**: Percentage
4. **Pressure**: hPa (hectopascals)
5. **PM2.5**: µg/m³
6. **PM10**: µg/m³

**Historical Chart**:
- X-axis: Time (last 8 hours)
- Y-axis: Sensor value
- Toggle metrics: Click legend items to show/hide
- Auto-refresh every 5 seconds
- Max 1000 data points

**Update Settings Panel**:
- **Sync RTC**: Send current browser time to device RTC
- **Sampling Interval**: Adjust device reading interval (500ms - 600s)
- **Firmware Update**: Upload `.bin` file for OTA

#### Tester Mode

Simulated sensor data with realistic random variations. Useful for:
- Testing UI without hardware
- Demonstrating dashboard features
- Frontend development
- Database testing with historical data

**Features**:
- **Real-time simulation**: Generates live data with realistic value transitions
- **Database simulation**: Populate 8 hours of test data with one click
- **Randomized intervals**: Data points generated at variable intervals (±50% of update setting)
- **Independent charts**: Switching modes completely resets charts (no overlapping timestamps)

**Database Simulation Button**:
Located next to "Update every" settings in Tester Mode:
1. Enable **Tester Mode** toggle
2. Click **"Simulate 8h DB Data"** button
3. System generates ~3,000-5,000 data points covering 8 hours
4. Data inserted in batches of 100 for performance
5. Progress notifications at 20%, 40%, 60%, 80%, 100%
6. Chart automatically reloads with full 8-hour history

**Requirements for database simulation**:
- Tester Mode must be ON
- Database status must be "Online"
- Backend must be running with `/api/readings/bulk` endpoint

### Device Control via MQTT

#### RTC Sync
```javascript
// Dashboard automatically syncs on first data reception
// Manual sync via "Sync RTC" button publishes:
Topic: TFCT_2_PE/cmd/time
Payload: 1698765432  // Epoch timestamp (seconds)
```

#### Sampling Interval
```javascript
// Valid range: 500 - 600000 ms
Topic: TFCT_2_PE/cmd/interval
Payload: 5000  // 5 seconds
```

#### OTA Firmware Update
```javascript
// Dashboard uploads .bin → receives URL → publishes:
Topic: TFCT_2_PE/cmd/ota_now
Payload: http://192.168.1.100:3001/fw/f/firmware_1698765432.bin

// Device-specific:
Topic: TFCT_2_PE/cmd/TFCT_2_PE-1a2b3c4d5e6f/ota_now
Payload: <same URL>
```

### OLED Display Modes

Press button briefly to cycle through 7 modes:

1. **AQI Screen**: Large AQI number with status text
2. **Temperature**: Current temperature with trend
3. **Humidity**: Current humidity with trend
4. **Pressure**: Atmospheric pressure
5. **PM2.5**: Particulate matter 2.5µm
6. **PM10**: Particulate matter 10µm
7. **All Sensors**: Compact view of all readings

---

## API Reference

Base URL: `http://localhost:3001` (or your tunnel URL)

### Health Check

```http
GET /health
```

**Response**:
```json
{
  "db": "online",
  "server": "running"
}
```

### Get Latest Reading

```http
GET /api/latest?mac=TFCT_2_PE-1a2b3c4d5e6f
```

**Query Parameters**:
- `mac` (optional): Device MAC address (defaults to first available device)

**Response**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "device_id": "789e4567-e89b-12d3-a456-426614174000",
  "ts": "2023-10-31T12:34:56.789Z",
  "t": 27.35,
  "h": 61.20,
  "p": 1012.45,
  "pm1": 5,
  "pm25": 12,
  "pm10": 18,
  "aqi": 42
}
```

### Get Historical Readings

```http
GET /api/readings?minutes=60&mac=TFCT_2_PE-1a2b3c4d5e6f
```

**Query Parameters**:
- `minutes` (optional): Number of minutes to look back (default: 480, max: 480)
- `mac` (optional): Device MAC address
- `from` (optional): ISO 8601 start datetime (alternative to `minutes`)
- `to` (optional): ISO 8601 end datetime (alternative to `minutes`)

**Response**:
```json
[
  {
    "ts": "2023-10-31T12:00:00.000Z",
    "t": 26.8,
    "h": 60.5,
    "p": 1012.1,
    "pm1": 4,
    "pm25": 10,
    "pm10": 15,
    "aqi": 38
  },
  ...
]
```

### Upload Firmware

```http
POST /fw/upload
Content-Type: multipart/form-data
```

**Request Body**:
```
------WebKitFormBoundary
Content-Disposition: form-data; name="firmware"; filename="firmware.bin"
Content-Type: application/octet-stream

<binary data>
------WebKitFormBoundary--
```

**Response**:
```json
{
  "message": "Firmware uploaded",
  "filename": "firmware_1698765432.bin",
  "url": "http://192.168.1.100:3001/fw/f/firmware_1698765432.bin"
}
```

### Download Firmware

```http
GET /fw/f/:filename
```

**Response**: Binary `.bin` file with headers:
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="firmware.bin"
```

### Publish Web Configuration

```http
POST /web/config
Content-Type: application/json
```

**Request Body**:
```json
{
  "apiBase": "https://api.example.com",
  "fwBase": "https://fw.example.com"
}
```

**Response**:
```json
{
  "message": "Config published"
}
```

---

## MQTT Topics

Base topic: `TFCT_2_PE`

### Device → Server/Dashboard

| Topic | QoS | Retained | Payload | Purpose |
|-------|-----|----------|---------|---------|
| `TFCT_2_PE/status` | 1 | Yes | `online`/`offline` | Device Last Will & Testament |
| `TFCT_2_PE/data` | 0 | No | JSON | Sensor readings (generic) |
| `TFCT_2_PE/data/<mac>` | 0 | No | JSON | Sensor readings (device-specific) |
| `TFCT_2_PE/debug` | 0 | No | JSON | Debug messages (OTA status, errors) |

**Sensor Data Payload**:
```json
{
  "id": "TFCT_2_PE-1a2b3c4d5e6f",
  "fw": "1.0.0",
  "aqi": 42,
  "t": 27.35,
  "h": 61.20,
  "p": 1012.45,
  "vbat": 3.9,
  "pm1": 5,
  "pm25": 12,
  "pm10": 18
}
```

### Dashboard → Server/Device

| Topic | QoS | Retained | Payload | Purpose |
|-------|-----|----------|---------|---------|
| `TFCT_2_PE/web/status` | 1 | Yes | `online`/`offline` | Dashboard presence |
| `TFCT_2_PE/web/req_config` | 0 | No | (empty) | Request config re-publish |

### Server/Dashboard → Device

| Topic | QoS | Retained | Payload | Purpose |
|-------|-----|----------|---------|---------|
| `TFCT_2_PE/cmd/time` | 1 | No | Epoch seconds | Sync RTC |
| `TFCT_2_PE/cmd/interval` | 1 | No | Integer (ms) | Set sampling interval |
| `TFCT_2_PE/cmd/ota_url` | 1 | No | URL string | Store OTA URL |
| `TFCT_2_PE/cmd/ota_now` | 1 | No | URL string | Trigger OTA update |
| `TFCT_2_PE/cmd/<mac>/ota_url` | 1 | No | URL string | Device-specific OTA URL |
| `TFCT_2_PE/cmd/<mac>/ota_now` | 1 | No | URL string | Device-specific OTA trigger |

### Server → Dashboard

| Topic | QoS | Retained | Payload | Purpose |
|-------|-----|----------|---------|---------|
| `TFCT_2_PE/web/config` | 1 | Yes | JSON | API/FW base URLs |

**Config Payload**:
```json
{
  "apiBase": "https://api.example.com",
  "fwBase": "https://fw.example.com"
}
```

---

## Development

### Local Development (Without Docker)

#### Terminal 1: Database

```bash
# Install TimescaleDB locally or use Docker
docker run -d --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=iotdb \
  -v ./db/init:/docker-entrypoint-initdb.d \
  timescale/timescaledb:latest-pg16
```

#### Terminal 2: Server

```bash
cd server
npm install

# Create .env
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/iotdb" > .env
echo "MQTT_URL=wss://broker.hivemq.com:8884/mqtt" >> .env
echo "BASE_TOPIC=TFCT_2_PE" >> .env
echo "PORT=3001" >> .env

npm run dev
# Server starts with --watch flag (auto-restart on changes)
```

#### Terminal 3: Website

```bash
cd website
npm install
npm run dev
# Vite dev server starts on http://localhost:8080
# Proxy configured for /api, /health, /fw → http://localhost:3001
```

### Building for Production

```bash
cd website
npm run build
# Output: website/dist/

# Serve built files
npm run preview
```

### Firmware Development Workflow

1. **Make Code Changes**
   - Edit `microcontroller/ESP32-S3_CODE.ino`

2. **Compile Sketch**
   - Arduino IDE: Sketch → Verify/Compile
   - Note the `.bin` file location in output (usually in temp directory)

3. **Upload via USB** (First time or if OTA fails)
   - Click "Upload" button

4. **Upload via OTA** (Subsequent updates)
   - Copy compiled `.bin` to known location
   - Upload via dashboard
   - Device updates in ~10 seconds

### Database Schema

```sql
-- Devices table
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Readings hypertable
CREATE TABLE readings (
  id BIGSERIAL,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  t REAL,        -- Temperature (°C)
  h REAL,        -- Humidity (%)
  p REAL,        -- Pressure (hPa)
  pm1 REAL,      -- PM1.0 (µg/m³)
  pm25 REAL,     -- PM2.5 (µg/m³)
  pm10 REAL,     -- PM10 (µg/m³)
  aqi REAL,      -- Air Quality Index
  PRIMARY KEY (id, ts)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('readings', 'ts',
  chunk_time_interval => INTERVAL '1 hour'
);

-- Add retention policy (8 hours)
SELECT add_retention_policy('readings', INTERVAL '8 hours');

-- Index for device queries
CREATE INDEX idx_readings_device_ts
  ON readings (device_id, ts DESC);
```

### Debugging

#### View Docker Logs

```bash
# Real-time logs
docker compose logs -f server
docker compose logs -f web
docker compose logs -f db

# Last 100 lines
docker compose logs --tail=100 server
```

#### Access Database

```bash
# PostgreSQL CLI
docker compose exec db psql -U postgres -d iotdb

# Query readings
SELECT * FROM readings ORDER BY ts DESC LIMIT 10;

# Count readings
SELECT device_id, COUNT(*) FROM readings GROUP BY device_id;

# Check hypertable info
SELECT * FROM timescaledb_information.hypertables;
```

#### MQTT Debugging

```bash
# Subscribe to all topics
mosquitto_sub -h broker.hivemq.com -t "TFCT_2_PE/#" -v

# Publish test message
mosquitto_pub -h broker.hivemq.com -t "TFCT_2_PE/cmd/time" -m "1698765432"
```

#### Serial Debugging (ESP32)

```bash
# Linux/Mac
screen /dev/ttyUSB0 115200

# Windows: Use Arduino IDE Serial Monitor or PuTTY
```

---

## Troubleshooting

### Docker Issues

**Problem**: `env file ... .env not found`
**Solution**: Create `.env` from `.env.example`:
```bash
copy .env.example .env
```

**Problem**: Port 3001 or 8080 already in use
**Solution**: Stop conflicting services or change port in `.env`:
```env
SERVER_PORT=3002
```

**Problem**: Database initialization failed
**Solution**: Reset database volume:
```bash
docker compose down -v
docker compose up -d
```

**Problem**: `wget: command not found` in healthcheck
**Solution**: Update `docker-compose.yml` healthcheck to use `curl`:
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
```

### Firmware Issues

**Problem**: WiFi connection fails
**Solution**:
- Verify SSID and password in AP Portal
- Check WiFi signal strength
- Ensure router supports 2.4GHz (ESP32-S3 doesn't support 5GHz)

**Problem**: MQTT connection fails
**Solution**:
- Check `MQTT_URL` in code matches server (default: `broker.hivemq.com`)
- Verify firewall allows outbound port 1883 or 8883
- Check Serial Monitor for error messages

**Problem**: Sensors not detected
**Solution**:
- Run I2C scanner sketch to verify addresses
- Check wiring (SDA, SCL, VCC, GND)
- Verify correct I2C pins in code (SDA=8, SCL=9)

**Problem**: OTA update fails
**Solution**:
- Ensure URL is reachable from ESP32 (no `localhost`/`127.0.0.1`)
- Verify `.bin` file is valid (compile from Arduino IDE)
- Check Serial Monitor for specific error codes
- Ensure sufficient free flash space

**Problem**: PMS7003 shows zero values
**Solution**:
- Wait 30 seconds for sensor warm-up
- Verify 5V power supply (PMS7003 requires 5V)
- Check UART wiring (RX=17, TX=18)

### Dashboard Issues

**Problem**: Dashboard shows "Database: Offline"
**Solution**:
- Verify server is running: `docker compose ps`
- Check server health: `http://localhost:3001/health`
- Review server logs: `docker compose logs -f server`

**Problem**: Dashboard shows "ESP32: Disconnected"
**Solution**:
- Verify device is publishing to MQTT
- Check MQTT broker connectivity
- Ensure dashboard and device use same broker URL

**Problem**: Charts not updating
**Solution**:
- Check browser console for errors (F12 → Console)
- Verify API endpoint returns data: `http://localhost:3001/api/readings?minutes=60`
- Clear browser cache and reload

**Problem**: GitHub Pages shows 404
**Solution**:
- Verify `gh-pages` branch exists
- Check GitHub Actions workflow status
- Ensure `404.html` exists in `gh-pages` branch (should be copy of `index.html`)

### Cloudflare Tunnel Issues

**Problem**: Tunnel connection fails
**Solution**:
- Check `cloudflared` is running: `ps aux | grep cloudflared`
- Verify firewall allows outbound HTTPS (port 443)
- Check tunnel logs: `cloudflared tunnel info <tunnel-name>`

**Problem**: API requests fail with CORS error
**Solution**:
- Server already has CORS enabled
- Verify tunnel forwards to correct port (3001)
- Check browser console for specific CORS error

**Problem**: Tunnel URL changes on restart
**Solution**:
- Use named tunnel instead of quick tunnel
- Follow "Option B: Named Tunnel" setup

---

## Recent Updates

### v2.1.0 - Chart & Database Improvements

**Chart Timestamp Fix**:
- Fixed overlapping X-axis timestamps when switching between Tester Mode and Normal Mode
- Each mode now maintains completely independent chart data with proper cleanup
- Added `chartKey` state to force React remount of chart components on mode change
- Eliminated race conditions during mode transitions

**Database Simulation Feature**:
- New **"Simulate 8h DB Data"** button in Tester Mode
- Generates 3,000-5,000 realistic data points covering 8 hours
- Randomized intervals (±50% of "Update every" setting)
- Bulk API endpoint (`/api/readings/bulk`) for efficient batch insertion
- Progress notifications during generation
- Automatic chart reload after completion

**GitHub Pages Configuration Improvements**:
- Enhanced documentation for `VITE_API_BASE` and `VITE_FW_BASE` setup
- Added clear explanation of why these variables are required
- Improved troubleshooting for "Database: Offline" issues
- Better examples for different tunnel types (quick, named, custom domain)

**API Enhancements**:
- New endpoint: `POST /api/readings/bulk` for batch data insertion
- Transaction support for reliable bulk inserts
- Configurable batch size (default: 100 readings per transaction)

---

## License

This project is released under the MIT License. Feel free to use, modify, and distribute for personal or commercial purposes.

---

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Support

For issues, questions, or feature requests:
- **GitHub Issues**: https://github.com/yourusername/TheForecaster-2-PocketEdition/issues
- **Email**: your.email@example.com

---

## Acknowledgments

- **TimescaleDB** for time-series database capabilities
- **HiveMQ** for free public MQTT broker
- **Cloudflare** for free tunnel service
- **GitHub** for free Pages hosting
- **shadcn/ui** for beautiful React components
- **Adafruit** for sensor libraries
- **Espressif** for ESP32-S3 platform

---

**Built with ❤️ for environmental monitoring**
