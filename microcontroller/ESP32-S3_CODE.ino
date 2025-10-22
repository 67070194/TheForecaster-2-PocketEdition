// ESP32-S3: WiFi + MQTT + SHT31 + BMP280 + DS3231 + SH1106 + PMS7003 + Battery + AQI
// UI: Splash แบบไม่บล็อก → แสดง AQI ก่อน แล้วค่อยเริ่มส่ง MQTT
// หน้าจออัปเดตทุก 1s โดยไม่ผูกกับ MQTT (แยกกันทำงาน)
// MQTT: broker.hivemq.com:1883
// Publish: TFCT_2_PE/data/<id>  (aqi,t,h,p,vbat,pm1,pm25,pm10)
// Subscribe: TFCT_2_PE/cmd/time (epoch UTC), TFCT_2_PE/cmd/interval (ms; 500..600000),
//            TFCT_2_PE/cmd/ota_url, TFCT_2_PE/cmd/ota_now
// LWT: TFCT_2_PE/status -> "online"/"offline" (retain)

#include <WiFi.h>
#include <ESPmDNS.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <Adafruit_BMP280.h>
#include <RTClib.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#include <DNSServer.h>
#include <HTTPClient.h>
#include <Update.h>
#include <string.h>
#include <math.h>

// ===== Overview =====
// โค้ดนี้ทำให้อุปกรณ์ ESP32‑S3 เป็นโหนดตรวจวัดคุณภาพอากาศแบบเรียลไทม์
// - เชื่อมต่อ Wi‑Fi และสื่อสารผ่าน MQTT
// - อ่านค่าจาก SHT31 (อุณหภูมิ/ความชื้น), BMP280 (ความกดอากาศ), PMS7003 (PM1/2.5/10)
// - คำนวณค่า AQI, แสดงผลบน OLED SH1106 และ LED 3 สี
// - มีโหมดตั้งค่า Wi‑Fi ผ่าน AP Portal และรองรับ OTA ผ่าน HTTP URL
// - ประหยัดพลังงานด้วยการปิดจออัตโนมัติ และตัดไฟเมื่อแบตต่ำมาก
//
// การเผยแพร่ข้อมูล (MQTT)
// - Publish: TFCT_2_PE/data/<id> เป็น JSON {id,fw,aqi,t,h,p,vbat,pm1,pm25,pm10}
// - Subscribe: TFCT_2_PE/cmd/time, /cmd/interval, /cmd/ota_url, /cmd/ota_now
// - LWT: TFCT_2_PE/status → retained "online"/"offline"
// - Web presence: TFCT_2_PE/web/status → ใช้กำหนดให้เริ่ม/หยุด publish เมื่อหน้าเว็บ online/offline

// ---------- Firmware Version (SemVer) ----------
#define FW_VER "1.0.0"

// ---------- Pins ----------
#define SDA_PIN    8
#define SCL_PIN    9
#define PMS_RX    17
#define PMS_TX    18
#define BTN_WAKE   5
#define LED_GREEN  10  // GPIO10
#define LED_YELLOW 11  // GPIO11
#define LED_RED    12  // GPIO12
#define PIN_VBAT   4
#define OLED_ADDR  0x3C

// ---------- WiFi / MQTT ----------
// Note: Runtime Wi-Fi credentials are stored in NVS (Preferences).
// These hardcoded defaults are ignored when NVS has values.
const char* WIFI_SSID = "";     // optional default
const char* WIFI_PASS = "";     // optional default
const char* MQTT_HOST = "broker.hivemq.com";
const uint16_t MQTT_PORT = 1883;
const char* PUB_TOPIC    = "TFCT_2_PE/data";
const char* SUB_TIME     = "TFCT_2_PE/cmd/time";
const char* SUB_INTERVAL = "TFCT_2_PE/cmd/interval";
const char* SUB_OTA_URL  = "TFCT_2_PE/cmd/ota_url";
const char* SUB_OTA_NOW  = "TFCT_2_PE/cmd/ota_now"; // payload: start/1
const char* LWT_TOPIC    = "TFCT_2_PE/status";
const char* DEBUG_TOPIC  = "TFCT_2_PE/debug";   // non-retained debug logs

// ---- Web presence topics ----
const char* WEB_STATUS = "TFCT_2_PE/web/status";   // retained "online"/"offline" (web presence; LWT fallback = offline)

WiFiClient net;
PubSubClient mqtt(net);
String pubTopic;  // data topic with MAC suffix
String subOtaUrlDev;  // device-scoped OTA URL topic
String subOtaNowDev;  // device-scoped OTA NOW topic
String mdnsHost="";   // mDNS hostname (e.g., tfct2pe-1a2b)
String apSsid="";     // AP SSID when in config mode (e.g., TFCT_2_PE-1A2B)
// Forward declaration for debug publish helper
static void publishDebug(const String& msg, bool retained=false);

// ---- Wi-Fi config / AP portal ----
Preferences prefs;
WebServer server(80);
DNSServer dnsServer;
String wifiSsid="";
String wifiPass="";
// AP connection workflow (async)
String apReqSsid="";
String apReqPass="";
// 0=idle,1=requested,2=connecting,3=success,4=failed
uint8_t apConnState = 0;
unsigned long apConnStartMs = 0;
unsigned long apRestartAt = 0;
enum RunMode { MODE_NORMAL, MODE_AP_CONFIG };
RunMode runMode = MODE_NORMAL;
bool wifiAttempting = false;
unsigned long wifiAttemptStart = 0;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000UL; // 30s

// AP blink state
unsigned long apBlinkAt = 0;
bool apBlinkOn = false;
// AP timers
unsigned long apStartedAt = 0;      // when AP was entered
unsigned long apLastSubmitAt = 0;   // when last SSID was submitted (resets 5-min timer)

// Button long-press tracking
bool btnWasDown = false;
unsigned long btnDownAt = 0;
bool longPressHandled = false;

// ---- MQTT status guard ----
bool statusConfirmed = false;
unsigned long lastStatusPub = 0;
String clientId;   // stable client id

// ---- Web presence state ----
bool webOnline = false;

// ---------- Time ----------
// Default TZ offset (+7h) and extra +2s to offset end-to-end delay
static const int32_t DEFAULT_TZ_OFFSET = (7 * 3600) + 1;
int32_t tzOffset = DEFAULT_TZ_OFFSET;

// ---------- Devices ----------
Adafruit_SH1106G display(128, 64, &Wire, -1);
Adafruit_SHT31   sht31;
Adafruit_BMP280  bmp;
RTC_DS3231       rtc;
HardwareSerial   PMS(1);

// ---- OTA (HTTP) ----
String otaUrl = "";   // loaded from NVS: namespace 'sys', key 'ota'

// ---------- State ----------
static unsigned long pubInterval = 2000;
uint16_t last_pm1=0,last_pm25=0,last_pm10=0;
unsigned long last_ok_ms=0,last_cmd_ms=0;
bool publishEnabled=true;
bool firstAqiShown=false;

// ---- UI / Button ----
volatile bool wakeIRQ=false;
bool screenOn=true;
unsigned long screenOffAt=0;
uint8_t uiMode=0;                    // 0:AQI 1:T 2:H 3:P 4:PM1 5:PM25 6:PM10
unsigned long lastBtnAt=0;
static const unsigned long BTN_DEBOUNCE_MS = 500;
static const unsigned long SHORT_PRESS_MIN_MS = 50;
bool forceSample=false;

// ---- UI overlays ----
bool connectingOverlay = false;
unsigned long connectingOverlayUntil = 0;
bool failOverlay = false;
unsigned long failOverlayUntil = 0;

// ---- Display sampling ----
unsigned long lastDisplaySample=0;
const unsigned long DISPLAY_SAMPLE_MS=1000;

// (Display sampling only; env sensors are read within the display block)
// ---- Env sampling (decoupled from display) ----
unsigned long lastEnvSample = 0;
const unsigned long ENV_SAMPLE_MS = 1000;

// ---- Battery sampling (for power saving) ----
unsigned long lastVbatSample = 0;
const unsigned long VBAT_SAMPLE_MS = 60000UL; // 1 minute

// ---- Battery ADC ----
const float K_DIV = 5.0f;
const float SCALE = 1.01f;

