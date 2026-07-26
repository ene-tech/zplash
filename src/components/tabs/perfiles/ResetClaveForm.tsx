"use client";

import { useRef, useState } from "react";
import type { PerfilPublico } from "@/types";

export function ResetClaveForm({
  perfil,
  actorId,
  onListo,
}: {
  perfil: PerfilPublico;
  actorId: string | null;
  onListo: () => void;
}) {
  const nuevaClaveRef = useRef<HTMLInputElement>(null);
  const actorClaveRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const claveNueva = nuevaClaveRef.current?.value || "";
    const actorClaveActual = actorClaveRef.current?.value || "";
    if (!actorId) return;
    if (claveNueva.length < 6) {
      setMsg({ texto: "La nueva contraseña debe tener al menos 6 caracteres", ok: false });
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/perfiles/cambiar-clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, actorClaveActual, objetivoId: perfil.id, claveNueva }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setMsg({ texto: json.error || "No se pudo cambiar la contraseña", ok: false });
        return;
      }
      setMsg({ texto: `Contraseña de ${perfil.nombre} actualizada correctamente`, ok: true });
      setTimeout(onListo, 1200);
    } catch {
      setMsg({ texto: "No se pudo cambiar la contraseña (sin conexión). Intenta de nuevo.", ok: false });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", padding: "10px 0" }}>
      <div className="field" style={{ margin: 0 }}>
        <label>Nueva contraseña de {perfil.nombre}</label>
        <input ref={nuevaClaveRef} type="password" maxLength={12} />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Tu contraseña (para confirmar)</label>
        <input ref={actorClaveRef} type="password" maxLength={12} />
      </div>
      <button className="btn" style={{ marginTop: 0 }} onClick={enviar} disabled={enviando}>
        {enviando ? "Guardando..." : "Guardar"}
      </button>
      {msg && (
        <div className="err" style={{ color: msg.ok ? "var(--green)" : undefined, width: "100%" }}>
          {msg.texto}
        </div>
      )}
    </div>
  );
}
