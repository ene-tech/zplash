"use client";

import { fmtCLP, formatRut } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Trash2, ArrowLeftRight } from "lucide-react";
import { CONTRAPARTE_LABEL } from "./useMovimientoContableForm";
import type { useMovimientosContablesList } from "./useMovimientosContablesList";

const ESTADO_EGRESO_LABEL: Record<string, string> = {
  pagado_cc: "Pagado desde CC",
  pagado_efectivo: "Pagado en Efectivo",
  x_rendir: "X Rendir",
  pendiente_pago: "Pendiente de Pago",
};

const ESTADO_EGRESO_CLASE: Record<string, "ok" | "warn" | "bad"> = {
  pagado_cc: "ok",
  pagado_efectivo: "ok",
  x_rendir: "warn",
  pendiente_pago: "bad",
};

type Props = Pick<ReturnType<typeof useMovimientosContablesList>, "items" | "toggleEstado" | "cambiarEstadoEgreso" | "eliminar"> & {
  tipo: MovimientoContable["tipo"];
};

function SelectorEstadoEgreso({ m, onChange, className }: { m: MovimientoContable; onChange: (v: string) => void; className?: string }) {
  return (
    <Select value={m.estado} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pagado_cc">Pagado desde CC</SelectItem>
        <SelectItem value="pagado_efectivo">Pagado en Efectivo</SelectItem>
        <SelectItem value="x_rendir">X Rendir</SelectItem>
        <SelectItem value="pendiente_pago">Pendiente de Pago</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Listado de movimientos ya registrados: tarjetas en mobile, tabla completa
// en desktop (con más columnas — RUT, N° Factura, Documento adjunto — solo
// para egresos).
export default function MovimientoContableTable({ tipo, items, toggleEstado, cambiarEstadoEgreso, eliminar }: Props) {
  return (
    <>
      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {items.length === 0 ? (
          <div className="empty">Sin registros</div>
        ) : (
          items.map((m) => (
            <MobileRecordCard
              key={m.id}
              avatar={<MobileRecordAvatar icon={ArrowLeftRight} tone={tipo === "egreso" ? "bad" : "ok"} />}
              title={m.descripcion}
              subtitle={`${m.categoria || "Sin categoría"} · ${m.contraparte || "-"}`}
              menu={<MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminar(m) }]} />}
              meta={
                <MobileRecordMeta
                  left={new Date(m.fecha).toLocaleDateString("es-CL")}
                  right={<span className="font-medium">{fmtCLP(m.monto)}</span>}
                />
              }
            >
              {tipo === "egreso" ? (
                <SelectorEstadoEgreso m={m} onChange={(v) => cambiarEstadoEgreso(m, v as MovimientoContable["estado"])} className="mt-2 w-full" />
              ) : (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => toggleEstado(m)}>
                  {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                </Button>
              )}
            </MobileRecordCard>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tipo === "egreso" ? "Fecha Emisión" : "Fecha"}</TableHead>
              {tipo === "egreso" && <TableHead>Fecha Registro</TableHead>}
              {tipo === "egreso" && <TableHead>Fecha Pago</TableHead>}
              <TableHead className="max-w-[200px]">Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              {tipo === "egreso" && <TableHead>RUT</TableHead>}
              <TableHead>{CONTRAPARTE_LABEL[tipo]}</TableHead>
              {tipo === "egreso" && <TableHead>N° Factura</TableHead>}
              {tipo === "egreso" && <TableHead>Documento</TableHead>}
              {tipo === "egreso" && <TableHead>Adjunto</TableHead>}
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              {tipo !== "egreso" && <TableHead>Método</TableHead>}
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tipo === "egreso" ? 13 : 8}>
                  <div className="empty">Sin registros</div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{new Date(m.fecha).toLocaleDateString("es-CL")}</TableCell>
                  {tipo === "egreso" && <TableCell>{new Date(m.creadoEn).toLocaleDateString("es-CL")}</TableCell>}
                  {tipo === "egreso" && <TableCell>{m.fechaPago ? new Date(m.fechaPago).toLocaleDateString("es-CL") : "-"}</TableCell>}
                  <TableCell className="max-w-[200px] truncate" title={m.descripcion}>{m.descripcion}</TableCell>
                  <TableCell>{m.categoria || "-"}</TableCell>
                  {tipo === "egreso" && <TableCell>{m.rutProveedor ? formatRut(m.rutProveedor) : "-"}</TableCell>}
                  <TableCell>{m.contraparte || "-"}</TableCell>
                  {tipo === "egreso" && <TableCell>{m.numeroFactura || "-"}</TableCell>}
                  {tipo === "egreso" && <TableCell>{m.tipoDocumento || "-"}</TableCell>}
                  {tipo === "egreso" && (
                    <TableCell>
                      {m.documentoUrl ? (
                        <a href={m.documentoUrl} target="_blank" rel="noopener noreferrer">
                          Ver
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  )}
                  <TableCell>{fmtCLP(m.monto)}</TableCell>
                  <TableCell>
                    {tipo === "egreso" ? (
                      <span className={`status-pill ${ESTADO_EGRESO_CLASE[m.estado] || "warn"}`}>
                        {ESTADO_EGRESO_LABEL[m.estado] || m.estado}
                      </span>
                    ) : (
                      <span className={`status-pill ${m.estado === "pagado" ? "ok" : "warn"}`}>
                        {m.estado === "pagado" ? "Pagado" : "Pendiente"}
                      </span>
                    )}
                  </TableCell>
                  {tipo !== "egreso" && (
                    <TableCell>
                      {m.metodoPago === "efectivo"
                        ? "Efectivo"
                        : m.metodoPago === "tarjeta"
                          ? "Tarjeta"
                          : m.metodoPago === "transferencia"
                            ? "Transferencia bancaria"
                            : "-"}
                    </TableCell>
                  )}
                  <TableCell className="sticky right-0 z-10 bg-background">
                    <div className="flex items-center gap-1">
                      {tipo === "egreso" ? (
                        <SelectorEstadoEgreso m={m} onChange={(v) => cambiarEstadoEgreso(m, v as MovimientoContable["estado"])} />
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => toggleEstado(m)}>
                          {m.estado === "pagado" ? "Marcar pendiente" : "Marcar pagado"}
                        </Button>
                      )}
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
    </>
  );
}
