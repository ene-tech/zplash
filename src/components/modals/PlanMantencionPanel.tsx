"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtFecha, planMantencionStatus, todayYMD, uid } from "@/lib/helpers";
import type { Maquinaria, PeriodicidadMantencionTipo, PlanMantencion } from "@/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const VACIO = {
  descripcion: "",
  repuestos: "",
  modo: "fecha" as PeriodicidadMantencionTipo,
  intervalo: "",
  aviso: "",
  // Arranque con la máquina ya andando: cuándo se hizo por última vez y
  // cuántos lavados lleva desde entonces. Ver PlanMantencion.ultimaVezEn.
  ultimaVez: "",
  lavadosPrevios: "",
};

/** Planilla de mantenciones que requiere una máquina (ficha de máquina): cada
 * fila es una tarea con sus repuestos, cada cuánto toca (días o lavados) y con
 * cuánta anticipación avisar para alcanzar a comprar los repuestos. El estado
 * se calcula en vivo con planMantencionStatus — el mismo form sirve para
 * agregar y para editar (editandoId), así corregir un intervalo no obliga a
 * borrar la tarea y perder el vínculo con su historial. */
export default function PlanMantencionPanel({ maquinaria }: { maquinaria: Maquinaria }) {
  const { data, ui, commit } = useApp();
  const [form, setForm] = useState(VACIO);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const planes = useMemo(
    () =>
      data.planesMantencion
        .filter((p) => p.maquinariaId === maquinaria.id)
        .sort((a, b) => a.descripcion.localeCompare(b.descripcion)),
    [data.planesMantencion, maquinaria.id]
  );

  const limpiar = () => {
    setForm(VACIO);
    setEditandoId(null);
  };

  const editar = (p: PlanMantencion) => {
    setEditandoId(p.id);
    setErr(null);
    setForm({
      descripcion: p.descripcion,
      repuestos: p.repuestos || "",
      modo: p.periodicidadTipo,
      intervalo: String((p.periodicidadTipo === "fecha" ? p.intervaloDias : p.intervaloLavados) ?? ""),
      aviso: String((p.periodicidadTipo === "fecha" ? p.avisoDias : p.avisoLavados) ?? ""),
      ultimaVez: p.ultimaVezEn ? p.ultimaVezEn.slice(0, 10) : "",
      lavadosPrevios: String(p.lavadosPrevios ?? ""),
    });
  };

  const guardar = async () => {
    if (!form.descripcion.trim()) {
      setErr({ msg: "Describe la mantención (ej: cambio de escobillas)", ok: false });
      return;
    }
    const intervalo = Number(form.intervalo);
    if (!form.intervalo.trim() || Number.isNaN(intervalo) || intervalo <= 0) {
      setErr({
        msg: form.modo === "fecha" ? "Ingresa cada cuántos días toca" : "Ingresa cada cuántos lavados toca",
        ok: false,
      });
      return;
    }
    const aviso = form.aviso.trim() ? Number(form.aviso) : undefined;
    if (aviso !== undefined && (Number.isNaN(aviso) || aviso < 0)) {
      setErr({ msg: "La anticipación del aviso debe ser un número válido", ok: false });
      return;
    }
    const lavadosPrevios = form.lavadosPrevios.trim() ? Number(form.lavadosPrevios) : undefined;
    if (lavadosPrevios !== undefined && (Number.isNaN(lavadosPrevios) || lavadosPrevios < 0)) {
      setErr({ msg: "Los lavados que ya lleva deben ser un número válido", ok: false });
      return;
    }
    const anterior = editandoId ? planes.find((p) => p.id === editandoId) : undefined;
    const plan: PlanMantencion = {
      id: anterior?.id || uid(),
      maquinariaId: maquinaria.id,
      descripcion: form.descripcion.trim(),
      repuestos: form.repuestos.trim() || undefined,
      periodicidadTipo: form.modo,
      intervaloDias: form.modo === "fecha" ? intervalo : undefined,
      intervaloLavados: form.modo === "conteo" ? intervalo : undefined,
      avisoDias: form.modo === "fecha" ? aviso : undefined,
      avisoLavados: form.modo === "conteo" ? aviso : undefined,
      ultimaVezEn: form.ultimaVez || undefined,
      lavadosPrevios: form.modo === "conteo" ? lavadosPrevios : undefined,
      activo: anterior?.activo ?? true,
      creadoEn: anterior?.creadoEn || new Date().toISOString(),
      creadoPor: anterior?.creadoPor || ui.perfilActual?.nombre || undefined,
    };
    const siguientes = anterior
      ? data.planesMantencion.map((p) => (p.id === plan.id ? plan : p))
      : [...data.planesMantencion, plan];
    const ok = await commit({ planesMantencion: siguientes });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: anterior ? "Mantención actualizada" : "Mantención agregada al plan", ok: true });
    limpiar();
  };

  const borrar = async (plan: PlanMantencion) => {
    const ok = await commit({ planesMantencion: data.planesMantencion.filter((p) => p.id !== plan.id) });
    setErr(
      ok
        ? { msg: "Mantención quitada del plan (su historial se mantiene)", ok: true }
        : { msg: "No se pudo borrar", ok: false }
    );
    if (ok && editandoId === plan.id) limpiar();
  };

  const unidad = form.modo === "fecha" ? "días" : "lavados";

  return (
    <div className="border-t border-border pt-3.5">
      <h4 className="mb-2 text-sm font-semibold">Plan de mantención</h4>
      <p className="mb-3 text-sm text-muted-foreground">
        Todas las mantenciones que requiere esta máquina, con sus repuestos. Cada una avisa sola cuando quedan pocos
        días o lavados, para alcanzar a comprar los repuestos antes.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="plan-desc">Mantención</Label>
          <Input
            id="plan-desc"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Ej: Cambio de escobillas del cepillo lateral"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="plan-repuestos">Repuestos</Label>
          <Input
            id="plan-repuestos"
            value={form.repuestos}
            onChange={(e) => setForm({ ...form, repuestos: e.target.value })}
            placeholder="Ej: 2 escobillas PVC 60cm, 1 rodamiento 6204"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Se cuenta por</Label>
          <Select
            value={form.modo}
            onValueChange={(v) => v && setForm({ ...form, modo: v as PeriodicidadMantencionTipo })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fecha">Días</SelectItem>
              <SelectItem value="conteo">Lavados (vehículos del túnel)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-intervalo">Cada cuántos {unidad}</Label>
          <Input
            id="plan-intervalo"
            type="number"
            min={1}
            value={form.intervalo}
            onChange={(e) => setForm({ ...form, intervalo: e.target.value })}
            placeholder={form.modo === "fecha" ? "Ej: 90" : "Ej: 5000"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-aviso">Avisar {unidad} antes (opcional)</Label>
          <Input
            id="plan-aviso"
            type="number"
            min={0}
            value={form.aviso}
            onChange={(e) => setForm({ ...form, aviso: e.target.value })}
            placeholder={form.modo === "fecha" ? "Ej: 15 (por defecto 7)" : "Ej: 500 (por defecto 10%)"}
          />
        </div>

        {/* La máquina ya viene funcionando desde antes de existir esta ficha:
            estos dos campos son el punto de partida del contador. Dejan de
            usarse apenas se registra la primera mantención de esta tarea. */}
        <div className="grid gap-1.5 sm:col-span-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Punto de partida (la máquina ya venía funcionando)
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-ultima-vez">Última vez que se hizo</Label>
          <Input
            id="plan-ultima-vez"
            type="date"
            max={todayYMD()}
            value={form.ultimaVez}
            onChange={(e) => setForm({ ...form, ultimaVez: e.target.value })}
          />
        </div>
        {form.modo === "conteo" && (
          <div className="grid gap-1.5">
            <Label htmlFor="plan-previos">Lavados que ya lleva</Label>
            <Input
              id="plan-previos"
              type="number"
              min={0}
              value={form.lavadosPrevios}
              onChange={(e) => setForm({ ...form, lavadosPrevios: e.target.value })}
              placeholder="Ej: 8000"
            />
          </div>
        )}
      </div>

      {err && <p className={`mt-2 text-sm ${err.ok ? "text-[color:var(--green)]" : "text-destructive"}`}>{err.msg}</p>}

      <div className="mt-3 flex gap-2">
        <Button onClick={guardar}>{editandoId ? "Guardar cambios" : "Agregar al plan"}</Button>
        {editandoId && (
          <Button variant="ghost" onClick={limpiar}>
            Cancelar
          </Button>
        )}
      </div>

      {planes.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Esta máquina todavía no tiene mantenciones en su plan.</p>
      ) : (
        <div className="table-scroll mt-4 max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mantención</TableHead>
                <TableHead>Repuestos</TableHead>
                <TableHead>Cada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((p) => {
                const status = planMantencionStatus(p, data.registrosMantencion, data.ingresos);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-[180px] truncate" title={p.descripcion}>
                      {p.descripcion}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate" title={p.repuestos || ""}>
                      {p.repuestos || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.periodicidadTipo === "fecha" ? `${p.intervaloDias} días` : `${p.intervaloLavados} lavados`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {status ? (
                        <>
                          <span className={`status-pill ${status.cls}`}>{status.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {status.proximaFecha
                              ? fmtFecha(status.proximaFecha)
                              : `${status.conteoActual}/${status.conteoObjetivo}`}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <button className="icon-btn" onClick={() => editar(p)}>
                        Editar
                      </button>
                      <button className="icon-btn" onClick={() => borrar(p)}>
                        Borrar
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
