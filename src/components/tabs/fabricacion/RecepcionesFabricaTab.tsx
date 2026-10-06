"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha } from "@/lib/helpers";
import { calcularRecepcion } from "@/lib/logic";
import { registrarRecepcionFabrica } from "@/lib/serverActions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { fmtCantidad, parseDecimal, SELECT_CLASS, type FabricacionTabProps } from "./shared";

interface FilaRecepcion {
  insumoId: string;
  litros: string;
}

const FILA_VACIA: FilaRecepcion = { insumoId: "", litros: "" };

export default function RecepcionesFabricaTab({ datos, recargar }: FabricacionTabProps) {
  const { data, aplicarLocal } = useApp();
  const [proveedorId, setProveedorId] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [notas, setNotas] = useState("");
  const [filas, setFilas] = useState<FilaRecepcion[]>([FILA_VACIA]);
  const [guardando, setGuardando] = useState(false);

  const conFormula = new Set(datos.formulas.map((f) => f.insumoId));
  const insumos = data.insumos.filter((i) => conFormula.has(i.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const proveedorNombre = (id?: string) => data.proveedores.find((p) => p.id === id)?.nombre || "-";
  const mpPorId = new Map(datos.materiasPrimas.map((m) => [m.id, m]));

  const completas = filas.filter((f) => f.insumoId && parseDecimal(f.litros) > 0);
  const calc = completas.length
    ? calcularRecepcion(
        completas.map((f) => ({ insumoId: f.insumoId, litros: parseDecimal(f.litros) })),
        datos.formulas,
        datos.materiasPrimas,
        data.insumos
      )
    : null;
  const valido = calc && !("error" in calc) && calc.faltantes.length === 0;

  const setFila = (i: number, cambio: Partial<FilaRecepcion>) => setFilas(filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const registrar = async () => {
    if (!valido) return;
    setGuardando(true);
    const r = await registrarRecepcionFabrica({
      proveedorId: proveedorId || undefined,
      numeroDocumento,
      notas,
      lineas: completas.map((f) => ({ insumoId: f.insumoId, litros: parseDecimal(f.litros) })),
    });
    setGuardando(false);
    if (!r.ok) return toast.error(r.error);
    const porId = new Map(r.insumos.map((i) => [i.id, i]));
    aplicarLocal((actual) => ({
      insumos: actual.insumos.map((i) => porId.get(i.id) || i),
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
        {insumos.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">Primero crea la fórmula de cada producto en la pestaña Fórmulas.</p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="r-prov">Fábrica (proveedor)</Label>
            <select id="r-prov" className={SELECT_CLASS} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {[...data.proveedores]
                .sort((a, b) => a.nombre.localeCompare(b.nombre))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
            </select>
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
          <Label>Productos recibidos</Label>
          {filas.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={SELECT_CLASS} value={f.insumoId} onChange={(e) => setFila(i, { insumoId: e.target.value })}>
                <option value="">Producto…</option>
                {insumos.map((ins) => (
                  <option key={ins.id} value={ins.id}>
                    {ins.nombre}
                  </option>
                ))}
              </select>
              <Input className="w-28" inputMode="decimal" placeholder="Litros" value={f.litros} onChange={(e) => setFila(i, { litros: e.target.value })} />
              <span className="text-sm">L</span>
              <Button variant="ghost" size="icon-sm" aria-label="Quitar" onClick={() => setFilas(filas.length > 1 ? filas.filter((_, j) => j !== i) : [FILA_VACIA])}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button variant="outline" size="sm" onClick={() => setFilas([...filas, FILA_VACIA])}>
              + Producto
            </Button>
          </div>
        </div>

        {calc && "error" in calc && <p className="mt-3 text-sm text-destructive">{calc.error}</p>}
        {calc && !("error" in calc) && (
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="mb-1 font-medium">Se descuenta de nuestras materias primas</div>
              {calc.consumos.size === 0 ? (
                <div className="text-muted-foreground">Nada (todo lo pone la fábrica)</div>
              ) : (
                [...calc.consumos].map(([id, cantidad]) => {
                  const mp = mpPorId.get(id)!;
                  const falta = cantidad > mp.stock;
                  return (
                    <div key={id} className={`flex justify-between ${falta ? "font-semibold text-destructive" : ""}`}>
                      <span>{mp.nombre}</span>
                      <span>
                        {fmtCantidad(cantidad)} {mp.unidad} (hay {fmtCantidad(mp.stock)}){falta ? " · NO ALCANZA" : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <div>
              <div className="mb-1 font-medium">Egreso por pagar a la fábrica</div>
              <div className="flex justify-between">
                <span>Maquila</span>
                <span>{fmtCLP(calc.totalMaquila)}</span>
              </div>
              <div className="flex justify-between">
                <span>Materias primas de la fábrica</span>
                <span>{fmtCLP(calc.totalMateriasFabrica)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Total</span>
                <span>{fmtCLP(calc.totalMaquila + calc.totalMateriasFabrica)}</span>
              </div>
            </div>
          </div>
        )}
        {calc && !("error" in calc) && calc.faltantes.length > 0 && (
          <p className="mt-3 text-sm text-destructive">
            No se puede registrar: falta materia prima propia en la fábrica. Registra la compra en la pestaña Materias primas o corrige los litros.
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
                    {fmtCLP(r.totalMaquila + r.totalMateriasFabrica)}{" "}
                    <span className="text-muted-foreground">
                      (maquila {fmtCLP(r.totalMaquila)} + fábrica {fmtCLP(r.totalMateriasFabrica)})
                    </span>
                  </span>
                </div>
                <div className="text-muted-foreground">
                  {r.lineas.map((l) => `${l.insumoNombre} ${fmtCantidad(l.litros)} L`).join(" · ")}
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