// ---- Live vars ----
float t=NAN,h=NAN,p=NAN,vbat_cached=NAN;
float t_ema=NAN, h_ema=NAN;      // smoothed display/publish values
int   lastAQI=-1;
bool  pm_seen=false;

// ---- PMS watchdog ----
unsigned long lastPmsRxMs = 0;      // last time a valid PMS frame was received
unsigned long lastPmsKickMs = 0;    // last time we sent wake/active or reinit
const unsigned long PMS_KICK_GAP_MS = 5000UL;   // re-send wake/active every 5s if no data
const unsigned long PMS_REINIT_MS   = 20000UL;  // re-init UART after 20s without data
// PMS robustness tracking
unsigned long pmsLastCrcWindowMs = 0;
uint16_t      pmsCrcInWindow    = 0;       // CRC fails within window
const unsigned long PMS_CRC_WIN_MS    = 10000UL; // 10s window
const uint16_t      PMS_CRC_MAX_IN_WIN = 5;      // threshold to reinit

// ---------- LED helpers ----------
static inline void setLeds(bool r,bool y,bool g){
  digitalWrite(LED_RED,    r?HIGH:LOW);
  digitalWrite(LED_YELLOW, y?HIGH:LOW);
  digitalWrite(LED_GREEN,  g?HIGH:LOW);
}
static inline void allLedsOff(){ setLeds(false,false,false); }
static void updateAQILeds(int aqi){
  if(runMode == MODE_AP_CONFIG){
    return; // In AP mode, blinking handled elsewhere
  }
  if(aqi < 0){
    // unknown -> yellow blink slow could be added; for now turn off
    setLeds(false,false,false);
    return;
  }
  if(aqi <= 50){            // Good
    setLeds(false,false,true);   // Green
  }else if(aqi <= 100){     // Moderate
    setLeds(false,true,false);   // Yellow
  }else{                    // Unhealthy
    setLeds(true,false,false);   // Red
  }
}

// ---------- Simple HTML pages ----------
static const char INDEX_HTML[] PROGMEM = R"HTML(
<!doctype html>
<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>THE_FORECASTER_2 Wi-Fi Setup</title>
<style>
:root{--bg:#111;--fg:#eee;--muted:#bbb;--card:#181818;--border:#333;--accent:#0a84ff}
@media (prefers-color-scheme: light){:root{--bg:#f6f7f9;--fg:#0b1b2b;--muted:#52606d;--card:#ffffff;--border:#d6d9de;--accent:#0a84ff}}
body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--fg);padding:24px;margin:0}
.card{max-width:420px;margin:0 auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{text-align:center;font-size:20px;margin:0 0 16px}
label{display:block;margin:8px 0 4px}
input,button{font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--fg);width:100%;box-sizing:border-box}
input:focus{outline:2px solid var(--accent);border-color:var(--accent)}
.row{display:flex;gap:8px;margin-top:12px}
.actions{display:flex;justify-content:center;margin-top:12px}
.actions button{width:auto;min-width:140px}
.primary{cursor:pointer;background:var(--accent);border-color:var(--accent);color:#fff}
.ghost{cursor:pointer;background:transparent}
.muted{font-size:12px;color:var(--muted);margin-top:8px}
</style>
</head><body>
<div class='card'>
  <h1>THE_FORECASTER_2 Wi-Fi Setup</h1>
  <form method='GET' action='/save'>
    <label>SSID</label>
    <input name='ssid' maxlength='63' placeholder='Wi-Fi SSID' required value=''>
    <label>Password</label>
    <input name='pass' maxlength='63' placeholder='Wi-Fi Password' type='password' required value=''>
    <div class='actions'>
      <button class='primary' type='submit'>Submit</button>
    </div>
    <p class='muted'>Device tries within 30s. Success page will auto-reboot.</p>
  </form>
</div>
</body></html>
)HTML";

static void sendPage(const String& msg){
  String html = F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Wi-Fi Setup</title><style>:root{--bg:#111;--fg:#eee;--muted:#bbb;--card:#181818;--border:#333;--accent:#0a84ff}@media (prefers-color-scheme: light){:root{--bg:#f6f7f9;--fg:#0b1b2b;--muted:#52606d;--card:#ffffff;--border:#d6d9de;--accent:#0a84ff}}body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--fg);padding:24px;margin:0}.card{max-width:480px;margin:0 auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card)}button{font-size:16px;padding:10px;border-radius:8px;border:1px solid var(--border)}.row{display:flex;gap:8px;margin-top:12px}.primary{cursor:pointer;background:var(--accent);border-color:var(--accent);color:#fff}.ghost{cursor:pointer;background:transparent;color:var(--fg)}</style></head><body>");
  html += F("<div class='card'>");
  html += msg;
  // No explicit Back button; AP will auto-handle flow
  html += F("</div></body></html>");
  server.send(200, "text/html", html);
}

// Dedicated pages
static void sendConnectingPage(){
  String html = F("<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Connecting...</title><meta http-equiv='refresh' content='1;url=/result'><style>:root{--bg:#111;--fg:#eee;--muted:#bbb;--card:#181818;--border:#333;--accent:#0a84ff}@media (prefers-color-scheme: light){:root{--bg:#f6f7f9;--fg:#0b1b2b;--muted:#52606d;--card:#ffffff;--border:#d6d9de;--accent:#0a84ff}}body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--fg);padding:24px;margin:0}.card{max-width:420px;margin:0 auto;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);text-align:center}h1{margin:0 0 8px;font-size:20px}.muted{color:var(--muted)}</style></head><body><div class='card'><h1>Connecting...</h1><p class='muted'>Trying to join your Wi-Fi</p></div></body></html>");
  server.send(200, "text/html", html);
}

static void handleResult(){
  if(apConnState==3){
    // Success page; auto refresh and device will reboot shortly
    String msg = F("<h2>Connected! Saving and rebooting...</h2>");
    sendPage(msg);
  } else if(apConnState==4){
    String msg = F("<h2>Failed to connect. Please try again.</h2>");
    sendPage(msg);
  } else {
    sendConnectingPage();
  }
}

// URL-decoding (minimal)
static String urlDecode(const String& s){
  String out; out.reserve(s.length());
  for (size_t i=0;i<s.length();++i){
    char c = s[i];
    if(c=='+' ) { out += ' '; }
    else if(c=='%' && i+2<s.length()){
      char h1=s[i+1], h2=s[i+2];
      auto hexval=[&](char ch)->int{ if(ch>='0'&&ch<='9')return ch-'0'; if(ch>='a'&&ch<='f')return 10+ch-'a'; if(ch>='A'&&ch<='F')return 10+ch-'A'; return 0; };
      int v = (hexval(h1)<<4) | hexval(h2);
      out += char(v);
      i+=2;
    } else out += c;
  }
  return out;
}

// Forward declarations for UI helpers used before their definitions
void screenOnNow(uint32_t ms);
static void drawCenteredTall(const String& txt, int y);
static void doHttpOta();

// AP/Web handlers
static void handleRoot(){
  server.send(200, "text/html", INDEX_HTML);
}
static void handleSave(){
  String ssid = server.hasArg("ssid") ? urlDecode(server.arg("ssid")) : "";
  String pass = server.hasArg("pass") ? urlDecode(server.arg("pass")) : "";
  if(ssid.length()==0){ sendPage(F("<h2>SSID is required</h2>")); return; }
  // Trigger async connect; show Connecting page immediately
  apReqSsid = ssid; apReqPass = pass; apConnState = 1; apLastSubmitAt = millis();
  // OLED + LEDs feedback
  setLeds(true, true, true);
  screenOnNow(30000);
  display.clearDisplay();
  topBar(rtc.now(), vbat_cached, (WiFi.status() == WL_CONNECTED));
  drawCenteredTall(String("Connecting..."), 24);
  display.display();
  connectingOverlay = true;
  connectingOverlayUntil = millis() + WIFI_CONNECT_TIMEOUT_MS + 500;
  sendConnectingPage();
}

// เริ่มโหมดตั้งค่า Wi‑Fi ผ่าน AP (Captive Portal + DNS + HTTP)
// - เปิด AP SSID จากหมายเลขเครื่อง (เช่น TFCT_2_PE-XXXX)
// - เปิด DNS แบบ captive เพื่อนำทุก URL ไปยังหน้า config
// - ให้ผู้ใช้กรอก SSID/Password แล้วลองเชื่อมต่อแบบไม่บล็อก
static void startAP(){
  runMode = MODE_AP_CONFIG;
  // Start AP
  // Ensure clean state before switching to AP
  WiFi.disconnect(true, true);
  delay(100);
  WiFi.mode(WIFI_OFF);
  delay(150);
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  // Country + PHY to maximize compatibility on phones
  wifi_country_t ctry = {"TH", 1, 13, 100, WIFI_COUNTRY_POLICY_MANUAL};
  esp_wifi_set_country(&ctry);
  esp_wifi_set_bandwidth(WIFI_IF_AP, WIFI_BW_HT20);
  esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G | WIFI_PROTOCOL_11N);
  // Open AP (no password)
  if(apSsid.length()==0){
    // Fallback if not prepared (should be set in setup())
    apSsid = "TFCT_2_PE";
  }
  // Static AP IP to keep captive portal stable
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  // Try common non-overlapping channels (1,6,11)
  int tryChans[3] = {1,6,11};
  bool apOk = false; int usedChan = tryChans[0];
  for(int i=0;i<3 && !apOk;i++){
    usedChan = tryChans[i];
    apOk = WiFi.softAP(apSsid.c_str(), nullptr, usedChan, 0, 4);
    if(!apOk) { delay(120); }
  }
  delay(150);
  // Captive portal DNS: resolve all hostnames to AP IP
  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[AP] start %s SSID=%s IP=%s channel=%d\n", apOk?"OK":"FAIL", apSsid.c_str(), apIP.toString().c_str(), usedChan);
  dnsServer.start(53, "*", apIP);
  // Start web server
  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_GET, handleSave);
  server.on("/result", HTTP_GET, handleResult);
  // Redirect all unknown paths to the portal page
  server.onNotFound(handleRoot);
  server.begin();
  apBlinkAt = millis(); apBlinkOn=false;
  apStartedAt = millis();
  apLastSubmitAt = 0;
}

