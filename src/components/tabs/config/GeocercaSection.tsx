"use client";

import { useState } from "react";
import { useAppData } from "@/context/AppContext";
import { MapPin } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

// Zona que vigila la app nativa para el descuento al pasar cerca (ver
// /api/app/geocerca). El monto, los días sin venir y el texto viven en la
// regla "cerca_local" de Reglas WhatsApp; acá solo dónde y qué tan grande.
// Las coordenadas son las mismas que usa el libro de asistencia.
export default function GeocercaSection() {
  const { data, commit } = useAppData();
  const [latTexto, setLatTexto] = useState(() => (data.config.localLat == null ? "" : String(data.config.localLat)));
  const [lngTexto, setLngTexto] = useState(() => (data.config.localLng == null ? "" : String(data.config.localLng)));
  const [radioTexto, setRadioTexto] = useState(() => String(data.config.geocercaRadioMetros));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    // Acepta lo que copia Google Maps al hacer clic derecho: "-33.45, -70.66".
    let lat = latTexto.trim();
    let lng = lngTexto.trim();
    if (lat.includes(",") && !lng) [lat, lng] = lat.split(",").map((s) => s.trim());
    const localLat = lat ? Number(lat) : undefined;
    const localLng = lng ? Number(lng) : undefined;
    if ((localLat !== undefined && (!Number.isFinite(localLat) || Math.abs(localLat) > 90)) || (localLng !== undefined && (!Number.isFinite(localLng) || Math.abs(localLng) > 180))) {
      setMsg({ texto: "Coordenadas inválidas", ok: false });
      return;
    }
    const geocercaRadioMetros = Math.min(5000, Math.max(100, Number(radioTexto) || 0));
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, localLat, localLng, geocercaRadioMetros } });
    setGuardando(false);
    if (ok) {
      setLatTexto(localLat === undefined ? "" : String(localLat));
      setLngTexto(localLng === undefined ? "" : String(localLng));
      setRadioTexto(String(geocercaRadioMetros));
    }
    setMsg({ texto: ok ? "Cambio guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="App: descuento al pasar cerca"
      icon={MapPin}
      description="El teléfono con la app instalada (y permiso de ubicación) avisa cuando entra a esta zona alrededor del local. Si corresponde, le llega el descuento de la regla «Cliente con la app pasa cerca del local» (Reglas WhatsApp, canal Notificación de la app): ahí se definen el monto, los días sin venir y el texto."
    >
      <div className="field" style={{ margin: 0 }}>
        <label>Latitud del local</label>
        <input value={latTexto} onChange={(e) => setLatTexto(e.target.value)} placeholder="Ej: -33.4372" style={{ width: 200 }} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Longitud del local</label>
        <input value={lngTexto} onChange={(e) => setLngTexto(e.target.value)} placeholder="Ej: -70.6506" style={{ width: 200 }} />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
          En Google Maps, clic derecho sobre el local y clic en los números: se copian las dos juntas y se pueden pegar en
          Latitud. También las usa el libro de asistencia.
        </div>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Radio de la zona (metros)</label>
        <input type="number" min={100} max={5000} step={50} value={radioTexto} onChange={(e) => setRadioTexto(e.target.value)} style={{ width: 120 }} />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
          Bajo 150 m el teléfono no lo detecta bien. En auto, con 200 m el aviso llega cuando ya pasó: 400–500 m le da
          tiempo de doblar. Los teléfonos toman el cambio la próxima vez que abren la app.
        </div>
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={guardar} />
    </ConfigSection>
  );
}
