import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import mqtt, { MqttClient } from "mqtt";

// PresenceManager
// - ประกาศสถานะหน้าเว็บไปยัง MQTT ด้วย retained message (TFCT_2_PE/web/status)
// - online เฉพาะเมื่อ path เป็น "/dashboard"; หน้าที่อื่นเป็น offline
// - ESP32 ใช้สถานะนี้เป็นเงื่อนไขเปิด/ปิดการ publish ข้อมูล
// - ตั้ง Last Will เป็น offline เพื่อให้ broker ตั้งค่าอัตโนมัติเมื่อเบราว์เซอร์ปิดโดยไม่ปกติ
const PresenceManager = () => {
  const location = useLocation();
  const clientRef = useRef<MqttClient | null>(null);
  const unloadedRef = useRef(false);

  // สร้าง MQTT client ฝั่งเว็บ + ตั้งค่า LWT เป็น offline (retain)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const clientId = `web-${Math.random().toString(16).slice(2, 10)}`;
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
      clientId,
      reconnectPeriod: 1000,
      clean: true,
      will: {
        topic: "TFCT_2_PE/web/status",
        payload: "offline",
        qos: 0,
        retain: true,
      },
    });
    clientRef.current = client;

    const publishOffline = () => client.publish("TFCT_2_PE/web/status", "offline", { retain: true });
    const publishOnline = () => client.publish("TFCT_2_PE/web/status", "online", { retain: true });

    client.on("connect", () => {
      // เริ่มต้นตั้งค่าเป็น offline ก่อน แล้วค่อย online เมื่ออยู่หน้า /dashboard
      publishOffline();
      if (window.location.pathname === "/dashboard") publishOnline();
    });
    client.on("reconnect", publishOffline);

    const handleUnload = () => {
      if (unloadedRef.current) return;
      unloadedRef.current = true;
      try { client.publish("TFCT_2_PE/web/status", "offline", { retain: true }); } catch {}
      client.end(true);
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      handleUnload();
    };
  }, []);

  // เปลี่ยนสถานะตาม path: online เฉพาะ /dashboard, นอกนั้น offline
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    const publish = (payload: "online" | "offline") => client.publish("TFCT_2_PE/web/status", payload, { retain: true });
    publish(location.pathname === "/dashboard" ? "online" : "offline");
  }, [location.pathname]);

  return null;
};

export default PresenceManager;