// ปิดโหมด AP และกลับสู่โหมดทำงานปกติ (อ่านเซนเซอร์/แสดงผล)
static void stopAP(){
  server.stop();
  WiFi.softAPdisconnect(true);
  runMode = MODE_NORMAL;
  allLedsOff();
}

// ---------- Helpers ----------
// อ่านแรงดันแบตเตอรี่จาก ADC หลายครั้งแล้วทำค่าเฉลี่ย เพื่อลดสัญญาณรบกวน
float readVBat(){
  const int N = 32;
  long sum_mv = 0;
  for(int i=0;i<N; ++i){
    sum_mv += analogReadMilliVolts(PIN_VBAT);   // accumulate ADC reading in millivolts for smoothing
    delay(2);
  }
  float vout = (sum_mv / (float)N) / 1000.0f;   // convert to volts
  return vout * K_DIV * SCALE;                  // apply divider ratio and calibration scale
}

// ---------- PMS ----------
// ปลุก/ตั้งค่า PMS7003 ให้ตื่นและส่งข้อมูลแบบ Active mode
void pmsWakeAndActive(){
  uint8_t wake[]={0x42,0x4D,0xE4,0x00,0x01,0x01};
  uint8_t active[]={0x42,0x4D,0xE1,0x00,0x01,0x01};
  PMS.write(wake,sizeof(wake)); delay(100);
  PMS.write(active,sizeof(active)); delay(800);
}
// Ensure PMS is awake and producing frames even if Wi-Fi is not connected
// ตรวจสอบและกระตุ้น PMS7003 เป็นระยะ กรณีไม่มีข้อมูลนานเกินกำหนด
static void ensurePMSAlive(){
  unsigned long now = millis();
  // If we haven't seen data recently, poke the sensor
  if (lastPmsRxMs == 0 || (now - lastPmsRxMs) > PMS_KICK_GAP_MS){
    if (now - lastPmsKickMs >= PMS_KICK_GAP_MS){
      pmsWakeAndActive();
      lastPmsKickMs = now;
    }
  }
  // If many CRC fails within a short window, reinit UART proactively
  if (pmsCrcInWindow >= PMS_CRC_MAX_IN_WIN){
    if (now - lastPmsKickMs >= PMS_KICK_GAP_MS){
      PMS.end();
      delay(50);
      PMS.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
      delay(50);
      pmsWakeAndActive();
      lastPmsKickMs = now;
      pmsCrcInWindow = 0; // reset window counter after reinit
      publishDebug(String("{\"event\":\"pms_reinit_crc\",\"ts\":") + String(now) + "}", false);
    }
  }
  // If it's been a long time with no data, reinit UART and poke again
  if (lastPmsRxMs == 0 || (now - lastPmsRxMs) > PMS_REINIT_MS){
    if (now - lastPmsKickMs >= PMS_KICK_GAP_MS){
      PMS.end();
      delay(50);
      PMS.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
      delay(50);
      pmsWakeAndActive();
      lastPmsKickMs = now;
    }
  }
}
// อ่าน 1 เฟรมข้อมูลจาก PMS7003 (ค่า PM1/PM2.5/PM10 แบบ CF=1)
// คืนค่า true เมื่ออ่านสำเร็จและ CRC ถูกต้อง
// อ่านเฟรมข้อมูลจาก PMS7003 (ค่า PM1/2.5/10) คืนค่า true เมื่ออ่านสำเร็จ
bool readPMS(uint16_t &pm1,uint16_t &pm25,uint16_t &pm10){
  while(PMS.available()>64) PMS.read();
  while(PMS.available()>=2){
    if(PMS.peek()==0x42){ PMS.read(); if(PMS.peek()==0x4D){ PMS.read(); break; }}
    else PMS.read();
  }
  if(PMS.available()<30) return false;
  uint8_t b[30];
  if(PMS.readBytes(b,30)!=30) return false;
  if(((b[0]<<8)|b[1])!=28) return false;
  uint16_t sum=0x42+0x4D; for(int i=0;i<28;i++) sum+=b[i];
  uint16_t recv=((uint16_t)b[28]<<8)|b[29];
  if(sum!=recv){
    // Track CRC fails in a sliding window for robustness
    unsigned long now = millis();
    if(now - pmsLastCrcWindowMs > PMS_CRC_WIN_MS){ pmsLastCrcWindowMs = now; pmsCrcInWindow = 0; }
    pmsCrcInWindow++;
    return false;
  }
  pm1 =(b[6]<<8)|b[7];
  pm25=(b[8]<<8)|b[9];
  pm10=(b[10]<<8)|b[11];
  return true;
}

// ---------- AQI ----------
// คำนวณ AQI ตาม US EPA breakpoints แยกตาม PM2.5 และ PM10 แล้วเลือกค่าที่แย่กว่า
int calcAQI_PM25(float c){
  if(!isfinite(c)) return -1;
  float Cp=floor(c*10)/10.0;
  struct BP{float Cl; float Ch; int Il; int Ih;};
  const BP t[]={ {0.0,12.0,0,50},{12.1,35.4,51,100},{35.5,55.4,101,150},
                 {55.5,150.4,151,200},{150.5,250.4,201,300},{250.5,350.4,301,400},{350.5,500.4,401,500} };
  for(auto &b:t) if(Cp>=b.Cl && Cp<=b.Ch)
    return lrint((b.Ih-b.Il)/(b.Ch-b.Cl)*(Cp-b.Cl)+b.Il);
  return 500;
}
int calcAQI_PM10(float c){
  if(!isfinite(c)) return -1;
  float Cp=floor(c);
  struct BP{float Cl; float Ch; int Il; int Ih;};
  const BP t[]={ {0,54,0,50},{55,154,51,100},{155,254,101,150},
                 {255,354,151,200},{355,424,201,300},{425,504,301,400},{505,604,401,500} };
  for(auto &b:t) if(Cp>=b.Cl && Cp<=b.Ch)
    return lrint((b.Ih-b.Il)/(b.Ch-b.Cl)*(Cp-b.Cl)+b.Il);
  return 500;
}
int calcAQI(float pm25,float pm10){
  int a1=calcAQI_PM25(pm25), a2=calcAQI_PM10(pm10);
  if(a1<0 && a2<0) return -1;
  if(a1<0) return a2;
  if(a2<0) return a1;
  return (a1>a2)?a1:a2;
}

