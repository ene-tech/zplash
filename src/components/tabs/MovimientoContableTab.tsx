"use client";

import { useRef } from "react";
import { fmtCLP } from "@/lib/helpers";
import type { MovimientoContable } from "@/types";
import { useMovimientoContableForm } from "@/components/tabs/movimientoContable/useMovimientoContableForm";
import { useMovimientosContablesList } from "@/components/tabs/movimientoContable/useMovimientosContablesList";
import MovimientoContableForm from "@/components/tabs/movimientoContable/MovimientoContableForm";
import MovimientoContableTable from "@/components/tabs/movimientoContable/MovimientoContableTable";

export default function MovimientoContableTab({ tipo, titulo }: { tipo: MovimientoContable["tipo"]; titulo: string }) {
  const fechaRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLInputElement>(null);
  const contraparteRef = useRef<HTMLInputElement>(null);
  const rutProveedorRef = useRef<HTMLInputElement>(null);
  const numeroFacturaRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const archivoInputRef = useRef<HTMLInputElement>(null);

  const form = useMovimientoContableForm(tipo, {
    fechaRef,
    descripcionRef,
    contraparteRef,
    rutProveedorRef,
    numeroFacturaRef,
    notasRef,
    archivoInputRef,
  });
  const lista = useMovimientosContablesList(tipo);

  return (
    <div>
      <MovimientoContableForm
        {...form}
        tipo={tipo}
        titulo={titulo}
        fechaRef={fechaRef}
        descripcionRef={descripcionRef}
        contraparteRef={contraparteRef}
        rutProveedorRef={rutProveedorRef}
        numeroFacturaRef={numeroFacturaRef}
        notasRef={notasRef}
        archivoInputRef={archivoInputRef}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="num">{fmtCLP(lista.total)}</div>
          <div className="lbl">Total</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{fmtCLP(lista.totalPagado)}</div>
          <div className="lbl">Pagado</div>
        </div>
        {tipo === "egreso" && (
          <div className="stat-card warn">
            <div className="num">{fmtCLP(lista.totalXRendir)}</div>
            <div className="lbl">X Rendir</div>
          </div>
        )}
        <div className="stat-card warn">
          <div className="num">{fmtCLP(lista.totalPendiente)}</div>
          <div className="lbl">{tipo === "egreso" ? "Pendiente de Pago" : "Pendiente"}</div>
        </div>
      </div>

      {tipo === "ingreso" && (
        <div style={{ marginBottom: 20 }}>
          <h3>Cierre de caja diario</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>N° Registros</th>
                  <th>Efectivo</th>
                  <th>Tarjeta</th>
                  <th>Transferencia</th>
                  <th>Pendiente</th>
                  <th>Total del día</th>
                </tr>
              </thead>
              <tbody>
                {lista.cierreDiario.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Sin registros</div>
                    </td>
                  </tr>
                ) : (
                  lista.cierreDiario.map((d) => (
                    <tr key={d.dia}>
                      <td>{new Date(d.dia + "T12:00:00").toLocaleDateString("es-CL")}</td>
                      <td>{d.cantidad}</td>
                      <td>{fmtCLP(d.efectivo)}</td>
                      <td>{fmtCLP(d.tarjeta)}</td>
                      <td>{fmtCLP(d.transferencia)}</td>
                      <td>{fmtCLP(d.pendiente)}</td>
                      <td>
                        <strong>{fmtCLP(d.total)}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input
          placeholder="Buscar por descripción, categoría o contraparte..."
          value={lista.busqueda}
          onChange={(e) => lista.setBusqueda(e.target.value)}
        />
      </div>

      <MovimientoContableTable
        tipo={tipo}
        items={lista.items}
        toggleEstado={lista.toggleEstado}
        cambiarEstadoEgreso={lista.cambiarEstadoEgreso}
        eliminar={lista.eliminar}
      />
    </div>
  );
}
