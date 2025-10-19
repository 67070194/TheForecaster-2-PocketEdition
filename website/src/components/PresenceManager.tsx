import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import mqtt, { MqttClient } from "mqtt";
import { getApiBase, getFwBase } from "@/lib/runtimeConfig";

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
      const base = (function(){
        let b = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        if (!b.startsWith("/")) b = "/";
        return b;
      })();
      const p = window.location.pathname || "/";
      const normalized = p.startsWith(base) ? (p.slice(base.length) || "/") : p;
      if (normalized === "/dashboard") publishOnline();

      // Publish current API/FW base (if any) as shared config for other clients
      try {
        const apiStored = (() => { try { return localStorage.getItem('tfct.apiBase') || ''; } catch { return ''; } })();
        const fwStored  = (() => { try { return localStorage.getItem('tfct.fwBase')  || ''; } catch { return ''; } })();
        const api = (apiStored || getApiBase() || '').replace(/\/$/, '');
        const fw  = (fwStored  || getFwBase()  || '').replace(/\/$/, '');
        const cfg: any = {};
        if (api && /^https?:\/\//i.test(api)) cfg.api = api;
        if (fw && /^https?:\/\//i.test(fw)) cfg.fw = fw;
        if (Object.keys(cfg).length > 0) {
          client.publish("TFCT_2_PE/web/config", JSON.stringify(cfg), { retain: true });
        }
      } catch {}

      // Subscribe for shared config updates (retained)
      try { client.subscribe("TFCT_2_PE/web/config", { qos: 0 }); } catch {}
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

  // Listen for shared config and always track latest (override if changed)
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    const onMessage = (topic: string, payload: Buffer) => {
      if (topic !== "TFCT_2_PE/web/config") return;
      try {
        const j = JSON.parse(payload.toString() || '{}');
        const api = (j?.api && String(j.api).replace(/\/$/, '')) || '';
        const fw  = (j?.fw  && String(j.fw).replace(/\/$/, '')) || '';
        let changed = false;
        try {
          const curApi = localStorage.getItem('tfct.apiBase') || '';
          const curFw  = localStorage.getItem('tfct.fwBase')  || '';
          if (api && api !== curApi) { localStorage.setItem('tfct.apiBase', api); changed = true; }
          if (fw  && fw  !== curFw)  { localStorage.setItem('tfct.fwBase',  fw );  changed = true; }
        } catch {}
        if (changed) {
          // Reload to pick up new backend base; URL stays clean
          window.location.reload();
        }
      } catch {}
    };
    client.on('message', onMessage);
    return () => { try { client.off('message', onMessage as any); } catch {} };
  }, []);

  // เปลี่ยนสถานะตาม path: online เฉพาะ /dashboard, นอกนั้น offline
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;
    const publish = (payload: "online" | "offline") => client.publish("TFCT_2_PE/web/status", payload, { retain: true });
    const base = (function(){
      let b = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      if (!b.startsWith("/")) b = "/";
      return b;
    })();
    const p = location.pathname || "/";
    const normalized = p.startsWith(base) ? (p.slice(base.length) || "/") : p;
    publish(normalized === "/dashboard" ? "online" : "offline");
  }, [location.pathname]);

  return null;
};

export default PresenceManager;

