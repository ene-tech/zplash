"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { fmtCLP, fmtFecha, TIPO_VENTA_PRODUCTOS } from "@/lib/helpers";
import { lineasDeVenta, registrarDevolucionPos } from "@/lib/serverActions";
import type { Venta, VentaItem } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Cuánto de cada producto se devuelve y en qué estado vuelve. */
interface LineaMarcada {
  cantidad: number;
  nuevo: boolean;
}

const FORMAS = [
  { valor: "efectivo", label: "Efectivo de la caja" },
  { valor: "tarjeta", label: "Anulado en el terminal" },
  { valor: "transferencia", label: "Transferencia" },
  { valor: "vale", label: "Vale a favor (no sale plata)" },
] as const;

export default function DevolucionPosModal({ onCerrar }: { onCerrar: () => void }) {
  const { data, aplicarLocal, ui } = useApp();
  const [busqueda, setBusqueda] = useState("");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [items, setItems] = useState<VentaItem[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<string, LineaMarcada>>({});
  const [motivo, setMotivo] = useState("");
  const [forma, setForma] = useState<(typeof FORMAS)[number]["valor"]>("efectivo");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [valeEmitido, setValeEmitido] = useState("");

  // Solo ventas de la tienda: un lavado o un plan no se devuelven por acá.
  const ventasTienda = useMemo(
    () => data.ventas.filter((v) => v.tipo === TIPO_VENTA_PRODUCTOS).slice(0, 200),
    [data.ventas]
  );
  const q = busqueda.trim().toLowerCase();
  const resultados = useMemo(() => {
    const base = q
      ? ventasTienda.filter(
          (v) => v.nombre.toLowerCase().includes(q) || String(v.precio).includes(q) || v.patente.toLowerCase().includes(q)
        )
      : ventasTienda;
    return base.slice(0, 12);
  }, [ventasTienda, q]);

  // El "cargando" se limpia al elegir la venta (ver elegirVenta), no acá:
  // el efecto solo habla con el servidor y escribe al volver.
  useEffect(() => {
    if (!venta) return;
    let vigente = true;
    lineasDeVenta(venta.id).then((filas) => {
      if (!vigente) return;
      setItems(filas);
      // Por defecto se devuelve todo lo del ticket, en buen estado: es el
      // caso común y así el cajero solo corrige lo que cambia.
      setMarcadas(Object.fromEntries(filas.map((f) => [f.productoId || f.id, { cantidad: f.cantidad, nuevo: true }])));
    });
    return () => {
      vigente = false;
    };
  }, [venta]);

  const elegirVenta = (v: Venta | null) => {
    setVenta(v);
    setItems(null);
    setMarcadas({});
    setErr("");
  };

  const lineas = (items || [])
    .filter((it) => it.productoId && (marcadas[it.productoId]?.cantidad ?? 0) > 0)
    .map((it) => ({
      productoId: it.productoId!,
      cantidad: marcadas[it.productoId!].cantidad,
      nuevo: marcadas[it.productoId!].nuevo,
      precioUnitario: it.precioUnitario,
    }));
  const totalDevolver = lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);

  const confirmar = async () => {
    if (!venta || guardando) return;
    setGuardando(true);
    setErr("");
    try {
      const r = await registrarDevolucionPos({
        ventaId: venta.id,
        lineas: lineas.map(({ productoId, cantidad, nuevo }) => ({ productoId, cantidad, nuevo })),
        motivo,
        forma,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      const productosPorId = new Map(r.productos.map((p) => [p.id, p]));
      aplicarLocal((actual) => ({
        ventas: [r.venta, ...actual.ventas],
        productos: actual.productos.map((p) => productosPorId.get(p.id) || p),
        movimientosContables: [r.movimiento, ...actual.movimientosContables],
        cupones: r.vale ? [r.vale, ...actual.cupones] : actual.cupones,
      }));
      if (r.vale) {
        // El código es lo único que el cliente se lleva: se muestra hasta que
        // lo cierren, no en un toast que se va solo.
        setValeEmitido(r.vale.codigo);
        toast.success(`Vale a favor emitido · ${fmtCLP(r.vale.valor)}`);
        return;
      }
      toast.success(`Devolución registrada · ${fmtCLP(Math.abs(r.venta.precio))}`);
      onCerrar();
    } catch (error) {
      console.error("No se pudo registrar la devolución", error);
      setErr("No se pudo registrar la devolución (sin conexión). Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{venta ? "Devolver productos" : "¿Qué venta se devuelve?"}</DialogTitle>
        </DialogHeader>

        {valeEmitido ? (
          <div className="grid gap-3">
            <p>Dale este código al cliente. Lo puede usar como descuento en el local hasta dentro de 6 meses:</p>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 4, textAlign: "center", color: "var(--gold)" }}>
              {valeEmitido}
            </div>
            <p style={{ fontSize: 12, color: "var(--gray)" }}>
              Queda registrado en B2B/Tickets/Dsctos y en la ficha del cliente, así que si lo pierde se puede buscar.
            </p>
          </div>
        ) : !venta ? (
          <div className="grid gap-3">
            <input
              autoFocus
              placeholder="Buscar por monto, cliente o patente…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="table-scroll" style={{ maxHeight: 320 }}>
              {resultados.length === 0 ? (
                <div className="empty">No hay ventas de la tienda que coincidan</div>
              ) : (
                <table>
                  <tbody>
                    {resultados.map((v) => (
                      <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => elegirVenta(v)}>
                        <td style={{ width: 110 }}>{fmtFecha(v.fecha)}</td>
                        <td>
                          <strong>{v.nombre}</strong>
                          <div style={{ fontSize: 12, color: "var(--gray)" }}>
                            {v.cantidadItems ?? 1} {(v.cantidadItems ?? 1) === 1 ? "unidad" : "unidades"} ·{" "}
                            {v.metodoPago || "sin medio de pago"}
                          </div>
                        </td>
                        <td style={{ width: 110, textAlign: "right" }}>{fmtCLP(v.precio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <div style={{ fontSize: 12, color: "var(--gray)" }}>
              Venta del {fmtFecha(venta.fecha)} · {venta.nombre} · {fmtCLP(venta.precio)}
            </div>

            {!items ? (
              <div className="empty">Cargando el detalle del ticket…</div>
            ) : items.length === 0 ? (
              <div className="empty">Ese ticket no tiene detalle de productos guardado</div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ width: 110 }}>Devolver</th>
                      <th style={{ width: 180 }}>Estado</th>
                      <th style={{ width: 110 }}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const clave = it.productoId || it.id;
                      const marca = marcadas[clave] || { cantidad: 0, nuevo: true };
                      return (
                        <tr key={it.id}>
                          <td>
                            <strong>{it.sku}</strong>
                            <div style={{ fontSize: 12, color: "var(--gray)" }}>
                              {it.detalle} · vendidas {it.cantidad}
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={it.cantidad}
                              step={1}
                              style={{ maxWidth: 90 }}
                              value={marca.cantidad}
                              onChange={(e) =>
                                setMarcadas((prev) => ({
                                  ...prev,
                                  [clave]: { ...marca, cantidad: Math.max(0, Math.min(it.cantidad, Number(e.target.value) || 0)) },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <select
                              value={marca.nuevo ? "nuevo" : "detalle"}
                              onChange={(e) => setMarcadas((prev) => ({ ...prev, [clave]: { ...marca, nuevo: e.target.value === "nuevo" } }))}
                            >
                              <option value="nuevo">Nuevo, vuelve a la venta</option>
                              <option value="detalle">Con detalle, a revisión</option>
                            </select>
                          </td>
                          <td>{fmtCLP(marca.cantidad * it.precioUnitario)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="field">
              <Label htmlFor="dev-motivo">Motivo</Label>
              <input
                id="dev-motivo"
                placeholder="Por qué lo devuelve"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>

            <div className="field">
              <Label htmlFor="dev-forma">Cómo se le devuelve</Label>
              <select id="dev-forma" value={forma} onChange={(e) => setForma(e.target.value as typeof forma)}>
                {FORMAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ textAlign: "right", fontSize: 20, fontWeight: 700 }}>A devolver: {fmtCLP(totalDevolver)}</div>
            {/* Lo que vuelve con detalle no se puede vender hasta que alguien
                lo mire: queda en un destino aparte, visible en Inventario. */}
            {lineas.some((l) => !l.nuevo) && (
              <p style={{ fontSize: 12, color: "var(--gray)" }}>
                Lo marcado &quot;con detalle&quot; queda en Inventario → Bodegas, destino &quot;Revisión de devoluciones&quot;, no a la venta.
              </p>
            )}
            {err && <p className="err">{err}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant={valeEmitido ? "default" : "ghost"} onClick={onCerrar}>
            {valeEmitido ? "Listo" : "Cancelar"}
          </Button>
          {venta && !valeEmitido && (
            <>
              <Button variant="outline" onClick={() => elegirVenta(null)}>
                Elegir otra venta
              </Button>
              <Button disabled={guardando || !lineas.length || !motivo.trim() || !ui.perfilActual} onClick={confirmar}>
                {guardando ? "Registrando…" : "Registrar devolución"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
