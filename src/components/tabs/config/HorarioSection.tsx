"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { todayYMD } from "@/lib/helpers";
import type { ConfigGlobal } from "@/types";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

export default function HorarioSection() {
  const { data, commit } = useAppData();
  const [cfg, setCfg] = useState<ConfigGlobal>(data.config);
  const festivoRef = useRef<HTMLInputElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const campo = (k: keyof Omit<ConfigGlobal, "festivos">, v: string) => setCfg((c) => ({ ...c, [k]: v }));

  const agregarFestivo = () => {
    const fecha = festivoRef.current?.value;
    if (!fecha || cfg.festivos.includes(fecha)) return;
    setCfg((c) => ({ ...c, festivos: [...c.festivos, fecha].sort() }));
    if (festivoRef.current) festivoRef.current.value = "";
  };

  const quitarFestivo = (fecha: string) => {
    setCfg((c) => ({ ...c, festivos: c.festivos.filter((f) => f !== fecha) }));
  };

  const guardar = async () => {
    if (
      cfg.horarioOperadorSemanaInicio >= cfg.horarioOperadorSemanaFin ||
      cfg.horarioOperadorFindeInicio >= cfg.horarioOperadorFindeFin
    ) {
      setMsg({ texto: "La hora de inicio debe ser anterior a la hora de fin", ok: false });
      return;
    }
    setGuardando(true);
    const ok = await commit({ config: cfg });
    setGuardando(false);
    setMsg({
      texto: ok ? "Horario guardado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.",
      ok,
    });
  };

  return (
    <ConfigSection
      title="Horario de registro — Operador"
      icon={Clock}
      description="Fuera de este horario, un operador estándar no puede registrar el ingreso de un vehículo. Administración y Gerencia no tienen esta restricción."
    >
      <div>
        <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
          Lunes a viernes
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="time"
            value={cfg.horarioOperadorSemanaInicio}
            onChange={(e) => campo("horarioOperadorSemanaInicio", e.target.value)}
            style={{ width: 130 }}
          />
          <span style={{ color: "var(--gray)" }}>a</span>
          <input
            type="time"
            value={cfg.horarioOperadorSemanaFin}
            onChange={(e) => campo("horarioOperadorSemanaFin", e.target.value)}
            style={{ width: 130 }}
          />
        </div>
      </div>

      <div>
        <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
          Sábado, domingo y festivos
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="time"
            value={cfg.horarioOperadorFindeInicio}
            onChange={(e) => campo("horarioOperadorFindeInicio", e.target.value)}
            style={{ width: 130 }}
          />
          <span style={{ color: "var(--gray)" }}>a</span>
          <input
            type="time"
            value={cfg.horarioOperadorFindeFin}
            onChange={(e) => campo("horarioOperadorFindeFin", e.target.value)}
            style={{ width: 130 }}
          />
        </div>
      </div>

      <div>
        <div className="hint" style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}>
          Festivos
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input ref={festivoRef} type="date" min={todayYMD()} />
          <Button variant="ghost" size="sm" onClick={agregarFestivo}>
            + Agregar festivo
          </Button>
        </div>
        {cfg.festivos.length > 0 && (
          <div>
            {cfg.festivos.map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}>{f}</div>
                <button className="icon-btn" onClick={() => quitarFestivo(f)}>
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <SaveBar saving={guardando} msg={msg} onSave={guardar} label="Guardar horario" />
    </ConfigSection>
  );
}