// ---------- OLED direct ----------
static inline void sh110x_cmd(uint8_t cmd){
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);
  Wire.write(cmd);
  Wire.endTransmission();
}
static inline void sh110x_cmd2(uint8_t cmd, uint8_t val){
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);
  Wire.write(cmd);
  Wire.endTransmission();
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);
  Wire.write(val);
  Wire.endTransmission();
}
static inline void sh110x_setContrast(uint8_t val){ sh110x_cmd2(0x81, val); }

// ---------- OLED base ----------
void initDisplay(){
  if(!display.begin(0x3C,true)){ Serial.println("SH1106 not found"); while(1); }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.display();
}
void screenOnNow(uint32_t ms=30000){
  screenOn=true;
  screenOffAt=millis()+ms;
  sh110x_cmd(0xAF);
  delay(3);
}
void screenOffNow(){
  screenOn=false;
  display.clearDisplay(); display.display();
  sh110x_cmd(0xAE);
}

// ---------- UI ----------
static void drawCentered(const String& txt, int y, uint8_t sz){
  int16_t x1,y1; uint16_t w,h;
  display.setTextSize(sz);
  display.getTextBounds(txt,0,0,&x1,&y1,&w,&h);
  int x = max(0,(int)(64 - w/2));
  display.setCursor(x,y);
  display.print(txt);
}
// Tall (1x width, 2x height) centered text, same style as splash top
static void drawCenteredTall(const String& txt, int y){
  int16_t x1,y1; uint16_t w,h;
  display.setTextSize(1,2);
  display.getTextBounds(txt,0,0,&x1,&y1,&w,&h);
  int x = max(0,(int)(64 - w/2));
  display.setCursor(x,y);
  display.print(txt);
}
// Firmware status layout: big "Firmware" at top, small status below (splash-like)
static void drawFirmwareStatus(const String& status){
  // Clear content area (keep top bar)
  display.fillRect(0, 11, 128, 64-11, SH110X_BLACK);
  // Title "Firmware" (same size as splash top)
  display.setTextSize(1,2);
  int16_t x1,y1; uint16_t w,h;
  const char* TOP = "Firmware";
  display.getTextBounds(TOP,0,0,&x1,&y1,&w,&h);
  int xTop = max(0,(int)(64 - w/2));
  display.setCursor(xTop, 18);
  display.print(TOP);
  // Status line
  display.setTextSize(1);
  drawCentered(status, 46, 1);
  display.display();
}
// ---- UI helpers: Wi-Fi + Battery icons in top bar ----
static int batteryLevelFromVoltage(float vbat){
  if (!isfinite(vbat)) return -1;
  if (vbat >= 3.90f) return 4;
  else if (vbat >= 3.70f) return 3;
  else if (vbat >= 3.50f) return 2;
  else if (vbat >= 3.30f) return 1;
  else return 0; // < 3.30 V
}

static void drawBatteryIcon(int x, int y, int level){
  // Rounded battery body with fixed 4 slots inside. Slots shrink and disappear by level.
  const int w = 16, h = 8;     // body size
  const int capW = 2;          // cap width
  // Clear area covering body + cap to remove previous slot fills (partial redraw)
  display.fillRect(x-1, y-1, w + capW + 3, h + 2, SH110X_BLACK);
  // Body
  display.drawRoundRect(x, y, w, h, 2, SH110X_WHITE);
  // Cap (to the right)
  display.fillRect(x + w, y + (h/2 - 1), capW, 2, SH110X_WHITE);

  // Early exit if unknown level
  if(level < 0) return;

  // Fixed slot positions (left â†’ right). Each slot width 2px, with 1px gaps.
  // Positions chosen to center 4 slots nicely inside the 16x8 body with padding.
  const int slotW = 2;
  const int innerY = y + 2;           // vertical padding
  const int innerH = h - 4;           // slot height reduced for nicer look
  const int slotX[4] = { x+2, x+5, x+8, x+11 };

  // Clamp level to 0..4
  if(level > 4) level = 4; if(level < 0) level = 0;

  // Draw only the first `level` slots as filled; others vanish
  for(int i=0; i<level; ++i){
    display.fillRect(slotX[i], innerY, slotW, innerH, SH110X_WHITE);
  }
}

