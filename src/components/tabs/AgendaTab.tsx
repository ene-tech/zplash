"use client";

import { useState } from "react";
import { CalendarCheck, Wrench, Clock } from "lucide-react";
import { CitasDelDia } from "@/components/tabs/agenda/CitasDelDia";
import { ServiciosCatalogo } from "@/components/tabs/agenda/ServiciosCatalogo";
import { HorarioSemanal } from "@/components/tabs/agenda/HorarioSemanal";
import { BloqueosPuntuales } from "@/components/tabs/agenda/BloqueosPuntuales";

export default function AgendaTab() {
  const [seccion, setSeccion] = useState<"citas" | "servicios" | "horario">("citas");

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 20 }}>
        <div className={`tab ${seccion === "citas" ? "active" : ""}`} onClick={() => setSeccion("citas")} title="Citas">
          <CalendarCheck />
          <span className="tab-label">Citas</span>
        </div>
        <div className={`tab ${seccion === "servicios" ? "active" : ""}`} onClick={() => setSeccion("servicios")} title="Servicios">
          <Wrench />
          <span className="tab-label">Servicios</span>
        </div>
        <div className={`tab ${seccion === "horario" ? "active" : ""}`} onClick={() => setSeccion("horario")} title="Horario y bloqueos">
          <Clock />
          <span className="tab-label">Horario y bloqueos</span>
        </div>
      </div>

      {seccion === "citas" && <CitasDelDia />}
      {seccion === "servicios" && <ServiciosCatalogo />}
      {seccion === "horario" && (
        <>
          <HorarioSemanal />
          <BloqueosPuntuales />
        </>
      )}
    </div>
  );
}
