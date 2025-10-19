import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import mqtt, { MqttClient } from "mqtt";
import { getApiBase, getFwBase } from "@/lib/runtimeConfig";

// PresenceManager
// - à¸›à¸£à¸°à¸à¸²à¸¨à¸ªà¸–à¸²à¸™à¸°à¸«à¸™à¹‰à¸²à¹€à¸§à¹‡à¸šà¹„à¸›à¸¢à¸±à¸‡ MQTT à¸”à¹‰à¸§à¸¢ retained message (TFCT_2_PE/web/status)
// - online à¹€à¸‰à¸žà¸²à¸°à¹€à¸¡à¸·à¹ˆà¸­ path à¹€à¸›à¹‡à¸™ "/dashboard"; à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆà¸­à¸·à¹ˆà¸™à¹€à¸›à¹‡à¸™ offline
// - ESP32 à¹ƒà¸Šà¹‰à¸ªà¸–à¸²à¸™à¸°à¸™à¸µà¹‰à¹€à¸›à¹‡à¸™à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¹€à¸›à¸´à¸”/à¸›à¸´à¸”à¸à¸²à¸£ publish à¸‚à¹‰à¸­à¸¡à¸¹à¸¥
// - à¸•à¸±à¹‰à¸‡ Last Will à¹€à¸›à¹‡à¸™ offline à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰ broker à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¸­à¸±à¸•à¹‚à¸™à¸¡à¸±à¸•à¸´à¹€à¸¡à¸·à¹ˆà¸­à¹€à¸šà¸£à¸²à¸§à¹Œà¹€à¸‹à¸­à¸£à¹Œà¸›à¸´à¸”à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸›à¸à¸•à¸´
const PresenceManager = () => {
  const location = useLocation();
  const clientRef = useRef<MqttClient | null>(null);
  const unloadedRef = useRef(false);

  // à¸ªà¸£à¹‰à¸²à¸‡ MQTT client à¸à¸±à¹ˆà¸‡à¹€à¸§à¹‡à¸š + à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² LWT à¹€à¸›à¹‡à¸™ offline (retain)
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
      // à¹€à¸£à¸´à¹ˆà¸¡à¸•à¹‰à¸™à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸²à¹€à¸›à¹‡à¸™ offline à¸à¹ˆà¸­à¸™ à¹à¸¥à¹‰à¸§à¸„à¹ˆà¸­à¸¢ online à¹€à¸¡à¸·à¹ˆà¸­à¸­à¸¢à¸¹à¹ˆà¸«à¸™à¹‰à¸² /dashboard
      publishOffline();
      const base = (function(){
        let b = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        if (!b.startsWith("/")) b = "/";
        return b;
      })();
      const p = window.location.pathname || "/";
      const normalized = p.startsWith(base) ? (p.slice(base.length) || "/") : p;
      if (normalized === "/dashboard") publishOnline();

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

  // à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¸ªà¸–à¸²à¸™à¸°à¸•à¸²à¸¡ path: online à¹€à¸‰à¸žà¸²à¸° /dashboard, à¸™à¸­à¸à¸™à¸±à¹‰à¸™ offline
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


