# The Forecaster 2 – Pocket Edition (IoT Environmental Dashboard)

แดชบอร์ดเฝ้าระวังคุณภาพอากาศ/สภาพแวดล้อมแบบเรียลไทม์ ประกอบด้วย

- ไมโครคอนโทรลเลอร์ ESP32‑S3 + เซนเซอร์: SHT31 (อุณหภูมิ/ความชื้น), BMP280 (ความกดอากาศ), PMS7003 (ฝุ่น PM1/2.5/10)
- หน้าจอ OLED SH1106 128×64, RTC DS3231, ไฟ LED 3 สี, วัดแบตเตอรี่ และโหมดประหยัดพลังงานเมื่อแบตต่ำ
- ส่งข้อมูลผ่าน MQTT (ค่าเริ่มต้น HiveMQ public broker) ไปยังเว็บแดชบอร์ด และบันทึกลง TimescaleDB ผ่านเซิร์ฟเวอร์ Node.js
- อัปเดตเฟิร์มแวร์ OTA ผ่าน URL ได้ (สั่งผ่าน MQTT/หน้าเว็บ)


## คุณสมบัติเด่น

- การวัดและแสดงผลแบบเรียลไทม์: อุณหภูมิ, ความชื้น, ความกดอากาศ, PM1/PM2.5/PM10 และคำนวณ AQI
- หน้าจอ OLED พร้อมสลับโหมดแสดงผลด้วยปุ่ม, ไฟ LED แสดงระดับ AQI (เขียว/เหลือง/แดง)
- ตั้งค่า Wi‑Fi ง่ายด้วย AP Portal (Captive Portal) กดปุ่มค้าง ~5 วินาที เพื่อเข้าโหมดตั้งค่า
- OTA Firmware: กดปุ่มค้าง ~10 วินาที หรือสั่งจากหน้าเว็บผ่าน MQTT พร้อมตัวอัปโหลดไฟล์
- เว็บแอป Vite + React + Tailwind (shadcn/ui) และเซิร์ฟเวอร์ Node.js สำหรับ REST API และรับข้อมูลจาก MQTT
- จัดการด้วย Docker Compose: TimescaleDB, Server, Web และบริการ Backup ฐานข้อมูล
- นโยบาย Retention DB (TimescaleDB) เก็บข้อมูลย้อนหลัง 8 ชั่วโมง (ปรับแต่งได้)


## โครงสร้างโปรเจกต์

- `website/` – เว็บแดชบอร์ด (Vite + React + TypeScript + Tailwind + shadcn/ui)
- `server/` – เซิร์ฟเวอร์ Node.js (Express + MQTT ingest + REST API)
- `microcontroller/` – โค้ดเฟิร์มแวร์ ESP32‑S3 (`ESP32-S3_CODE.ino`)
- `db/init/` – สคริปต์ตั้งค่า TimescaleDB เริ่มต้น (`01_init.sql`)
- `docker-compose.yml` – ควบคุมบริการทั้งหมด (DB, Server, Web, Backup)
- `.env` – ค่าตั้งค่าเริ่มต้นสำหรับ docker compose (แก้ไขได้ตามต้องการ)


## เริ่มต้นอย่างรวดเร็ว (Docker)

ข้อกำหนดเบื้องต้น: ติดตั้ง Docker Desktop (หรือ Docker + Compose)

1) ตรวจไฟล์ `.env` (ค่าเริ่มต้นเชื่อมต่อ HiveMQ public broker และ DB ภายใน compose)
2) รันสแต็ก

   ตัวอย่างคำสั่ง (Command Prompt):

   ```cmd
   ren .env.example .env
   # หรือคัดลอกไฟล์ตัวอย่าง
   copy .env.example .env
   ```

   หมายเหตุ: ต้องมีไฟล์ `.env` ก่อนรัน มิฉะนั้น `docker compose up -d` จะล้มเหลวด้วย `env file ... .env not found`

```cmd
start
```

Note: After starting, the web service may take 1-2 minutes on first run to finish installing/building. If the page isn't up yet, wait a bit and refresh.

ทางลัดบน Windows (cmd)
- เริ่มระบบ: `start` (ไฟล์ `start.cmd` ที่รากโปรเจกต์)
- หยุดระบบ: `stop` (ไฟล์ `stop.cmd` ที่รากโปรเจกต์)