// Map RSSI to 0..4 bars
static int rssiToBars(int rssi){
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

// Draw 4 signal bars centered at cx, resting on baseY (top bar height ~10px)
static void drawWifiBarsTopCentered(int cx, int baseY, int bars){
  const int count = 4;          // up to 4 bars
  const int barW = 2;           // bar width
  const int gap  = 2;           // gap between bars (make x-spacing equal)
  const int h0   = 2;           // smallest height
  const int step = 2;           // height step per bar
  const int totalW = count*barW + (count-1)*gap;
  int startX = cx - totalW/2;
  // clear approximate area
  display.fillRect(startX-1, baseY-9, totalW+2, 10, SH110X_BLACK);
  for(int i=0;i<count;i++){
    int h = h0 + i*step;              // 2,4,6,8 px
    int x = startX + i*(barW+gap);
    int y = baseY - h;
    if(bars > i) display.fillRect(x, y, barW, h, SH110X_WHITE);
    else         display.drawRect(x, y, barW, h, SH110X_WHITE);
  }
}

static void drawWifiIcon(int cx, int baseY, bool connected){
  if(connected){
    int bars = rssiToBars(WiFi.RSSI());
    drawWifiBarsTopCentered(cx, baseY, bars);
  } else {
    // 2px-thick 'X' (~8x8) centered around (cx, baseY-4)
    int cy = baseY - 4;
    // clear small area before drawing
    display.fillRect(cx-5, cy-5, 11, 11, SH110X_BLACK);
    // Diagonal TL->BR (2px thick)
    display.drawLine(cx-3, cy-3, cx+3, cy+3, SH110X_WHITE);
    display.drawLine(cx-3, cy-2, cx+3, cy+4, SH110X_WHITE);
    // Diagonal BL->TR (2px thick)
    display.drawLine(cx-3, cy+3, cx+3, cy-3, SH110X_WHITE);
    display.drawLine(cx-3, cy+4, cx+3, cy-2, SH110X_WHITE);
  }
}

void topBar(DateTime now, float vbat, bool wifiOK){
  display.setTextSize(1);
  // Time at left
  // Partial clear of time area to avoid ghosting
  display.fillRect(0, 0, 50, 10, SH110X_BLACK);
  display.setCursor(0,0);
  if(now.hour()<10) display.print('0'); display.print(now.hour()); display.print(':');
  if(now.minute()<10) display.print('0'); display.print(now.minute()); display.print(':');
  if(now.second()<10) display.print('0'); display.print(now.second());

  // Right side: show AP label in AP mode, otherwise Wi-Fi bars
  if(runMode == MODE_AP_CONFIG){
    // Center 'AP' exactly to the Wi-Fi icon center (cx=95, baseY=8 -> centerY=baseY-4)
    const int cx = 95;
    const int baseY = 8;
    const int centerY = baseY - 4; // vertical center used by bars/X

    // Measure text bounds for precise centering
    int16_t x1,y1; uint16_t w,h;
    display.setTextSize(1);
    display.getTextBounds("AP", 0, 0, &x1, &y1, &w, &h);

    // Compute top-left cursor so that the text bounding box center == (cx, centerY)
    int x = cx - (int)w/2 - x1;
    int y = centerY - (int)h/2 - y1;

    // Clear only the needed bounding area (slight padding)
    int clearX = x + x1 - 1;
    int clearY = y + y1 - 1;
    int clearW = (int)w + 2;
    int clearH = (int)h + 2;
    display.fillRect(clearX, clearY, clearW, clearH, SH110X_BLACK);

    display.setCursor(x, y);
    display.print("AP");
  } else {
    // Wi-Fi bars placed near battery on the right, with a small gap
    // Battery spans roughly x=109..126, so place Wi-Fi ending before x~109
    drawWifiIcon(95, 8, wifiOK);
  }

  // Battery icon at top-right
  int level = batteryLevelFromVoltage(vbat);
  drawBatteryIcon(127-18, 1, level);

  // Separator line
  display.drawLine(0,10,127,10,SH110X_WHITE);
}
void drawCenterLarge(const String& label, const String& value){
  display.setTextSize(1);
  display.setCursor(0,16);
  display.print(label);
  display.setTextSize(2);
  int16_t x1,y1; uint16_t w,h;
  display.getTextBounds(value,0,0,&x1,&y1,&w,&h);
  int x = max(0,(int)(64 - w/2));
  display.setCursor(x,28);
  display.print(value);
}
void updateDisplay(float t,float h,float p,float vbat,int aqi){
  DateTime now=rtc.now();
  // Partial clear: content area only (keep top bar to reduce flicker)
  display.fillRect(0, 11, 128, 64-11, SH110X_BLACK);
  bool wifiOK = (WiFi.status() == WL_CONNECTED);
  topBar(now, vbat, wifiOK);
  switch(uiMode){
    case 0: drawCenterLarge("AQI",            (aqi>=0?String(aqi):"N/A")); break;
    case 1: drawCenterLarge("Temp (C)",       isfinite(t)?String(t,2):"N/A"); break;
    case 2: drawCenterLarge("Humidity (%)",   isfinite(h)?String(h,2):"N/A"); break;
    case 3: drawCenterLarge("Pressure (hPa)", isfinite(p)?String(p/100.0,2):"N/A"); break;
    case 4: drawCenterLarge("PM1.0",          String(last_pm1)); break;
    case 5: drawCenterLarge("PM2.5",          String(last_pm25)); break;
    case 6: drawCenterLarge("PM10",           String(last_pm10)); break;
  }
  display.display();
}

// ---------- Splash ----------
bool splashActive = true;
uint8_t splashPhase = 0;      // 0:fade-in 1:hold 2:fade-out 3:done
int splashStep = 0;
unsigned long splashNextMs = 0;
const char* SPLASH_TOP = "The Forecaster 2";
const char* SPLASH_BOT = "[Pocket Edition]";

void drawSplashFrame(int step){
  int yTop = map(step, 0, 12, -20, 18);
  int yBot = map(step, 0, 12, 70, 46);
  uint8_t contrast = map(step, 0, 12, 0, 127);

  display.clearDisplay();
  sh110x_setContrast(contrast);

  display.setTextSize(1,2);
  int16_t x1,y1; uint16_t w,h;
  display.getTextBounds(SPLASH_TOP,0,0,&x1,&y1,&w,&h);
  int x = max(0,(int)(64 - w/2));
  display.setCursor(x, yTop);
  display.print(SPLASH_TOP);

  display.setTextSize(1);
  drawCentered(SPLASH_BOT, yBot, 1);
  display.display();
}
bool updateSplash(){
  if(!splashActive) return false;
  unsigned long now = millis();
  if(now < splashNextMs) return false;

  if(splashPhase==0){
    drawSplashFrame(splashStep++);
    if(splashStep <= 12) splashNextMs = now + 40;
    else { splashPhase=1; splashNextMs = now + 5000; }
    return false;
  }
  if(splashPhase==1){
    splashPhase=2; splashStep=7; splashNextMs = now + 20;
    return false;
  }
  if(splashPhase==2){
    sh110x_setContrast(splashStep*16);
    splashStep--;
    splashNextMs = now + 20;
    if(splashStep >= 0) return false;
    display.clearDisplay(); display.display();
    sh110x_setContrast(127);
    splashPhase=3; splashActive=false;
    return true;
  }
  return false;
}

// ---------- WiFi/MQTT ----------
static String wifiReasonToStr(uint8_t r){
  switch(r){
    case 1: return "UNSPECIFIED";
    case 2: return "AUTH_EXPIRE";
    case 3: return "AUTH_LEAVE";
    case 4: return "ASSOC_EXPIRE";
    case 5: return "ASSOC_TOOMANY";
    case 6: return "NOT_AUTHED";
    case 7: return "NOT_ASSOCED";
    case 8: return "ASSOC_LEAVE";
    case 9: return "ASSOC_NOT_AUTHED";
    case 15: return "4WAY_HANDSHAKE_TIMEOUT";
    case 17: return "AP_NOT_FOUND";
    case 202: return "BEACON_TIMEOUT";
    default: return String(r);
  }
}

// ---- HTTP OTA (URL from NVS: sys/ota) ----
// ดึงเฟิร์มแวร์ผ่าน HTTP URL (เก็บใน NVS: sys/ota) แล้วแฟลช OTA แบบสตรีม
static void doHttpOta(){
  screenOnNow(60000);
  display.clearDisplay();
  topBar(rtc.now(), vbat_cached, (WiFi.status() == WL_CONNECTED));
  drawFirmwareStatus(String("Updating..."));

  if(WiFi.status() != WL_CONNECTED){
    delay(500);
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, false);
    drawFirmwareStatus(String("WiFi required"));
    delay(2000);
    return;
  }
  if(otaUrl.length() == 0){
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("No Firmware URL"));
    delay(2000);
    return;
  }

  HTTPClient http;
  http.setTimeout(60000); // tolerate slower networks
#ifdef HTTPC_STRICT_FOLLOW_REDIRECTS
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
#endif
  // Guard against localhost/loopback
  {
    String u = otaUrl; u.toLowerCase();
    if (u.indexOf("://localhost") > 0 || u.indexOf("://127.0.0.1") > 0) {
      publishDebug(String("{\"event\":\"ota_bad_host\",\"url\":\"") + otaUrl + "\",\"id\":\""+clientId+"\"}", false);
      display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
      drawFirmwareStatus(String("Bad URL host"));
      delay(2000);
      return;
    }
  }
  publishDebug(String("{\"event\":\"ota_start\",\"url_len\":")+String(otaUrl.length())+",\"id\":\""+clientId+"\"}", false);
  if(!http.begin(otaUrl)){
    publishDebug(String("{\"event\":\"ota_begin_fail\",\"reason\":\"url_bad\",\"id\":\""+clientId+"\"}"), false);
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("URL invalid"));
    delay(2000);
    return;
  }
  int code = http.GET();
  if(code != HTTP_CODE_OK){
    publishDebug(String("{\"event\":\"ota_http\",\"code\":")+String(code)+",\"id\":\""+clientId+"\"}", false);
    http.end();
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("HTTP ") + String(code));
    delay(2000);
    return;
  }
  int len = http.getSize();
  WiFiClient * stream = http.getStreamPtr();
  if(!Update.begin(len > 0 ? (size_t)len : UPDATE_SIZE_UNKNOWN)){
    publishDebug(String("{\"event\":\"ota_begin_fail\",\"reason\":\"update_begin\",\"id\":\""+clientId+"\"}"), false);
    http.end();
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("Begin failed"));
    delay(2000);
    return;
  }
  // Stream OTA in chunks and animate LEDs: red -> yellow -> green cycling
  uint8_t buf[1024];
  size_t written = 0;
  unsigned long lastAnim = millis();
  uint8_t step = 0;
  auto animate = [&](){
    if(step==0) setLeds(true,false,false);
    else if(step==1) setLeds(false,true,false);
    else setLeds(false,false,true);
    step = (step+1)%3;
  };

  while(true){
    // Keep MQTT alive during OTA to minimize LWT flicker
    if (mqtt.connected()) mqtt.loop();

    int avail = stream->available();
    if(avail > 0){
      int toRead = avail;
      if(toRead > (int)sizeof(buf)) toRead = sizeof(buf);
      int rd = stream->readBytes((char*)buf, toRead);
      if(rd <= 0) break;
      size_t w = Update.write(buf, (size_t)rd);
      if(w != (size_t)rd){
        publishDebug(String("{\"event\":\"ota_write_mismatch\",\"rd\":")+String(rd)+",\"w\":"+String((unsigned long)w)+",\"id\":\""+clientId+"\"}", false);
        http.end();
        Update.abort();
        setLeds(false,false,false);
        display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
        drawFirmwareStatus(String("Write failed"));
        delay(2000);
        return;
      }
      written += (size_t)rd;
    } else {
      // No data available; check if complete
      if(len > 0 && written >= (size_t)len) break;
      if(!http.connected()) break;
      delay(2);
    }
    // LED chase every ~120 ms
    if(millis() - lastAnim >= 120){ animate(); lastAnim = millis(); }
    delay(0);
  }
  bool ok = Update.end();
  setLeds(false,false,false);
  http.end();

  if(ok && Update.isFinished()){
    publishDebug(String("{\"event\":\"ota_ok\",\"bytes\":")
                 + String((unsigned long)written)
                 + ",\"id\":\"" + clientId + "\""
                 + ",\"fw\":\"" + String(FW_VER) + "\"}", false);
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("Update Successful"));
    delay(600);
    ESP.restart();
  }else{
    // Provide error code for diagnostics if available
    uint8_t e = Update.getError();
    const char* es = "UNKNOWN";
    switch(e){
      case 0: es = "OK"; break;
      case 1: es = "WRITE"; break;
      case 2: es = "ERASE"; break;
      case 3: es = "READ"; break;
      case 4: es = "SPACE"; break;
      case 5: es = "SIZE"; break;
      case 6: es = "STREAM"; break;
      case 7: es = "MD5"; break;
      case 8: es = "MAGIC_BYTE"; break;
      case 9: es = "ACTIVATE"; break;
      case 10: es = "NO_PARTITION"; break;
      case 11: es = "BAD_ARGUMENT"; break;
      case 12: es = "ABORT"; break;
    }
    String js = String("{\"event\":\"ota_fail\",\"bytes\":") + String((unsigned long)written)
              + ",\"code\":" + String((unsigned long)e)
              + ",\"err\":\"" + es + "\""
              + ",\"id\":\"" + clientId + "\"}";
    publishDebug(js, false);
    display.clearDisplay(); topBar(rtc.now(), vbat_cached, true);
    drawFirmwareStatus(String("Update Failed"));
    delay(2000);
  }
}

