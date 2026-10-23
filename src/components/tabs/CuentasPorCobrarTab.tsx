"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { esCuentaPorCobrar, fmtCLP } from "@/lib/helpers";
import type { MovimientoContable, PagoInfo, Venta } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { HandCoins } from "lucide-react";

type Fila = {
  id: string;
  fecha: string;
  descripcion: string;
  categoria?: string;
  contraparte?: string;
  monto: number;
  origen: { tipo: "movimiento"; m: MovimientoContable } | { tipo: "venta"; v: Venta };
};

// Resumen de Cuentas por Cobrar: no es una tabla propia, se deriva de los
// movimientos de tipo "ingreso" con estado "pendiente" (ver Ingresos y
// MovimientoContableTab), igual que Cuentas por Pagar se deriva de egresos,
// más las ventas a plazo sin cobrar (orden de compra o transferencia por
// pagar de un lote B2B, ver esCuentaPorCobrar) — las mismas que el Cierre
// cuenta en su fila "Cuentas x Cobrar".
export default function CuentasPorCobrarTab() {
  const { data, commit, patchUi } = useAppData();
  const [busqueda, setBusqueda] = useState("");

  const items = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    const desdeMovimientos: Fila[] = data.movimientosContables
      .filter((m) => m.tipo === "ingreso" && m.estado === "pendiente")
      .map((m) => ({ ...m, origen: { tipo: "movimiento", m } }));
    const desdeVentas: Fila[] = data.ventas.filter(esCuentaPorCobrar).map((v) => ({
      id: v.id,
      fecha: v.fecha,
      descripcion: v.ordenCompra ? `${v.nombre} · OC ${v.ordenCompra}` : v.nombre,
      categoria: v.metodoPago === "orden_compra" ? "Orden de compra" : "Transferencia por pagar",
      contraparte: v.razonSocial || v.rut || undefined,
      monto: v.precio,
      origen: { tipo: "venta", v },
    }));
    return [...desdeMovimientos, ...desdeVentas]
      .filter((m) => {
        if (!q) return true;
        return (
          m.descripcion.toLowerCase().includes(q) ||
          (m.categoria || "").toLowerCase().includes(q) ||
          (m.contraparte || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [data.movimientosContables, data.ventas, busqueda]);

  const total = items.reduce((s, m) => s + m.monto, 0);

  const marcarPagado = (fila: Fila) => {
    if (fila.origen.tipo === "venta") {
      const venta = fila.origen.v;
      // Solo cambia el estado: el medio de pago de un lote de Venta Empresa no
      // se puede reclasificar (ver reclasificaVentaAutomatica), así que una
      // orden de compra cobrada sigue diciendo "orden de compra".
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `¿Marcar como pagada "${venta.nombre}" por ${fmtCLP(venta.precio)}?`,
          confirmLabel: "Marcar pagada",
          danger: false,
          onConfirm: () =>
            commit({ ventas: data.ventas.map((x) => (x.id === venta.id ? { ...x, estadoPago: "pagado" } : x)) }),
        },
      });
      return;
    }
    const m = fila.origen.m;
    patchUi({
      modal: {
        type: "pago",
        monto: m.monto,
        descripcion: m.descripcion,
        onConfirm: (pago: PagoInfo) => {
          // fechaPago = el día que entró la plata, que no es el día de la venta
          // cuando se vendió a plazo — es lo que el Flujo de Caja usa para
          // poner el ingreso en el mes correcto (ver fechaEfectiva).
          const actualizado: MovimientoContable = {
            ...m,
            estado: "pagado",
            metodoPago: pago.metodo,
            fechaPago: new Date().toISOString(),
          };
          commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? actualizado : x)) });
        },
      },
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 520, margin: "0 0 24px 0" }}>
        <h3>Cuentas por Cobrar</h3>
        <div className="stat-grid">
          <div className="stat-card warn">
            <div className="num">{fmtCLP(total)}</div>
            <div className="lbl">Total por Cobrar</div>
          </div>
          <div className="stat-card">
            <div className="num">{items.length}</div>
            <div className="lbl">Documentos</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, categoría u origen..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {items.length === 0 ? (
          <div className="empty">Sin cuentas por cobrar</div>
        ) : (
          items.map((m) => (
            <MobileRecordCard
              key={m.id}
              avatar={<MobileRecordAvatar icon={HandCoins} tone="warn" />}
              title={m.descripcion}
              subtitle={`${m.categoria || "Sin categoría"} · ${m.contraparte || "Sin origen"}`}
              menu={
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => marcarPagado(m)}>
                  Marcar pagado
                </Button>
              }
              meta={
                <MobileRecordMeta
                  left={new Date(m.fecha).toLocaleDateString("es-CL")}
                  right={<span className="font-medium">{fmtCLP(m.monto)}</span>}
                />
              }
            />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="max-w-[200px]">Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Cliente / Origen</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="empty">Sin cuentas por cobrar</div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.fecha).toLocaleDateString("es-CL")}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={m.descripcion}>{m.descripcion}</TableCell>
                  <TableCell>{m.categoria || "-"}</TableCell>
                  <TableCell>{m.contraparte || "-"}</TableCell>
                  <TableCell>{fmtCLP(m.monto)}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <Button variant="ghost" size="sm" onClick={() => marcarPagado(m)}>
                      Marcar pagado
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
