# IoT Environmental Dashboard

แดชบอร์ดเว็บสำหรับติดตามข้อมูลจากบอร์ด IoT แบบเรียลไทม์ โดยเชื่อมต่อกับ MQTT เพื่อรับค่าจากเซ็นเซอร์ (อุณหภูมิ ความชื้น ความกดอากาศ และฝุ่น PM1/2.5/10) และแสดงผลผ่านกราฟ/การ์ดในอินเทอร์เฟซภาษาไทย

## โครงสร้างหลักของโปรเจ็กต์
- **Vite + React + TypeScript** สำหรับพัฒนา frontend
- **Tailwind CSS** และ **shadcn/ui** สำหรับออกแบบ UI
- **MQTT over WebSocket** (ผ่าน HiveMQ) ใช้สำหรับรับค่าจากอุปกรณ์และส่งสถานะการออนไลน์ของเว็บแดชบอร์ด

โค้ดหลักอยู่ในโฟลเดอร์ `src/` โดยเฉพาะหน้า `DashboardPage` ที่ใช้แสดงข้อมูลแบบเรียลไทม์ ส่วน `PresenceManager` จัดการการประกาศสถานะออนไลน์/ออฟไลน์ของเว็บผ่าน MQTT

## เริ่มใช้งานบนเครื่องตัวเอง
ต้องติดตั้ง Node.js (แนะนำเวอร์ชันล่าสุด LTS)

```sh
npm install
npm run dev
```

คำสั่งด้านบนจะรันเซิร์ฟเวอร์ Vite (ปกติที่ `http://localhost:5173`) พร้อม hot reload

### Build สำหรับ production
```sh
npm run build
npm run preview
```

## โครงสร้างคำสั่ง npm เพิ่มเติม
- `npm run lint` – ตรวจสอบโค้ดด้วย ESLint

## โฟลเดอร์สำคัญ
- `public/` – เก็บ asset ที่เสิร์ฟแบบสแตติก
- `src/components/` – คอมโพเนนต์ UI และยูทิลิตีต่าง ๆ รวมถึง `PresenceManager`
- `src/pages/` – หน้าหลักของเว็บ (โฮม, Dashboard, เอกสาร, 404)

## การปรับแต่งเพิ่มเติม
- ต้องการเพิ่มเซ็นเซอร์หรือ widget ใหม่ เพิ่มโค้ดใน `DashboardPage`
- หากต้องการเชื่อมต่อ MQTT โฮสต์อื่น ปรับค่าที่ `src/components/PresenceManager.tsx`

## License
โปรเจ็กต์นี้ไม่มีการระบุไลเซนส์เป็นพิเศษ โปรดตรวจสอบกับผู้ดูแลโปรเจ็กต์ก่อนนำไปใช้งานเชิงพาณิชย์


# Project Structure

- `web/` � Vite + React app (moved from repo root)
- `esp32/` � ESP32 firmware source (add your code here)

Usage:
- Web: `cd web && npm install && npm run dev`
- Build: `cd web && npm run build`