รายละเอียดคำสั่ง start/stop
- `start`
  - เรียก `docker compose up -d`
  - พิมพ์ข้อความแนะนำให้รอ 1–2 นาทีสำหรับรอบแรก
  - แสดงลิงก์เข้าเว็บทั้ง `http://localhost:8080` และ `http://<IP-เครื่อง>:8080`
  - ใช้ใน Command Prompt (cmd) และให้รันจากโฟลเดอร์โปรเจกต์
  - ต้องเปิด Docker Desktop ให้ Running และมีไฟล์ `.env` ก่อน
  - ใช้งาน:
    ```cmd
    start
    ```
- `stop`
  - เรียก `docker compose down` เพื่อหยุดคอนเทนเนอร์ (ไม่ลบข้อมูลใน volumes)
  - ใช้งาน:
    ```cmd
    stop
    ```
- รีเซ็ตฐานข้อมูล (ลบ volumes ทั้งหมด):
  ```cmd
  docker compose down -v
  start
  ```

หมายเหตุการเข้าถึงเว็บ UI
- เปิดได้ทั้ง http://localhost:8080 และ http://<IP-เครื่อง>:8080
- การอัปโหลด Firmware แนะนำให้เปิดผ่าน IP เพื่อให้ OTA URL ใช้ได้จากอุปกรณ์ในเครือข่าย
  

3) เปิดเว็บ UI: http://localhost:8080
4) ตรวจสุขภาพ API: http://localhost:3001/health

หมายเหตุด้านความปลอดภัย: ค่าเริ่มต้นใช้ MQTT สาธารณะ (`wss://broker.hivemq.com:8884/mqtt`) เหมาะสำหรับทดสอบเท่านั้น ควรเปลี่ยนไปใช้ broker ส่วนตัวและตั้งค่าบัญชี/รหัสผ่านใน `.env` เมื่อใช้งานจริง


## การใช้งานเว็บแดชบอร์ด (website/)

- แสดงค่าปัจจุบัน, สถานะการเชื่อมต่อ, กราฟ และสั่งงานอุปกรณ์ (ตั้งเวลา RTC, เปลี่ยนช่วงอัปเดต, อัปเดตเฟิร์มแวร์ OTA)
- มี Tester Mode สำหรับทดสอบ UI โดยไม่เชื่อมต่อ MQTT
- เว็บจะประกาศสถานะ presence ผ่าน MQTT ที่ `TFCT_2_PE/web/status` เป็น `online/offline` อุปกรณ์จะส่งข้อมูลเฉพาะเมื่อเว็บออนไลน์ (ช่วยลดทราฟฟิก/พลังงาน)

พัฒนาเว็บแบบโลคัล (หากไม่ใช้ docker):

```cmd
cd website
npm install
npm run dev
# เปิด http://localhost:8080 (มี proxy /api ไปที่ server:3001)
```

OTA ผ่านเว็บ (โหมด dev/docker):
- เลือกไฟล์เฟิร์มแวร์ `.bin` ในหน้า Dashboard -> ระบบจะอัปโหลดไฟล์ไปยังตัวอัปโหลด (dev: Vite uploader, prod: server `/fw/upload`)
- เว็บจะส่ง URL เฟิร์มแวร์ไปยัง MQTT `TFCT_2_PE/cmd/ota_now` (หรือแบบระบุอุปกรณ์ `TFCT_2_PE/cmd/<id>/ota_now`)
- อุปกรณ์จะดาวน์โหลดและติดตั้ง OTA แล้วรีสตาร์ต (มี toast แจ้งสถานะสำเร็จ/ล้มเหลว)

ข้อควรระวัง OTA:
- อย่าใช้ `localhost`/`127.0.0.1` ใน URL ที่ส่งไปยังอุปกรณ์ อุปกรณ์จะพยายามใช้ IP LAN อัตโนมัติจากตัวอัปโหลด แต่ใน production ควรใช้ host ที่อุปกรณ์เข้าถึงได้จริง


## เซิร์ฟเวอร์และฐานข้อมูล (server/ + db/)

