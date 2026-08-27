"use client";

import { useAppData } from "@/context/AppContext";
import { todayStr } from "@/lib/helpers";

export default function TodayLog() {
  const { data } = useAppData();
  const hoy = todayStr();
  const list = data.ingresos
    .filter((i) => new Date(i.fecha).toDateString() === hoy)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 10);

  if (list.length === 0) {
    return <div className="empty">Aún no hay ingresos registrados hoy</div>;
  }

  return (
    <>
      {list.map((i) => (
        <div className="log-row" key={i.id}>
          <span className="plate">{i.patente}</span>
          <span>
            {i.nombre}
            {i.esGarantia && (
              <span className="status-pill warn" style={{ marginLeft: 8 }}>
                Garantía
              </span>
            )}
          </span>
          <span>{new Date(i.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      ))}
    </>
  );
}
