"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { calcularRecepcion, totalesConIva } from "@/lib/logic";
import { registrarRecepcionFabrica } from "@/lib/serverActions";
import type { Presentacion } from "@/types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import SelectFab from "./SelectFab";
import { fmtCantidad, fmtFormato, parseDecimal, type FabricacionTabProps } from "./shared";

interface FilaRecepcion {
  presentacionId: string;
  unidades: string;
}

const FILA_VACIA: FilaRecepcion = { presentacionId: "", unidades: "" };

export default function RecepcionesFabricaTab({ datos, recargar }: FabricacionTabProps) {
  const { data, aplicarLocal } = useApp();
  const [proveedorId, setProveedorId] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<FilaRecepcion[]>([FILA_VACIA]);
  const [guardando, setGuardando] = useState(false);

  const mpPorId = new Map(datos.materiasPrimas.map((m) => [m.id, m]));
  const formulaNombre = (id: string) => datos.formulas.find((f) => f.id === id)?.nombre || "";
  const destinoNombre = (p: Presentacion) =>
    p.productoId ? data.productos.find((x) => x.id === p.productoId)?.detalle || "?" : data.insumos.find((x) => x.id === p.insumoId)?.nombre || "?";
  const opciones = datos.presentaciones
    .filter((p) => p.activa)
    .map((p) => ({ id: p.id, label: `${destinoNombre(p)} · ${fmtFormato(p.mlPorUnidad)} (${formulaNombre(p.formulaId)})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const proveedorNombre = (id?: string) => data.proveedores.find((p) => p.id === id)?.nombre || "-";

  const completas = filas.filter((f) => f.presentacionId && parseDecimal(f.unidades) > 0);
  const calc = completas.length
    ? calcularRecepcion(
        completas.map((f) => ({ presentacionId: f.presentacionId, unidades: parseDecimal(f.unidades) })),
        datos.presentaciones,
        datos.formulas,
        datos.materiasPrimas,
        datos.lotes,
        { productos: data.productos, insumos: data.insumos }
      )
    : null;
  const valido = calc && !("error" in calc) && calc.faltantes.length === 0;
  const totales = calc && !("error" in calc) ? totalesConIva(calc.totalMaquila, calc.totalMateriasFabrica) : null;

  const setFila = (i: number, cambio: Partial<FilaRecepcion>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const registrar = async () => {
    if (!valido) return;
    setGuardando(true);
    const r = await registrarRecepcionFabrica({
      proveedorId: proveedorId || undefined,
      numeroDocumento,
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
      movimientosContables: r.movimiento ? [r.movimiento, ...actual.movimientosContables] : actual.movimientosContables,
    }));
    toast.success(r.movimiento ? `Recepción registrada. Egreso por pagar de ${fmtCLP(r.movimiento.monto)} en Contabilidad.` : "Recepción registrada");
    setFilas([FILA_VACIA]);
    setNumeroDocumento("");
    setNotas("");
    await recargar();
  };

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 font-semibold">Registrar lo que llegó de la fábrica</h3>
        {opciones.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">Primero crea la fórmula y sus presentaciones en la pestaña Fórmulas.</p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r-prov">Fábrica (proveedor)</Label>
            <SelectFab
              id="r-prov"
              value={proveedorId}
              onChange={setProveedorId}
              placeholder="Sin proveedor"
              opciones={[...data.proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({ value: p.id, label: p.nombre }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-doc">N° factura / guía</Label>
            <Input id="r-doc" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="r-notas">Nota</Label>
            <Input id="r-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <Label>Lo que llegó</Label>
          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <SelectFab
                className="w-full min-w-0 flex-1"
                value={f.presentacionId}
                onChange={(v) => setFila(i, { presentacionId: v })}
                placeholder="Presentación…"
                opciones={opciones.map((o) => ({ value: o.id, label: o.label }))}
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

        {calc && "error" in calc && <p className="mt-3 text-sm text-destructive">{calc.error}</p>}
        {calc && !("error" in calc) && totales && (
          <div className="mt-4 grid gap-4 text-sm lg:grid-cols-2">
            <div>
              <div className="mb-1 font-medium">Materias primas</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-muted-foreground">
                <span />
                <span>De lo nuestro</span>
                <span>Pone la fábrica</span>
              </div>
              {calc.usos.map((u) => {
                const mp = mpPorId.get(u.materiaPrimaId)!;
                const falta = calc.faltantes.find((f) => f.materiaPrimaId === u.materiaPrimaId);
                return (
                  <div key={u.materiaPrimaId} className={`grid grid-cols-[1fr_auto_auto] gap-x-4 ${falta ? "font-semibold text-destructive" : ""}`}>
                    <span>{mp.nombre}</span>
                    <span className="text-right">
                      {fmtCantidad(u.propia)} {mp.unidad}
                    </span>
                    <span className="text-right">
                      {falta ? `FALTAN ${fmtCantidad(falta.falta)} ${mp.unidad}` : u.fabrica ? `${fmtCantidad(u.fabrica)} ${mp.unidad}` : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="mb-1 font-medium">Egreso por pagar a la fábrica</div>
              <Fila label="Maquila" valor={calc.totalMaquila} />
              <Fila label="Materias primas de la fábrica" valor={calc.totalMateriasFabrica} />
              <Fila label="IVA 19%" valor={totales.iva} />
              <Fila label="Total" valor={totales.total} fuerte />
              <div className="mb-1 mt-3 font-medium">Costo real por unidad</div>
              {calc.lineas.map((l, i) => (
                <div key={i} className="flex justify-between">
                  <span>{l.nombre}</span>
                  <span>{fmtCLP(Math.round((l.maquila + l.materiasFabrica + l.propias) / l.unidades))}</span>
                </div>
              ))}
              <div className="text-xs text-muted-foreground">Neto: maquila + lo de la fábrica + lo nuestro a costo FIFO.</div>
            </div>
          </div>
        )}
        {calc && !("error" in calc) && calc.faltantes.length > 0 && (
          <p className="mt-3 text-sm text-destructive">
            No se puede registrar: falta materia prima que la fábrica no pone. Registra la compra en Materias primas o corrige las unidades.
          </p>
        )}

        <div className="mt-4">
          <Button onClick={registrar} disabled={!valido || guardando}>
            {guardando ? "Guardando…" : "Registrar recepción"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Recepciones anteriores</h3>
        {datos.recepciones.length === 0 ? (
          <div className="empty">Todavía no hay recepciones</div>
        ) : (
          <div className="grid gap-2">
            {datos.recepciones.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>
                    {fmtFecha(r.fecha)} · {proveedorNombre(r.proveedorId)}
                    {r.numeroDocumento ? ` · N° ${r.numeroDocumento}` : ""}
                  </strong>
                  <span>
                    Factura {fmtCLP(totalesConIva(r.totalMaquila, r.totalMateriasFabrica).total)}{" "}
                    <span className="text-muted-foreground">· lo nuestro consumido {fmtCLP(r.totalPropias)}</span>
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {r.lineas
                    .map((l) => `${l.nombre} × ${fmtCantidad(l.unidades)} (${fmtCLP(Math.round((l.maquila + l.materiasFabrica + l.propias) / l.unidades))} c/u)`)
                    .join(" · ")}
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

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between ${fuerte ? "border-t border-border pt-1 font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{fmtCLP(valor)}</span>
    </div>
  );
}