เซิร์ฟเวอร์ Node.js (`server/index.js`):
- เชื่อมต่อ MQTT (ค่าเริ่มต้นไป HiveMQ) และ subscribe `TFCT_2_PE/#`
- รับข้อมูลจากหัวข้อ `TFCT_2_PE/data` หรือ `TFCT_2_PE/data/<id>` (payload เป็น JSON)
- บันทึกลง TimescaleDB ตาราง `readings` (โยงอุปกรณ์จากตาราง `devices`)
- REST API:
  - `GET /api/latest?mac=<mac>` คืนค่าล่าสุดของอุปกรณ์
  - `GET /api/readings?minutes=60&mac=<mac>` หรือ `?from=..&to=..` ดึงช่วงเวลา
  - `GET /health` ตรวจสุขภาพบริการ/DB
- เสิร์ฟไฟล์เฟิร์มแวร์ที่อัปโหลด: `GET /fw/f/:file` และอัปโหลด `POST /fw/upload`

ฐานข้อมูล TimescaleDB (`db/init/01_init.sql`):
- ตาราง `devices` (ทะเบียนอุปกรณ์) และ `readings` (ค่าที่วัดได้ + AQI)
- ตั้งให้เป็น hypertable และมี retention 8 ชั่วโมง (ปรับได้ใน SQL)

ตัวแปรแวดล้อมที่สำคัญ (ดูเพิ่มใน `.env`):
- `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `BASE_TOPIC` (ค่าเริ่มต้น `TFCT_2_PE`)
- `DATABASE_URL` (เชื่อมต่อ Postgres/TimescaleDB)
- `UPLOADS_DIR`, `STATIC_DIR`

คำสั่งที่ใช้บ่อย (Docker):

```sh
docker compose up -d          # เริ่มทั้งหมด
docker compose logs -f server # ดู log เซิร์ฟเวอร์
docker compose down           # หยุดบริการ
docker compose down -v        # รีเซ็ต DB (ลบ volume) – อันตราย
```


## เฟิร์มแวร์ ESP32‑S3 (microcontroller/ESP32-S3_CODE.ino)

ฮาร์ดแวร์ที่ใช้:
- ESP32‑S3
- SHT31 (I2C 0x44) – อุณหภูมิ/ความชื้น
- BMP280 (I2C 0x76 หรือ 0x77) – ความกดอากาศ
- PMS7003 (UART) – ฝุ่น PM1/PM2.5/PM10
- RTC DS3231 – เวลา
- OLED SH1106 128×64 (I2C 0x3C)
- ปุ่มกด 1 ปุ่ม, LED 3 สี (แดง/เหลือง/เขียว)
- วัดแรงดันแบตเตอรี่ผ่าน ADC

การต่อขา (ค่าเริ่มต้นในโค้ด):
- I2C: `SDA=8`, `SCL=9`, OLED ที่ `0x3C`
- PMS7003: `RX=17`, `TX=18`
- ปุ่ม: `BTN_WAKE=5` (Pull‑up, กดลง LOW)
- LED: `LED_GREEN=10`, `LED_YELLOW=11`, `LED_RED=12`
- แบตเตอรี่: `PIN_VBAT=4` (ADC 11 dB, divider ~×5)

การใช้งานปุ่ม:
- กดสั้น: ปลุกหน้าจอ/สลับหน้าจอ (AQI, Temp, Humidity, Pressure, PM1, PM2.5, PM10)
- กดค้าง ≥ 5 วินาที: เข้าโหมดตั้งค่า Wi‑Fi (AP Portal)
- กดค้าง ≥ 10 วินาที: เริ่ม OTA เฟิร์มแวร์ (ผ่าน URL ที่บันทึกไว้หรือที่ส่งมาล่าสุด)

โหมดตั้งค่า Wi‑Fi (AP Portal):
- อุปกรณ์เปิด AP ชื่อ `TFCT_2_PE-XXXX` (XXXX = 4 ตัวท้ายของ MAC) และหน้าเว็บตั้งค่า SSID/Password
- เมื่อเชื่อมสำเร็จ อุปกรณ์จะรีสตาร์ตและจำค่าไว้ใน NVS

MQTT (ค่าเริ่มต้น):
- โบรกเกอร์: `broker.hivemq.com:1883`
- หัวข้อสถานะ (LWT): `TFCT_2_PE/status` ค่าคงค้างออนไลน์/ออฟไลน์
- Presence จากเว็บ: `TFCT_2_PE/web/status` (retained: `online`/`offline`) – อุปกรณ์จะส่งข้อมูลเฉพาะตอนเว็บออนไลน์
- หัวข้อส่งข้อมูล: `TFCT_2_PE/data/<id>` ค่า `<id>` = `TFCT_2_PE-<mac12>`
  - Payload (ตัวอย่าง):
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
- หัวข้อรับคำสั่ง:
  - `TFCT_2_PE/cmd/time` – ตั้งเวลา Epoch (วินาที, UTC + offset ภายในอุปกรณ์)
  - `TFCT_2_PE/cmd/interval` – ตั้งช่วงเวลาเผยแพร่ (มิลลิวินาที, 500..600000)
  - `TFCT_2_PE/cmd/ota_url` – บันทึก URL เฟิร์มแวร์
  - `TFCT_2_PE/cmd/ota_now` – เริ่ม OTA; รองรับรูปแบบ `http(s)://...` หรือ `host:port/path.bin` หรือ `.../start`
  - แบบเจาะจงอุปกรณ์: `TFCT_2_PE/cmd/<id>/ota_url`, `TFCT_2_PE/cmd/<id>/ota_now`

