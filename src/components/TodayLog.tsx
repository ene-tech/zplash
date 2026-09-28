"use client";

import { useAppData } from "@/context/AppContext";
import { fmtCLP, tipoIngreso, todayStr, ventaLavadoUnicoDeIngreso } from "@/lib/helpers";
import type { Ingreso } from "@/types/ingresos";
import type { Venta } from "@/types/ventas";

// Un ingreso sin plan vigente no siempre es $9.990: el lavado único pudo
// cobrarse con un cupón de descuento (queda en la Venta, no en el Ingreso),
// o no tener venta asociada. Se muestra lo que efectivamente se cobró.
function etiqueta(i: Ingreso, ventas: Venta[]): { label: string; cls: "ok" | "warn" | "bad" } {
  if (i.viaCupon) return { label: i.cuponCodigo ? `Cupón ${i.cuponCodigo}` : "Cupón", cls: "warn" };
  if (i.glosa || i.esGarantia) return tipoIngreso(i);
  if (i.planEstadoAlIngreso !== "bad") return { label: "Plan", cls: "ok" };
  const venta = ventaLavadoUnicoDeIngreso(ventas, i);
  if (!venta) return { label: "Sin cobro registrado", cls: "warn" };
  if (venta.viaCupon) return { label: `${fmtCLP(venta.precio)} · cupón ${venta.cuponCodigo || ""}`.trim(), cls: "warn" };
  return { label: fmtCLP(venta.precio), cls: "bad" };
}

export default function TodayLog() {
  const { data } = useAppData();
  const hoy = todayStr();
  const list = data.ingresos
    .filter((i) => new Date(i.fecha).toDateString() === hoy)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 20);

  if (list.length === 0) {
    return <div className="empty">Aún no hay ingresos registrados hoy</div>;
  }

  return (
    <>
      {list.map((i) => {
        const tipo = etiqueta(i, data.ventas);
        return (
          <div className="log-row" key={i.id}>
            <span className="plate">{i.patente}</span>
            <span>
              {i.nombre}
              <span className={`status-pill ${tipo.cls}`} style={{ marginLeft: 8 }}>
                {tipo.label}
              </span>
            </span>
            <span>{new Date(i.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        );
      })}
    </>
  );
}