#if defined(ARDUINO_ARCH_ESP32)
static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info){
  switch(event){
    default: {
      String js = String("{\"event\":\"wifi_event\",\"code\":") + String((int)event) + "}";
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#if defined(ARDUINO_EVENT_WIFI_AP_START)
    case ARDUINO_EVENT_WIFI_AP_START: {
      String js = String("{\"event\":\"ap_start\",\"ssid\":\"") + apSsid + "\"}";
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_AP_STOP)
    case ARDUINO_EVENT_WIFI_AP_STOP: {
      String js = String("{\"event\":\"ap_stop\"}");
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_AP_STACONNECTED)
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED: {
      String js = String("{\"event\":\"ap_sta_join\"}");
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_AP_STADISCONNECTED)
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED: {
      String js = String("{\"event\":\"ap_sta_leave\"}");
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_STA_CONNECTED)
    case ARDUINO_EVENT_WIFI_STA_CONNECTED: {
      String js = "{\"event\":\"wifi_connected\"}";
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_STA_GOT_IP)
    case ARDUINO_EVENT_WIFI_STA_GOT_IP: {
      String js = "{\"event\":\"wifi_got_ip\"}";
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
      // Start mDNS service with project hostname
      if(mdnsHost.length()>0){
        MDNS.end();
        if(MDNS.begin(mdnsHost.c_str())){
          MDNS.addService("http","tcp",80);
        }
      }
    } break;
#endif
#if defined(ARDUINO_EVENT_WIFI_STA_DISCONNECTED)
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
      uint8_t reason = info.wifi_sta_disconnected.reason;
      String js = String("{\"event\":\"wifi_disconnected\",\"reason\":\"") + wifiReasonToStr(reason) + "\"}";
      Serial.println(js);
      if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, js.c_str(), false);
      // Stop mDNS when disconnected
      MDNS.end();
    } break;
#endif
  }
}
#endif
void ensureWiFi(){
  if(runMode == MODE_AP_CONFIG){
    return; // AP config mode does not attempt STA
  }
  if(WiFi.status()==WL_CONNECTED){
    wifiAttempting = false;
    return;
  }
  // If no stored credentials, switch to AP mode
  if(wifiSsid.length()==0){
    // Do not auto-start AP; user must trigger AP manually
    return;
  }
  // Begin a non-blocking attempt if not already trying
  if(!wifiAttempting){
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
    wifiAttemptStart = millis();
    wifiAttempting = true;
    return;
  }
  // Check timeout
  if(wifiAttempting && millis() - wifiAttemptStart > WIFI_CONNECT_TIMEOUT_MS){
    // Failed to connect within window -> stay in normal mode, do not auto-open AP
    WiFi.disconnect(true);
    wifiAttempting = false;
  }
}

void onMqtt(char* topic, byte* payload, unsigned int length){
  // LWT guard
  if(strcmp(topic, LWT_TOPIC) == 0){
    if(length==6 && memcmp(payload,"online",6)==0){
      statusConfirmed = true;
    }else{
      mqtt.publish(LWT_TOPIC, "online", true);
      lastStatusPub = millis();
    }
    return;
  }

  // Web presence: เปิด/ปิดการส่งข้อมูลตามสถานะหน้าเว็บที่ retained (online/offline)
  if (strcmp(topic, WEB_STATUS) == 0) {
    if (length == 6 && memcmp(payload, "online", 6) == 0) {
      webOnline = true;
      publishEnabled = true;            // enable publishing when web app is online
      Serial.println("WEB_STATUS=online -> publish ON");
    } else if (length == 7 && memcmp(payload, "offline", 7) == 0) {
      webOnline = false;
      publishEnabled = false;           // disable publishing when web app is offline
      Serial.println("WEB_STATUS=offline -> publish OFF");
    }
    return;
  }

  // Commands
  String msg; msg.reserve(length);
  for(unsigned int i=0;i<length;++i) msg += (char)payload[i];

  if(strcmp(topic,SUB_TIME)==0){
    uint32_t ts=strtoul(msg.c_str(),nullptr,10);
    if(ts>1600000000UL) rtc.adjust(DateTime(ts + tzOffset));
  }else if(strcmp(topic,SUB_INTERVAL)==0){
    uint32_t ms=strtoul(msg.c_str(),nullptr,10);
    if(ms<500) ms=500; if(ms>600000) ms=600000;
    pubInterval=ms;
  }else if(strcmp(topic,SUB_OTA_URL)==0 || (subOtaUrlDev.length()>0 && strcmp(topic, subOtaUrlDev.c_str())==0)){
    // Save OTA URL to NVS (sys/ota)
    prefs.begin("sys", false);
    prefs.putString("ota", msg);
    prefs.end();
    otaUrl = msg;
    publishDebug(String("{\"event\":\"ota_url_set\",\"len\":")+String(msg.length())+",\"id\":\""+clientId+"\"}", false);
  }else if(strcmp(topic,SUB_OTA_NOW)==0 || (subOtaNowDev.length()>0 && strcmp(topic, subOtaNowDev.c_str())==0)){
    // Start OTA immediately if payload signals start (and URL already set)
    String m = msg; m.trim(); m.toLowerCase();
    // Support combined form: "host:port/path.bin/start" (http prefix optional)
    int startPos = m.indexOf("/start");
    if(startPos > 0){
      String base = msg.substring(0, startPos); // keep original case for safety
      base.trim();
      String url = base;
      // Prefix http:// if not provided
      String lower = base; lower.toLowerCase();
      if(!(lower.startsWith("http://") || lower.startsWith("https://"))){
        url = String("http://") + base;
      }
      prefs.begin("sys", false);
      prefs.putString("ota", url);
      prefs.end();
      otaUrl = url;
      publishDebug(String("{\"event\":\"ota_url_set\",\"len\":")+String(url.length())+",\"id\":\""+clientId+"\"}", false);
      doHttpOta();
    } else if(m=="1" || m=="start" || m=="go"){
      doHttpOta();
    } else if(m.startsWith("http://") || m.startsWith("https://")){
      // Allow sending URL directly to start
      prefs.begin("sys", false);
      prefs.putString("ota", msg);
      prefs.end();
      otaUrl = msg;
      publishDebug(String("{\"event\":\"ota_url_set\",\"len\":")+String(msg.length())+",\"id\":\""+clientId+"\"}", false);
      doHttpOta();
    }
  }
  last_cmd_ms=millis();
  publishEnabled=true;
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
}

// MQTT reconnect with backoff + jitter
unsigned long mqttNextAttemptAt = 0;
unsigned long mqttBackoffMs = 1000; // start 1s, cap 60s
bool wasMqttConnected = false;
bool bootDebugSent = false;

static void publishDebug(const String& msg, bool retained){
  Serial.println(msg);
  if(mqtt.connected()) mqtt.publish(DEBUG_TOPIC, msg.c_str(), retained);
}