หมายเหตุ:
- อุปกรณ์จะประกาศ `online` แบบ retained และ re‑assert จนกว่าจะยืนยันว่า retained สำเร็จ
- มีระบบ watchdog สำหรับ PMS7003 (wake/active/reinit) เพื่อความเสถียร
- แบตต่ำกว่า ~3.30V: แจ้งเตือนแล้วเข้าหลับลึก (deep sleep)

การคอมไพล์/อัปโหลด (Arduino IDE 2.x แนะนำ):
- ติดตั้งบอร์ดแพ็กเกจ Espressif Arduino (ESP32) รุ่นล่าสุด และเลือกบอร์ด “ESP32S3 Dev Module”
- ไลบรารีที่ใช้: `Adafruit SHT31`, `Adafruit BMP280`, `Adafruit GFX`, `Adafruit SH110X`, `RTClib`, `PubSubClient` (และของ ESP32 เช่น `Preferences`, `DNSServer`, `ESPmDNS`, `HTTPClient`, `Update`)
- Serial Monitor 115200 bps
- ตรวจการจ่ายไฟให้ PMS7003 ตามสเปก (แนะนำ 5V)


## การตั้งค่า MQTT/ระบบผ่านหน้าเว็บ

ในหน้า Dashboard:
- Sync เวลา RTC: ส่ง Epoch ไป `TFCT_2_PE/cmd/time`
- เปลี่ยนช่วงอัปเดต: ส่งมิลลิวินาทีไป `TFCT_2_PE/cmd/interval` (มี Clamp 500..600000)
- OTA: อัปโหลด `.bin` -> ระบบจะส่ง URL ไป `.../cmd/ota_now` (ต่ออุปกรณ์ที่เลือกหรือทั้งหมด)


## สภาพแวดล้อมสำหรับนักพัฒนา (ไม่ใช้ Docker)

รันเซิร์ฟเวอร์:
```cmd
cd server
npm install
npm run dev
# ค่าเริ่มต้น: PORT=3001, MQTT_URL=wss://broker.hivemq.com:8884/mqtt
```

รันเว็บ:
```cmd
cd website
npm install
set API_PROXY_TARGET=http://localhost:3001
npm run dev
# เปิด http://localhost:8080
```


## ข้อควรทราบ/ความปลอดภัย

- HiveMQ public broker เป็นสาธารณะ เหมาะเฉพาะการทดสอบ โปรดตั้งค่า broker ส่วนตัวใน `.env` สำหรับการใช้งานจริง
- OTA ผ่าน HTTP/HTTPS: โปรดใช้ URL ที่อุปกรณ์เข้าถึงได้จากเครือข่ายเดียวกัน หลีกเลี่ยง `localhost`/loopback
- นโยบายเก็บข้อมูล TimescaleDB ในตัวอย่างจำกัดที่ 8 ชั่วโมง เพื่อทดลอง/ประหยัดทรัพยากร ปรับได้ตามต้องการ


## License

ยังไม่ระบุไลเซนส์ในรีโปนี้ หากต้องการเพิ่ม สามารถแจ้งเพื่ออัปเดตไฟล์ได้


