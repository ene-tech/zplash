"use client";

import { useMemo } from "react";
import { useAppData } from "@/context/AppContext";
import { fmtFecha, planMantencionStatus } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

/** Mantenciones del plan (ficha de cada máquina) que ya están vencidas o
 * entran en su ventana de aviso — el recordatorio para comprar repuestos
 * antes de que toque. No son filas guardadas: se calculan en vivo desde los
 * planes y la bitácora, así que no hay nada que "cerrar" acá; se apagan solas
 * al registrar la mantención en la pestaña Registros. */
export function PlanesPorVencerTabla() {
  const { data } = useAppData();

  const filas = useMemo(() => {
    const activas = new Set(data.maquinarias.filter((m) => m.activo).map((m) => m.id));
    return data.planesMantencion
      .filter((p) => p.activo && activas.has(p.maquinariaId))
      .map((p) => ({ plan: p, status: planMantencionStatus(p, data.registrosMantencion, data.ingresos) }))
      .filter((f) => f.status && f.status.cls !== "ok")
      .sort((a, b) => (a.status!.cls === b.status!.cls ? 0 : a.status!.cls === "bad" ? -1 : 1));
  }, [data.planesMantencion, data.maquinarias, data.registrosMantencion, data.ingresos]);

  if (filas.length === 0) return null;

  const maquinaria = (id: string) => data.maquinarias.find((m) => m.id === id);

  return (
    <div style={{ marginTop: 22 }}>
      <h4 style={{ marginBottom: 8 }}>Mantenciones del plan por hacer ({filas.length})</h4>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 10 }}>
        Salen del plan de cada máquina (ver su ficha) y se apagan solas al registrar la mantención. Compra los
        repuestos antes de que venzan.
      </div>
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Máquina</TableHead>
              <TableHead>Mantención</TableHead>
              <TableHead>Repuestos</TableHead>
              <TableHead>Falta</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ plan, status }) => {
              const m = maquinaria(plan.maquinariaId);
              return (
                <TableRow key={plan.id}>
                  <TableCell className="whitespace-nowrap">
                    {m?.nombre || "(máquina eliminada)"}
                    {m?.zona && <span className="ml-1 text-xs text-muted-foreground">· {m.zona}</span>}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={plan.descripcion}>
                    {plan.descripcion}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={plan.repuestos || ""}>
                    {plan.repuestos || "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {status!.proximaFecha
                      ? `${status!.diasRestantes} días (${fmtFecha(status!.proximaFecha)})`
                      : `${status!.conteoRestante} lavados (${status!.conteoActual}/${status!.conteoObjetivo})`}
                  </TableCell>
                  <TableCell>
                    <span className={`status-pill ${status!.cls}`}>{status!.label}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
