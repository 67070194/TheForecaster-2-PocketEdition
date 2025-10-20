import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import mqtt, { MqttClient } from "mqtt";

// PresenceManager
// - Announces web dashboard presence to MQTT (TFCT_2_PE/web/status)
// - "online" when on /dashboard; "offline" otherwise
// - ESP32 can use this to enable/disable data publishing
// - Sets Last Will & Testament to auto-publish "offline" if browser closes unexpectedly
//
// Note: MQTT config distribution removed - API URL now hardcoded at build time
const PresenceManager = () => {
  const location = useLocation();
  const clientRef = useRef<MqttClient | null>(null);
  const unloadedRef = useRef(false);

  // Create MQTT client with Last Will & Testament
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

    // Publish presence status on connect
    client.on("connect", () => {
      const base = (function(){
        let b = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
        if (!b.startsWith("/")) b = "/";
        return b;
      })();
      const p = window.location.pathname || "/";
      const normalized = p.startsWith(base) ? (p.slice(base.length) || "/") : p;

      if (normalized === "/dashboard") {
        publishOnline();
      } else {
        publishOffline();
      }
    });

    client.on("reconnect", publishOffline);

    // Handle browser close/tab close
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

  // Update presence based on current route
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const publish = (payload: "online" | "offline") => {
      client.publish("TFCT_2_PE/web/status", payload, { retain: true });
    };

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
