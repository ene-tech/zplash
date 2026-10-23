"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { calcularRecepcion, compararCategoria, SIN_CATEGORIA } from "@/lib/logic";
import { registrarRecepcionFabrica } from "@/lib/serverActions";
import type { Presentacion } from "@/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import SelectFab from "./SelectFab";
import { fmtCantidad, fmtFormato, parseDecimal, type FabricacionTabProps } from "./shared";

interface FilaFabricacion {
  presentacionId: string;
  unidades: string;
}

const FILA_VACIA: FilaFabricacion = { presentacionId: "", unidades: "" };

/** Lo que fabricamos nosotros: las materias primas salen de lo nuestro (FIFO)
 * y el stock sube en el producto o insumo de la presentación. Sin fábrica,
 * maquila ni egreso; si algo no alcanza, no se puede registrar. */
export default function FabricarTab({ datos, recargar }: FabricacionTabProps) {
  const { data, aplicarLocal } = useApp();
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<FilaFabricacion[]>([FILA_VACIA]);
  const [guardando, setGuardando] = useState(false);

  const mpPorId = new Map(datos.materiasPrimas.map((m) => [m.id, m]));
  const formulaNombre = (id: string) => datos.formulas.find((f) => f.id === id)?.nombre || "";
  const formulaCategoria = (id: string) => datos.formulas.find((f) => f.id === id)?.categoria || SIN_CATEGORIA;
  const destinoNombre = (p: Presentacion) =>
    p.productoId ? data.productos.find((x) => x.id === p.productoId)?.detalle || "?" : data.insumos.find((x) => x.id === p.insumoId)?.nombre || "?";
  // Todas las presentaciones de todas las fórmulas, agrupadas por categoría como en Fórmulas.
  const opciones = datos.presentaciones
    .map((p) => ({
      id: p.id,
      grupo: formulaCategoria(p.formulaId),
      label: `${destinoNombre(p)} · ${fmtFormato(p.mlPorUnidad)} (${formulaNombre(p.formulaId)})`,
    }))
    .sort((a, b) => compararCategoria(a.grupo, b.grupo) || a.label.localeCompare(b.label));
  const sinPresentacion = datos.formulas.filter((f) => !datos.presentaciones.some((p) => p.formulaId === f.id));
  const anteriores = datos.recepciones.filter((r) => r.propia);

  const completas = filas.filter((f) => f.presentacionId && parseDecimal(f.unidades) > 0);
  const calc = completas.length
    ? calcularRecepcion(
        completas.map((f) => ({ presentacionId: f.presentacionId, unidades: parseDecimal(f.unidades) })),
        datos.presentaciones,
        datos.formulas,
        datos.materiasPrimas,
        datos.lotes,
        { productos: data.productos, insumos: data.insumos },
        true
      )
    : null;
  const valido = calc && !("error" in calc) && calc.faltantes.length === 0;

  const setFila = (i: number, cambio: Partial<FilaFabricacion>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const registrar = async () => {
    if (!valido) return;
    setGuardando(true);
    const r = await registrarRecepcionFabrica({
      propia: true,
      notas,
      lineas: completas.map((f) => ({ presentacionId: f.presentacionId, unidades: parseDecimal(f.unidades) })),
    });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    const prods = new Map(r.productos.map((p) => [p.id, p]));
    const ins = new Map(r.insumos.map((i) => [i.id, i]));
    aplicarLocal((actual) => ({
      productos: actual.productos.map((p) => prods.get(p.id) || p),
      insumos: actual.insumos.map((i) => ins.get(i.id) || i),
    }));
    toast.success("Fabricación registrada: el stock ya subió");
    setFilas([FILA_VACIA]);
    setNotas("");
    await recargar();
  };

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 font-semibold">Fabricar con nuestras materias primas</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Descuenta las materias primas de nuestro stock (costo FIFO) y suma las unidades al producto o insumo. No genera egreso.
        </p>
        {opciones.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">Primero crea la fórmula y sus presentaciones en la pestaña Fórmulas.</p>
        )}
        {sinPresentacion.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            Sin presentación (no se pueden fabricar hasta que tengan una): {sinPresentacion.map((f) => f.nombre).join(", ")}.
          </p>
        )}

        <div className="grid gap-2">
          <Label>Lo que se fabricó</Label>
          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <SelectFab
                className="w-full min-w-0 flex-1"
                value={f.presentacionId}
                onChange={(v) => setFila(i, { presentacionId: v })}
                placeholder="Presentación…"
                opciones={opciones.map((o) => ({ value: o.id, label: o.label, grupo: o.grupo }))}
              />
              <Input className="w-28" inputMode="decimal" placeholder="Unidades" value={f.unidades} onChange={(e) => setFila(i, { unidades: e.target.value })} />
              <span className="text-sm">un</span>
              <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas(filas.length > 1 ? filas.filter((_, j) => j !== i) : [FILA_VACIA])}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={() => setFilas([...filas, FILA_VACIA])}>
              + Otra presentación
            </Button>
          </div>
        </div>

        <div className="mt-3 grid max-w-md gap-1.5">
          <Label htmlFor="fab-notas">Nota</Label>
          <Input id="fab-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        {calc && "error" in calc && <p className="mt-3 text-sm text-destructive">{calc.error}</p>}
        {calc && !("error" in calc) && (
          <div className="mt-4 grid gap-4 text-sm lg:grid-cols-2">
            <div>
              <div className="mb-1 font-medium">Materias primas</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-muted-foreground">
                <span />
                <span>Se usa</span>
                <span>Hay</span>
              </div>
              {calc.usos.map((u) => {
                const mp = mpPorId.get(u.materiaPrimaId)!;
                const falta = calc.faltantes.find((f) => f.materiaPrimaId === u.materiaPrimaId);
                return (
                  <div key={u.materiaPrimaId} className={`grid grid-cols-[1fr_auto_auto] gap-x-4 ${falta ? "font-semibold text-destructive" : ""}`}>
                    <span>{mp.nombre}</span>
                    <span className="text-right">
                      {fmtCantidad(u.propia + (falta?.falta ?? 0))} {mp.unidad}
                    </span>
                    <span className="text-right">
                      {fmtCantidad(mp.stock)} {mp.unidad}
                      {falta ? ` · FALTAN ${fmtCantidad(falta.falta)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="mb-1 font-medium">Costo real por unidad</div>
              {calc.lineas.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span>{l.nombre}</span>
                  <span>{calc.faltantes.length ? "-" : fmtCLP(Math.round(l.propias / l.unidades))}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                <span>Materias primas consumidas</span>
                <span>{calc.faltantes.length ? "-" : fmtCLP(calc.totalPropias)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Neto, a costo FIFO de nuestros lotes.</div>
            </div>
          </div>
        )}
        {calc && !("error" in calc) && calc.faltantes.length > 0 && (
          <p className="mt-3 text-sm text-destructive">
            No se puede registrar: no alcanza la materia prima. Registra la compra en Materias primas o baja las unidades.
          </p>
        )}

        <div className="mt-4">
          <Button onClick={registrar} disabled={!valido || guardando}>
            {guardando ? "Guardando…" : "Registrar fabricación"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Fabricaciones anteriores</h3>
        {anteriores.length === 0 ? (
          <div className="empty">Todavía no hay fabricaciones</div>
        ) : (
          <div className="grid gap-2">
            {anteriores.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{fmtFecha(r.fecha)}</strong>
                  <span className="text-muted-foreground">materias primas consumidas {fmtCLP(r.totalPropias)}</span>
                </div>
                <div className="text-muted-foreground">
                  {r.lineas.map((l) => `${l.nombre} × ${fmtCantidad(l.unidades)} (${fmtCLP(Math.round(l.propias / l.unidades))} c/u)`).join(" · ")}
                  {r.creadoPor ? ` — ${r.creadoPor}` : ""}
                  {r.notas ? ` — ${r.notas}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
