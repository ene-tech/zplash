"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { esEstadoPagadoEgreso, fmtCLP, formatRut, mesActualKey, mesKey } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Trash2 } from "lucide-react";

const ESTADO_LABEL: Record<string, string> = {
  pagado_cc: "Pagado desde CC",
  pagado_efectivo: "Pagado en Efectivo",
  x_rendir: "X Rendir",
  pendiente_pago: "Pendiente de Pago",
};

export default function GastoEstadoTab({
  estado,
  titulo,
}: {
  estado: "x_rendir" | "pendiente_pago";
  titulo: string;
}) {
  const { data, commit } = useApp();
  const [mes, setMes] = useState(mesActualKey);
  const [busqueda, setBusqueda] = useState("");

  const items = useMemo(
    () =>
      data.movimientosContables
        .filter((m) => m.tipo === "egreso" && m.estado === estado && mesKey(m.fecha) === mes)
        .filter((m) => {
          const q = busqueda.toLowerCase().trim();
          if (!q) return true;
          return (
            m.descripcion.toLowerCase().includes(q) ||
            (m.categoria || "").toLowerCase().includes(q) ||
            (m.contraparte || "").toLowerCase().includes(q) ||
            (m.numeroFactura || "").toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [data.movimientosContables, estado, mes, busqueda]
  );

  const total = items.reduce((s, m) => s + m.monto, 0);

  const cambiarEstado = (m: MovimientoContable, nuevoEstado: MovimientoContable["estado"]) => {
    const fechaPago = esEstadoPagadoEgreso(nuevoEstado) ? new Date().toISOString() : undefined;
    commit({ movimientosContables: data.movimientosContables.map((x) => (x.id === m.id ? { ...x, estado: nuevoEstado, fechaPago } : x)) });
  };

  const eliminar = (m: MovimientoContable) => {
    commit({ movimientosContables: data.movimientosContables.filter((x) => x.id !== m.id) });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>{titulo}</h3>
        <div className="field">
          <label>Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="stat-grid">
          <div className="stat-card warn">
            <div className="num">{fmtCLP(total)}</div>
            <div className="lbl">Total {ESTADO_LABEL[estado].toLowerCase()}</div>
          </div>
          <div className="stat-card">
            <div className="num">{items.length}</div>
            <div className="lbl">Documentos</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, tipo de gasto, proveedor o N° factura..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {items.length === 0 ? (
          <div className="empty">Sin registros para este periodo</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.descripcion}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.categoria || "Sin tipo"} · {m.contraparte || "Sin proveedor"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtCLP(m.monto)} · {new Date(m.fecha).toLocaleDateString("es-CL")}
                    {m.numeroFactura ? ` · N° ${m.numeroFactura}` : ""}
                  </div>
                </div>
                <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(m) }]} />
              </div>
              <Select value={m.estado} onValueChange={(v) => v && cambiarEstado(m, v as MovimientoContable["estado"])}>
                <SelectTrigger size="sm" className="mt-2 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pagado_cc">Pagado desde CC</SelectItem>
                  <SelectItem value="pagado_efectivo">Pagado en Efectivo</SelectItem>
                  <SelectItem value="x_rendir">X Rendir</SelectItem>
                  <SelectItem value="pendiente_pago">Pendiente de Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha Emisión</TableHead>
              <TableHead>Fecha Registro</TableHead>
              <TableHead>Fecha Pago</TableHead>
              <TableHead className="max-w-[200px]">Descripción</TableHead>
              <TableHead>Tipo de gasto</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>N° Factura</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Adjunto</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12}>
                  <div className="empty">Sin registros para este periodo</div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.fecha).toLocaleDateString("es-CL")}</TableCell>
                  <TableCell>{new Date(m.creadoEn).toLocaleDateString("es-CL")}</TableCell>
                  <TableCell>{m.fechaPago ? new Date(m.fechaPago).toLocaleDateString("es-CL") : "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={m.descripcion}>{m.descripcion}</TableCell>
                  <TableCell>{m.categoria || "-"}</TableCell>
                  <TableCell>{m.rutProveedor ? formatRut(m.rutProveedor) : "-"}</TableCell>
                  <TableCell>{m.contraparte || "-"}</TableCell>
                  <TableCell>{m.numeroFactura || "-"}</TableCell>
                  <TableCell>{m.tipoDocumento || "-"}</TableCell>
                  <TableCell>
                    {m.documentoUrl ? (
                      <a href={m.documentoUrl} target="_blank" rel="noopener noreferrer">
                        Ver
                      </a>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{fmtCLP(m.monto)}</TableCell>
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      <Select value={m.estado} onValueChange={(v) => v && cambiarEstado(m, v as MovimientoContable["estado"])}>
                        <SelectTrigger size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pagado_cc">Pagado desde CC</SelectItem>
                          <SelectItem value="pagado_efectivo">Pagado en Efectivo</SelectItem>
                          <SelectItem value="x_rendir">X Rendir</SelectItem>
                          <SelectItem value="pendiente_pago">Pendiente de Pago</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminar(m)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
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
