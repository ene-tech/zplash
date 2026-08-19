"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { alertaMantencionStatus, fmtFecha, mantencionStatus } from "@/lib/helpers";
import type { Maquinaria } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import PlanMantencionPanel from "@/components/modals/PlanMantencionPanel";
import { Wrench } from "lucide-react";

// La ficha lee la Maquinaria "en vivo" desde el contexto (en vez de quedarse
// con el snapshot que llegó al abrir el modal) para que el estado/historial
// mostrados abajo reflejen de inmediato el plan recién guardado, mismo patrón
// que ClienteInfoModal lee appData en vez de solo la prop `data`.
export default function MaquinariaFichaModal({ data: maquinariaInicial }: { data: Maquinaria }) {
  const { data, patchUi } = useApp();
  const maquinaria = data.maquinarias.find((m) => m.id === maquinariaInicial.id) || maquinariaInicial;

  const cerrar = () => patchUi({ modal: null });

  const registros = useMemo(
    () =>
      data.registrosMantencion
        .filter((r) => r.maquinariaId === maquinaria.id)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [data.registrosMantencion, maquinaria.id]
  );

  // Solo lectura acá: agendar/cancelar/completar una alerta se hace desde la
  // pestaña Alertas de Mantención, que ve todas las máquinas a la vez.
  const alertasPendientes = useMemo(
    () =>
      data.alertasMantencion
        .filter((a) => a.maquinariaId === maquinaria.id && a.estado === "pendiente")
        .sort((a, b) => (a.fechaObjetivo < b.fechaObjetivo ? -1 : 1)),
    [data.alertasMantencion, maquinaria.id]
  );

  const status = useMemo(
    () => mantencionStatus(maquinaria, data.planesMantencion, data.registrosMantencion, data.ingresos),
    [maquinaria, data.planesMantencion, data.registrosMantencion, data.ingresos]
  );

  const planNombre = (planId?: string) =>
    planId ? data.planesMantencion.find((p) => p.id === planId)?.descripcion : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {maquinaria.nombre}
            {[maquinaria.zona, maquinaria.tipo].filter(Boolean).length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                {" — "}
                {[maquinaria.zona, maquinaria.tipo].filter(Boolean).join(" · ")}
              </span>
            )}
            {status && <span className={`status-pill ${status.cls} ml-2`}>{status.label}</span>}
          </DialogTitle>
        </DialogHeader>

        <PlanMantencionPanel maquinaria={maquinaria} />

        {alertasPendientes.length > 0 && (
          <div className="border-t border-border pt-3.5">
            <h4 className="mb-2 text-sm font-semibold">Próximas alertas</h4>
            <ul className="grid gap-1.5 text-sm">
              {alertasPendientes.map((a) => {
                const status = alertaMantencionStatus(a);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span className="truncate" title={a.descripcion}>
                      {a.descripcion}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      {fmtFecha(a.fechaObjetivo)}
                      <span className={`status-pill ${status.cls}`}>{status.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="border-t border-border pt-3.5">
          <h4 className="mb-2 text-sm font-semibold">Historial de mantenciones</h4>
          {registros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay mantenciones registradas para esta máquina.</p>
          ) : (
            <>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
                {registros.map((r) => (
                  <MobileRecordCard
                    key={r.id}
                    avatar={<MobileRecordAvatar icon={Wrench} />}
                    title={r.descripcion}
                    subtitle={planNombre(r.planId) || r.responsable || "Sin responsable"}
                    meta={
                      <MobileRecordMeta
                        left={fmtFecha(r.fecha)}
                        right={r.costo != null ? `$${r.costo.toLocaleString("es-CL")}` : undefined}
                      />
                    }
                  />
                ))}
              </div>
              <div className="table-scroll hidden max-h-64 overflow-y-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Del plan</TableHead>
                      <TableHead>Vehículos desde última</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registros.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{fmtFecha(r.fecha)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={r.descripcion}>
                          {r.descripcion}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate" title={planNombre(r.planId) || ""}>
                          {planNombre(r.planId) || "-"}
                        </TableCell>
                        <TableCell>{r.vehiculosDesdeUltima}</TableCell>
                        <TableCell>{r.responsable || "-"}</TableCell>
                        <TableCell>{r.costo != null ? `$${r.costo.toLocaleString("es-CL")}` : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
