# SETUP.md — วิธีติดตั้งและรันโปรเจค

โปรเจค: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui + Radix UI

---

## 1) เตรียมเครื่อง
- ติดตั้ง **Node.js LTS (แนะนำ 20.x)** จาก https://nodejs.org  
- ตรวจสอบเวอร์ชันหลังติดตั้ง
  ```bash
  node -v
  npm -v
  ```
- (แนะนำ) ติดตั้ง Git และ VS Code

---

## 2) ดึงซอร์สโค้ด
```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
# หรือไปยังโฟลเดอร์ที่มีโปรเจคอยู่แล้ว เช่น
# cd E:\PROJECT\TMPPM
```

---

## 3) ติดตั้ง Dependencies
```bash
npm install
```
> คำสั่งนี้จะสร้างโฟลเดอร์ `node_modules/` ตาม `package.json` + `package-lock.json`

---

## 4) แก้ปัญหา Dependencies ที่เคยเจอ (รวมวิธีนี้ไว้แล้ว)
ปัญหาเดิม: `vite@5` ดึง `esbuild@0.21.x` ที่มีช่องโหว่ และ `lovable-tagger@1.1.9` ผูกกับ `vite@^5`

### วิธีแก้แบบสากล (ใช้ได้ซ้ำเมื่อเจอช่องโหว่ esbuild อีก)
1. เปิด `package.json` แล้วเพิ่มบล็อก `overrides` เพื่อบังคับเวอร์ชันที่ปลอดภัย
   ```json
   {
     "overrides": {
       "esbuild": "0.25.10"
     }
   }
   ```
2. รีเซ็ต environment แล้วติดตั้งใหม่
   ```bash
   rmdir /s /q node_modules
   del package-lock.json
   npm install
   ```
3. ตรวจสอบ
   ```bash
   npm ls vite esbuild
   npm audit
   ```
   ควรเห็น `vite@5.x` + `esbuild@0.25.10` และ `npm audit` ไม่มีช่องโหว่ระดับเสี่ยง

> หมายเหตุ: อย่าใช้รูปแบบ `vite/esbuild` ใน `overrides` เพราะ npm ไม่รองรับ syntax นั้น

---

## 5) รัน Dev Server
```bash
npm run dev
```
ตัวอย่างผลลัพธ์:
```
Local:   http://localhost:5173/
Network: http://192.168.x.x:5173/
```
- ใช้ **Local URL** บนเครื่องตัวเอง
- **Network URL** ใช้จากเครื่องอื่นใน LAN เดียวกันได้ หาก Windows Firewall อนุญาต `node.exe`/พอร์ตที่ใช้

> ปลอดภัยไว้ก่อน: อย่า expose Vite dev server สู่ Internet จริง

---

## 6) Build สำหรับ Production
```bash
npm run build
```
ไฟล์ที่ build แล้วจะอยู่ใน `dist/`  
นำไป Deploy บน Nginx/Apache หรือบริการโฮสติ้ง (Vercel, Netlify ฯลฯ)

---

## 7) ทิปส์และสคริปต์ที่มีให้
**Scripts ใน `package.json`**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

---

## 8) Troubleshooting สั้นๆ
- `npm: not recognized` → ยังไม่ได้ติดตั้ง Node.js หรือ PATH ไม่ถูก
- `peer dependency conflict` กับ Vite 7 → ใช้ Vite 5 เพื่อเข้ากันกับ `lovable-tagger@1.1.9`
- `npm audit` มีช่องโหว่ esbuild → ทำขั้นตอนในหัวข้อ **4) แก้ปัญหา Dependencies**

---

## 9) LAN Test (ถ้าต้องการทดสอบจากมือถือ/เครื่องอื่น)
- ให้เครื่องทดสอบอยู่ Wi‑Fi/Subnet เดียวกัน
- เปิด Firewall ให้ `node.exe` บน Private Network
- เข้า `http://<IP_เครื่องคุณ>:<พอร์ต>` ตามบรรทัด Network ที่ Vite แสดง

---

พร้อมใช้งาน ✅  
ขั้นตอนหลักมีแค่: ติดตั้ง Node → `npm install` → `npm run dev` → แก้ช่องโหว่ด้วย `overrides` เมื่อจำเป็น → `npm run build` สำหรับ deploy.