void ensureMqtt(){
  if(mqtt.connected()){
    if(!wasMqttConnected){ wasMqttConnected = true; mqttBackoffMs = 1000; }
    return;
  }
  if(millis() < mqttNextAttemptAt) return;
  bool ok = mqtt.connect(clientId.c_str(), nullptr, nullptr, LWT_TOPIC, 0, true, "offline");
  if(ok){
    // Subscribe commands with QoS1 if supported
    mqtt.subscribe(SUB_TIME,1);
    mqtt.subscribe(SUB_INTERVAL,1);
    mqtt.subscribe(SUB_OTA_URL,1);
    mqtt.subscribe(SUB_OTA_NOW,1);
    // Per-device OTA topics
    if(subOtaUrlDev.length()>0) mqtt.subscribe(subOtaUrlDev.c_str(),1);
    if(subOtaNowDev.length()>0) mqtt.subscribe(subOtaNowDev.c_str(),1);
    mqtt.subscribe(LWT_TOPIC,1);
    mqtt.subscribe(WEB_STATUS,1);
    mqtt.publish(LWT_TOPIC,"online",true);
    lastStatusPub = millis();
    statusConfirmed = false;
    wasMqttConnected = true;
    mqttBackoffMs = 1000; mqttNextAttemptAt = 0;
  }else{
    wasMqttConnected = false;
    if(mqttBackoffMs < 60000UL) mqttBackoffMs *= 2; if(mqttBackoffMs > 60000UL) mqttBackoffMs = 60000UL;
    mqttNextAttemptAt = millis() + mqttBackoffMs + (unsigned long)random(0,500);
  }
}

// ---------- ISR ----------
void IRAM_ATTR onWake(){ wakeIRQ=true; }

// ---------- Setup / Loop ----------
void setup(){
  Serial.begin(115200);
  Wire.begin(SDA_PIN,SCL_PIN);
  initDisplay();
  sh110x_cmd(0xAF);
  sh110x_setContrast(0);
  splashActive=true; splashPhase=0; splashStep=0; splashNextMs=millis();

  if(!sht31.begin(0x44)) Serial.println("SHT31 not found");
  if(!bmp.begin(0x76) && !bmp.begin(0x77)) Serial.println("BMP280 not found");
  if(!rtc.begin()){ Serial.println("RTC not found"); while(1); }
  if(rtc.lostPower()) rtc.adjust(DateTime(2025,1,1,0,0,0));

  PMS.begin(9600, SERIAL_8N1, PMS_RX, PMS_TX);
  pmsWakeAndActive();
  lastPmsKickMs = millis();

  pinMode(BTN_WAKE, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BTN_WAKE), onWake, FALLING);
  pinMode(PIN_VBAT, INPUT);
  analogSetPinAttenuation(PIN_VBAT, ADC_11db);

  // Initial low-battery check on power-up: show warning, then deep sleep
  vbat_cached = readVBat();
  lastVbatSample = millis();
  if (isfinite(vbat_cached) && vbat_cached < 3.30f) {
    display.clearDisplay();
    topBar(rtc.now(), vbat_cached, (WiFi.status() == WL_CONNECTED));
    drawCenteredTall(String("LOW BATTERY"), 24);
    display.display();
    delay(2500);
    sh110x_cmd(0xAE); // display off
    delay(50);
    esp_deep_sleep_start();
  }

  screenOnNow(30000);

  // Stable, project-scoped clientId from MAC: TFCT_2_PE-<mac12>
  uint64_t mac = ESP.getEfuseMac();
  auto hex2 = [](uint8_t b)->String{ String s = String(b, HEX); if(s.length()<2) s = String("0") + s; return s; };
  String mac12 = hex2((mac >> 40) & 0xFF) + hex2((mac >> 32) & 0xFF) + hex2((mac >> 24) & 0xFF)
               + hex2((mac >> 16) & 0xFF) + hex2((mac >> 8) & 0xFF)  + hex2(mac & 0xFF);
  mac12.toLowerCase();
  clientId = String("TFCT_2_PE-") + mac12;
  pubTopic = String(PUB_TOPIC) + "/" + clientId;
  // Per-device command topics
  subOtaUrlDev = String("TFCT_2_PE/cmd/") + clientId + "/ota_url";
  subOtaNowDev = String("TFCT_2_PE/cmd/") + clientId + "/ota_now";

  // Derived IDs for branding and discovery
  String last4 = mac12.substring(8);
  String last4Upper = last4; last4Upper.toUpperCase();
  apSsid = String("TFCT_2_PE-") + last4Upper;
  mdnsHost = String("tfct2pe-") + last4; // mDNS host: lowercase, no underscore

  // Seed RNG for MQTT backoff jitter
  randomSeed((uint32_t)micros() ^ (uint32_t)mac);

  // Load Wi-Fi credentials from NVS (if any)
  prefs.begin("wifi", true);
  wifiSsid = prefs.getString("ssid", "");
  wifiPass = prefs.getString("pass", "");
  prefs.end();

#if defined(ARDUINO_ARCH_ESP32)
  // Wi-Fi event logging (debug only)
  WiFi.onEvent(onWiFiEvent);
#endif

  // Load TZ offset (seconds) from NVS (namespace 'sys', key 'tz')
  prefs.begin("sys", true);
  tzOffset = prefs.getInt("tz", DEFAULT_TZ_OFFSET);
  otaUrl = prefs.getString("ota", "");
  prefs.end();

  // LEDs
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  allLedsOff();

  // If no saved credentials, go AP mode immediately
  if(wifiSsid.length()==0){
    startAP();
  } else {
    ensureWiFi();
  }
  // MQTT: ตั้งค่า broker และตั้งค่า keepalive สั้นเพื่อให้ LWT ทำงานไวเมื่อเครือข่ายหลุด
  mqtt.setServer(MQTT_HOST,MQTT_PORT);
  mqtt.setKeepAlive(20);             // broker can assert LWT faster on disconnect
  mqtt.setCallback(onMqtt);
  ensureMqtt();

  last_cmd_ms = millis();
}

