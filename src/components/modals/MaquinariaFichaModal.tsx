"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { alertaMantencionStatus, fmtFecha, mantencionStatus } from "@/lib/helpers";
import type { Maquinaria, PeriodicidadMantencionTipo } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Wrench } from "lucide-react";

const SIN_PERIODICIDAD = "sin-periodicidad";
type ModoPeriodicidad = PeriodicidadMantencionTipo | typeof SIN_PERIODICIDAD;

// La ficha lee la Maquinaria "en vivo" desde el contexto (en vez de quedarse
// con el snapshot que llegó al abrir el modal) para que el estado/historial
// mostrados abajo reflejen de inmediato la periodicidad recién guardada,
// mismo patrón que ClienteInfoModal lee appData en vez de solo la prop `data`.
export default function MaquinariaFichaModal({ data: maquinariaInicial }: { data: Maquinaria }) {
  const { data, commit, patchUi } = useApp();
  const maquinaria = data.maquinarias.find((m) => m.id === maquinariaInicial.id) || maquinariaInicial;

  const [modo, setModo] = useState<ModoPeriodicidad>(maquinaria.periodicidadTipo || SIN_PERIODICIDAD);
  const [intervaloDias, setIntervaloDias] = useState(maquinaria.intervaloDias ? String(maquinaria.intervaloDias) : "");
  const [intervaloLavados, setIntervaloLavados] = useState(maquinaria.intervaloLavados ? String(maquinaria.intervaloLavados) : "");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

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
    () => mantencionStatus(maquinaria, data.registrosMantencion, data.ingresos),
    [maquinaria, data.registrosMantencion, data.ingresos]
  );

  const guardar = async () => {
    if (modo === "fecha" && (!intervaloDias.trim() || Number(intervaloDias) <= 0)) {
      setErr({ msg: "Ingresa cada cuántos días se debe mantener esta máquina", ok: false });
      return;
    }
    if (modo === "conteo" && (!intervaloLavados.trim() || Number(intervaloLavados) <= 0)) {
      setErr({ msg: "Ingresa cada cuántos lavados se debe mantener esta máquina", ok: false });
      return;
    }
    const actualizada: Maquinaria = {
      ...maquinaria,
      periodicidadTipo: modo === SIN_PERIODICIDAD ? undefined : modo,
      intervaloDias: modo === "fecha" ? Number(intervaloDias) : undefined,
      intervaloLavados: modo === "conteo" ? Number(intervaloLavados) : undefined,
    };
    const ok = await commit({ maquinarias: data.maquinarias.map((m) => (m.id === maquinaria.id ? actualizada : m)) });
    setErr(
      ok
        ? { msg: "Periodicidad guardada correctamente", ok: true }
        : { msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {maquinaria.nombre}
            {maquinaria.tipo && <span className="text-sm font-normal text-muted-foreground"> — {maquinaria.tipo}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Periodicidad de mantención</Label>
            <Select value={modo} onValueChange={(v) => v && setModo(v as ModoPeriodicidad)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PERIODICIDAD}>Sin periodicidad</SelectItem>
                <SelectItem value="fecha">Por fecha (cada X días)</SelectItem>
                <SelectItem value="conteo">Por lavados (cada X vehículos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modo === "fecha" && (
            <div className="grid gap-1.5">
              <Label htmlFor="ficha-dias">Cada cuántos días</Label>
              <Input
                id="ficha-dias"
                type="number"
                min={1}
                value={intervaloDias}
                onChange={(e) => setIntervaloDias(e.target.value)}
                placeholder="Ej: 90"
              />
            </div>
          )}
          {modo === "conteo" && (
            <div className="grid gap-1.5">
              <Label htmlFor="ficha-lavados">Cada cuántos lavados (vehículos ingresados)</Label>
              <Input
                id="ficha-lavados"
                type="number"
                min={1}
                value={intervaloLavados}
                onChange={(e) => setIntervaloLavados(e.target.value)}
                placeholder="Ej: 500"
              />
            </div>
          )}
          {err && <p className={`text-sm ${err.ok ? "text-[color:var(--green)]" : "text-destructive"}`}>{err.msg}</p>}
          <Button onClick={guardar} className="justify-self-start">
            Guardar periodicidad
          </Button>
        </div>

        {status && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-border pt-3.5 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Estado</div>
              <div className="font-medium">
                <span className={`status-pill ${status.cls}`}>{status.label}</span>
              </div>
            </div>
            {status.proximaFecha && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Próxima mantención</div>
                <div className="font-medium">{fmtFecha(status.proximaFecha)}</div>
              </div>
            )}
            {status.conteoObjetivo != null && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Lavados desde la última</div>
                <div className="font-medium">
                  {status.conteoActual} / {status.conteoObjetivo}
                </div>
              </div>
            )}
          </div>
        )}

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

        <div>
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
                    subtitle={r.responsable || "Sin responsable"}
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
