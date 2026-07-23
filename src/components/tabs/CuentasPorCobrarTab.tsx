"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtCLP } from "@/lib/helpers";
import type { MovimientoContable, PagoInfo } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

// Resumen de Cuentas por Cobrar: no es una tabla propia, se deriva de los
// movimientos de tipo "ingreso" con estado "pendiente" (ver Ingresos y
// MovimientoContableTab), igual que Cuentas por Pagar se deriva de egresos.
export default function CuentasPorCobrarTab() {
  const { data, commit, patchUi } = useApp();
  const [busqueda, setBusqueda] = useState("");

  const items = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return data.movimientosContables
      .filter((m) => m.tipo === "ingreso" && m.estado === "pendiente")
      .filter((m) => {
        if (!q) return true;
        return (
          m.descripcion.toLowerCase().includes(q) ||
          (m.categoria || "").toLowerCase().includes(q) ||
          (m.contraparte || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [data.movimientosContables, busqueda]);

  const total = items.reduce((s, m) => s + m.monto, 0);

  const marcarPagado = (m: MovimientoContable) => {
    patchUi({
      modal: {
        type: "pago",
        monto: m.monto,
        descripcion: m.descripcion,
        onConfirm: (pago: PagoInfo) => {
          const actualizado: MovimientoContable = { ...m, estado: "pagado", metodoPago: pago.metodo };
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

      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {items.length === 0 ? (
          <div className="empty">Sin cuentas por cobrar</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.descripcion}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.categoria || "Sin categoría"} · {m.contraparte || "Sin origen"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {fmtCLP(m.monto)} · {new Date(m.fecha).toLocaleDateString("es-CL")}
                </div>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => marcarPagado(m)}>
                Marcar pagado
              </Button>
            </div>
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