void loop(){
  ensureWiFi();
  if(runMode != MODE_AP_CONFIG){
    ensureMqtt();
    mqtt.loop();
    if(mqtt.connected() && !bootDebugSent){
      String js = "{\"event\":\"boot\",";
      js += "\"fw\":\"" + String(FW_VER) + "\",";
      js += "\"build\":\"" + String(__DATE__) + " " + String(__TIME__) + "\",";
      js += "\"mac\":\"" + clientId + "\",";
      js += "\"heap\":" + String(ESP.getFreeHeap()) + ",";
      js += "\"uptime_ms\":" + String(millis());
      js += "}";
      publishDebug(js, false);
      bootDebugSent = true;
    }
  }

  bool splashDoneNow = updateSplash();
  if(splashDoneNow){
    uiMode = 0;
    screenOnNow(30000);
    forceSample = true;
  }

  // Button: long press (>=10s) to HTTP OTA, (>=5s) to enter AP config
  bool btnDown = (digitalRead(BTN_WAKE)==LOW);
  if(btnDown && !btnWasDown){ btnDownAt = millis(); longPressHandled=false; }
  // Prefer 10s OTA over 5s AP if both thresholds pass
  if(btnDown && !longPressHandled && millis() - btnDownAt >= 10000){
    doHttpOta();
    longPressHandled = true;
    wakeIRQ = false;
  } else if(btnDown && !longPressHandled && millis() - btnDownAt >= 5000){
    // Enter AP mode
    startAP();
    longPressHandled = true;
    wakeIRQ = false; // swallow short-press action
  }
  if(!btnDown && btnWasDown){
    // Release-to-accept: treat short press only on release
    unsigned long nowms = millis();
    bool acceptShort = !longPressHandled
                       && (nowms - btnDownAt >= SHORT_PRESS_MIN_MS)
                       && (nowms - lastBtnAt > BTN_DEBOUNCE_MS);
    if(acceptShort){
      lastBtnAt = nowms;
      if(!screenOn){
        screenOnNow(30000);
        forceSample = true;
      }else{
        uiMode = (uiMode+1)%7;
        screenOnNow(30000);
        forceSample = true;
      }
    }
    // Clear any pending edge IRQ
    wakeIRQ = false;
  }
  btnWasDown = btnDown;

  // Keep the screen ON while showing Wi-Fi connect/fail overlays
  if(screenOn && millis()>screenOffAt){
    if(connectingOverlay || failOverlay){
      // Extend a bit to prevent auto-off during overlays
      screenOffAt = millis() + 500;
    } else {
      screenOffNow();
    }
  }

  // In AP mode, handle web server and blink LEDs together each 300ms
  if(runMode == MODE_AP_CONFIG){
    // While AP is in connect workflow, keep screen alive continuously
    if(apConnState==1 || apConnState==2){
      // Push the off timer forward every loop (soft keep-alive)
      screenOn = true;
      screenOffAt = millis() + 1000; // extend 1s continuously
    }
    // Captive portal DNS + HTTP handling while in AP mode
    dnsServer.processNextRequest();
    server.handleClient();
    // AP async connect workflow
    if(apConnState==1){
      // Requested -> begin connect
      WiFi.mode(WIFI_AP_STA);
      WiFi.begin(apReqSsid.c_str(), apReqPass.c_str());
      apConnStartMs = millis();
      apConnState = 2;
    } else if(apConnState==2){
      if(WiFi.status()==WL_CONNECTED){
        // Save credentials and schedule reboot
        prefs.begin("wifi", false);
        prefs.putString("ssid", apReqSsid);
        prefs.putString("pass", apReqPass);
        prefs.end();
        apConnState = 3;
        apRestartAt = millis() + 1200;
      } else if(millis() - apConnStartMs > WIFI_CONNECT_TIMEOUT_MS){
        WiFi.disconnect(true);
        WiFi.mode(WIFI_AP);
        apConnState = 4; // failed
        // OLED fail overlay
        display.clearDisplay();
        topBar(rtc.now(), vbat_cached, (WiFi.status() == WL_CONNECTED));
        drawCenteredTall(String("Connect failed"), 24);
        display.display();
        // Ensure screen stays on long enough to see the message
        screenOn = true;
        screenOffAt = millis() + 3000; // hold for 3s minimum
        connectingOverlay = false;
        failOverlay = true;
        failOverlayUntil = millis() + 2000;
      }
    } else if(apConnState==3 && apRestartAt && millis() > apRestartAt){
      ESP.restart();
    }
    if(millis() - apBlinkAt >= 300){
      apBlinkAt = millis();
      apBlinkOn = !apBlinkOn;
      setLeds(apBlinkOn, apBlinkOn, apBlinkOn);
    }
    // Auto-close AP timers:
    unsigned long nowms = millis();
    // 3 minutes with no clients connected -> close AP
    if(nowms - apStartedAt >= 180000UL && WiFi.softAPgetStationNum() == 0){
      stopAP();
    }
    // 5 minutes without a successful form submission -> close AP
    unsigned long base = (apLastSubmitAt != 0) ? apLastSubmitAt : apStartedAt;
    if(nowms - base >= 300000UL){
      stopAP();
    }
  }

  // PMS keep-alive (works regardless of Wi-Fi/AP)
  ensurePMSAlive();

  // PMS read -> update UI
  uint16_t pm1r,pm25r,pm10r;
  if(readPMS(pm1r,pm25r,pm10r)){
    if(!(pm1r==0 && pm25r==0 && pm10r==0)){
      last_pm1=pm1r; last_pm25=pm25r; last_pm10=pm10r; last_ok_ms=millis();
      pm_seen = true;
      lastPmsRxMs = millis();
      lastAQI = calcAQI((float)last_pm25,(float)last_pm10);
      if(screenOn && !splashActive && !connectingOverlay && !failOverlay){
        if(uiMode==0 || (uiMode>=4 && uiMode<=6)){
          updateDisplay(t,h,p,vbat_cached,lastAQI);
        }
        // Update LEDs based on AQI in normal mode
        updateAQILeds(lastAQI);
      }
    }
  }

  // Periodic battery sampling (independent of display refresh)
  if (!isfinite(vbat_cached) || millis() - lastVbatSample >= VBAT_SAMPLE_MS) {
    float vb = readVBat();
    vbat_cached = vb;
    lastVbatSample = millis();

    // Low battery handling: warn and power off if < 3.30 V
    if (isfinite(vb) && vb < 3.30f) {
      if (screenOn) {
        display.clearDisplay();
        topBar(rtc.now(), vb, (WiFi.status() == WL_CONNECTED));
        drawCenteredTall(String("LOW BATTERY"), 24);
        display.display();
        delay(2500);
      }
      if (mqtt.connected()) {
        mqtt.publish(LWT_TOPIC, "offline", true);
        mqtt.disconnect();
      }
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      sh110x_cmd(0xAE);
      delay(50);
      esp_deep_sleep_start();
    }
  }

  // Env sensors sample on schedule (independent of screen/overlays)
  if (forceSample || millis() - lastEnvSample >= ENV_SAMPLE_MS) {
    lastEnvSample = millis();

    // Read env sensors
    t = sht31.readTemperature();
    h = sht31.readHumidity();
    p = bmp.readPressure();

    // Maintain EMA for display/MQTT
    const float ALPHA = 0.3f;
    if (isfinite(t)) {
      if (!isfinite(t_ema)) t_ema = t; else t_ema = t_ema + ALPHA * (t - t_ema);
    }
    if (isfinite(h)) {
      if (!isfinite(h_ema)) h_ema = h; else h_ema = h_ema + ALPHA * (h - h_ema);
    }
  }

  // Sensor + UI refresh each 1s
  // Expire overlays and handle transitions
  if(connectingOverlay && millis() > connectingOverlayUntil) connectingOverlay = false;
  if(failOverlay && millis() > failOverlayUntil){
    failOverlay = false;
    // After showing failure message, exit AP mode back to normal sensor UI
    if(runMode == MODE_AP_CONFIG){
      stopAP();
      uiMode = 0;               // back to AQI page
      screenOnNow(30000);       // start normal 30s timeout from now
      forceSample = true;       // refresh UI immediately
    }
  }

  if(screenOn && (forceSample || millis()-lastDisplaySample >= DISPLAY_SAMPLE_MS) && !splashActive && !connectingOverlay && !failOverlay){
    lastDisplaySample = millis();
    forceSample=false;

    float t_disp = isfinite(t_ema) ? t_ema : t;
    float h_disp = isfinite(h_ema) ? h_ema : h;

    updateDisplay(t_disp,h_disp,p,vbat_cached,lastAQI);
    updateAQILeds(lastAQI);

    if(!firstAqiShown && uiMode==0) firstAqiShown = true;
  }

  // Publish only when web is online
  static unsigned long lastPub=0;
  // Publish only when web is online/enabled; sensors update regardless of screen state
  bool timeToPublish = (runMode != MODE_AP_CONFIG)
                    && publishEnabled
                    && webOnline
                    && !splashActive
                    && (millis()-lastPub >= pubInterval);
  if(timeToPublish){
    if(!mqtt.connected()) ensureMqtt();
    lastPub=millis();

    String json="{";
    json+="\"id\":\""; json+=clientId; json+="\",";
    json+="\"fw\":\""; json+=FW_VER; json+="\",";
    json+="\"aqi\":";  json+=(lastAQI>=0?String(lastAQI):"null"); json+=",";
    json+="\"t\":";    json+= isfinite(t_ema)?String(t_ema,2):(isfinite(t)?String(t,2):"null"); json+=",";
    json+="\"h\":";    json+= isfinite(h_ema)?String(h_ema,2):(isfinite(h)?String(h,2):"null"); json+=",";
    json+="\"p\":";    json+= isfinite(p)?String(p/100.0,2):"null";           json+=",";
    json+="\"vbat\":"; json+= isfinite(vbat_cached)?String(vbat_cached,1):"null"; json+=",";
    json+="\"pm1\":";  json+= pm_seen?String(last_pm1):"null";                json+=",";
    json+="\"pm25\":"; json+= pm_seen?String(last_pm25):"null";               json+=",";
    json+="\"pm10\":"; json+= pm_seen?String(last_pm10):"null";
    json+="}";
    mqtt.publish(pubTopic.c_str(), json.c_str(), false);
    Serial.println(json);
  }

  // Re-assert "online" until retained confirmed
  if(mqtt.connected() && !statusConfirmed && millis() - lastStatusPub > 3000){
    mqtt.publish(LWT_TOPIC, "online", true);
    lastStatusPub = millis();
  }
}
