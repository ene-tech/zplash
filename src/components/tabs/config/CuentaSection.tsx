"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { KeyRound } from "lucide-react";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function CuentaSection() {
  const { ui } = useApp();
  const curPinRef = useRef<HTMLInputElement>(null);
  const newPinRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const savePin = async () => {
    const cur = curPinRef.current?.value || "";
    const nw = newPinRef.current?.value || "";
    if (!ui.perfilActual) return;
    if (!nw || nw.length < 6) {
      setMsg({ texto: "La nueva contraseña debe tener al menos 6 caracteres", ok: false });
      return;
    }
    setGuardando(true);
    const res = await fetch("/api/perfiles/cambiar-clave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorId: ui.perfilActual.id,
        actorClaveActual: cur,
        objetivoId: ui.perfilActual.id,
        claveNueva: nw,
      }),
    });
    const json = await res.json();
    setGuardando(false);
    if (!res.ok || !json.ok) {
      setMsg({ texto: json.error || "No se pudo cambiar la contraseña", ok: false });
      return;
    }
    setMsg({ texto: "Contraseña actualizada correctamente", ok: true });
    if (curPinRef.current) curPinRef.current.value = "";
    if (newPinRef.current) newPinRef.current.value = "";
  };

  return (
    <ConfigSection title={`Mi cuenta — ${ui.perfilActual?.nombre || ""}`} icon={KeyRound}>
      <div className="field" style={{ margin: 0 }}>
        <label>Contraseña actual</label>
        <input ref={curPinRef} type="password" />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Contraseña nueva</label>
        <input ref={newPinRef} type="password" maxLength={12} />
      </div>
      <SaveBar saving={guardando} msg={msg} onSave={savePin} />
    </ConfigSection>
  );
}
