import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import mqtt, { MqttClient } from "mqtt";

const PresenceManager = () => {
  const location = useLocation();
  const clientRef = useRef<MqttClient | null>(null);
  const unloadedRef = useRef(false);

  // สร้าง MQTT client ครั้งเดียว
  useEffect(() => {
    if (typeof window === "undefined") return;

    const clientId = `web-${Math.random().toString(16).slice(2, 10)}`;
    const client = mqtt.connect("wss://broker.hivemq.com:8884/mqtt", {
      clientId,
      reconnectPeriod: 1000,
      clean: true,
      will: {
        topic: "the_Forecaster_2_pocket_edition/web/status",
        payload: "offline",
        qos: 0,
        retain: true,
      },
    });
    clientRef.current = client;

    // เริ่มต้นสถานะเป็น offline
    const publishOffline = () =>
      client.publish("the_Forecaster_2_pocket_edition/web/status", "offline", { retain: true });

    const publishOnline = () =>
      client.publish("the_Forecaster_2_pocket_edition/web/status", "online", { retain: true });

    client.on("connect", () => {
      publishOffline(); // ส่ง offline ทันทีเมื่อเชื่อมต่อครั้งแรก
      // ถ้าเปิดมาที่ dashboard ให้ส่ง online ต่อทันที
      if (window.location.pathname === "/dashboard") publishOnline();
    });

    client.on("reconnect", publishOffline);

    const handleUnload = () => {
      if (unloadedRef.current) return;
      unloadedRef.current = true;
      try {
        client.publish("the_Forecaster_2_pocket_edition/web/status", "offline", { retain: true });
      } catch {}
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

  // สลับ online/offline ตาม path
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const publish = (payload: "online" | "offline") =>
      client.publish("the_Forecaster_2_pocket_edition/web/status", payload, { retain: true });

    if (location.pathname === "/dashboard") {
      publish("online");
    } else {
      publish("offline");
    }
  }, [location.pathname]);

  return null;
};

export default PresenceManager;
