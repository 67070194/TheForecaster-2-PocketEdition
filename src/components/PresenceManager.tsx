import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import mqtt from "mqtt";

const PresenceManager = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const clientId = `web-${Math.random().toString(16).slice(2, 10)}`;
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
      clientId,
      reconnectPeriod: 1000,
      clean: true,
      will: {
        topic: "kuytoojung/web/status",
        payload: "offline",
        qos: 0,
        retain: true,
      },
    });

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let hasUnloaded = false;

    const publishOnline = () =>
      client.publish("kuytoojung/web/status", "online", { retain: true });

    const sendHeartbeat = () =>
      client.publish("kuytoojung/web/ping", "1");

    const startHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(sendHeartbeat, 20000);
      sendHeartbeat();
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    client.on("connect", () => {
      publishOnline();
      // เริ่ม ping เฉพาะเมื่ออยู่หน้า dashboard
      if (location.pathname === "/dashboard") startHeartbeat();
    });

    client.on("reconnect", () => {
      publishOnline();
      if (location.pathname === "/dashboard") startHeartbeat();
    });

    client.on("close", stopHeartbeat);
    client.on("offline", stopHeartbeat);

    const publishOffline = () =>
      client.publish("kuytoojung/web/status", "offline", { retain: true });

    const handleUnload = () => {
      if (hasUnloaded) return;
      hasUnloaded = true;
      stopHeartbeat();
      try {
        publishOffline();
      } catch (error) {
        console.error("Failed to publish offline status", error);
      }
      client.end(true);
    };

    // ถ้าเปลี่ยนหน้า ไม่ใช่ dashboard ให้หยุด ping
    if (location.pathname !== "/dashboard") {
      stopHeartbeat();
    }

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      handleUnload();
    };
  }, [location.pathname]); // run effect เมื่อเปลี่ยนหน้า

  return null;
};

export default PresenceManager;
