"use client";

import { useRef } from "react";
import { fmtCLP } from "@/lib/helpers";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FilaCartola } from "@/components/tabs/conciliacion/FilaCartola";
import { FilaCartolaMobile } from "@/components/tabs/conciliacion/FilaCartolaMobile";
import { useConciliacionBancaria } from "@/components/tabs/conciliacion/useConciliacionBancaria";

export default function ConciliacionBancariaTab() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const r = useConciliacionBancaria(fileInputRef);

  return (
    <div>
      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>Conciliación Bancaria — Santander Empresa</h3>
        <div className="field">
          <label>Periodo</label>
          <input type="month" value={r.mes} onChange={(e) => r.setMes(e.target.value)} />
        </div>
        <div className="field">
          <label>Subir cartola (PDF de Office Banking Santander)</label>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={r.onFile} disabled={r.subiendo} />
        </div>
        {r.subiendo && <div className="bulk-summary">Leyendo el PDF, no cierres esta ventana...</div>}
        {r.errorArchivo && (
          <div className="bulk-summary">
            <div className="bad">{r.errorArchivo}</div>
          </div>
        )}
        {r.resumenImport && (
          <div className="bulk-summary">
            <div className="ok">{r.resumenImport.nuevos} movimientos nuevos importados</div>
            {r.resumenImport.duplicados > 0 && <div className="warn">{r.resumenImport.duplicados} ya estaban importados (se omitieron)</div>}
          </div>
        )}
      </div>

      {r.preview && (
        <div className="modal" style={{ maxWidth: 900, margin: "0 0 24px 0" }}>
          <h3>Previsualización antes de importar</h3>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <div className="num">{r.preview.movimientos.length}</div>
              <div className="lbl">Movimientos detectados</div>
            </div>
            <div className="stat-card">
              <div className="num">{fmtCLP(r.preview.movimientos.reduce((s, m) => s + m.abono, 0))}</div>
              <div className="lbl">Total abonos parseado</div>
            </div>
            <div className="stat-card">
              <div className="num">{fmtCLP(r.preview.movimientos.reduce((s, m) => s + m.cargo, 0))}</div>
              <div className="lbl">Total cargos parseado</div>
            </div>
          </div>
          {r.preview.warnings.length > 0 && (
            <div className="bulk-summary" style={{ marginBottom: 12 }}>
              {r.preview.warnings.map((w, i) => (
                <div className="bad" key={i}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
          <div className="table-scroll" style={{ maxHeight: 320, marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Glosa</th>
                  <th>Cargo</th>
                  <th>Abono</th>
                </tr>
              </thead>
              <tbody>
                {r.preview.movimientos.map((m, i) => (
                  <tr key={i}>
                    <td>{new Date(m.fecha).toLocaleDateString("es-CL")}</td>
                    <td>{m.glosa}</td>
                    <td>{m.cargo ? fmtCLP(m.cargo) : "-"}</td>
                    <td>{m.abono ? fmtCLP(m.abono) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => r.setPreview(null)}>
              Descartar
            </button>
            <button className="btn" onClick={r.confirmarImportacion} disabled={r.importando || r.preview.movimientos.length === 0}>
              {r.importando ? "Importando..." : `Confirmar importación (${r.preview.movimientos.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="num">{fmtCLP(r.totalAbonos)}</div>
          <div className="lbl">Total abonos del período</div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(r.totalCargos)}</div>
          <div className="lbl">Total cargos del período</div>
        </div>
        <div className="stat-card warn">
          <div className="num">{r.pendientes}</div>
          <div className="lbl">Pendientes</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{r.conciliados}</div>
          <div className="lbl">Conciliados</div>
        </div>
        <div className="stat-card">
          <div className="num">{r.ignorados}</div>
          <div className="lbl">Ignorados</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:hidden [&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card">
        {r.movimientosPeriodo.length === 0 ? (
          <div className="empty">Sin movimientos importados para este período</div>
        ) : (
          r.movimientosPeriodo.map((m) => (
            <FilaCartolaMobile
              key={m.id}
              m={m}
              categoriasConocidas={r.categoriasConocidas}
              categoriasGastoActivas={r.categoriasGastoActivas}
              categoriasIngresoActivas={r.categoriasIngresoActivas}
              vinculables={r.movimientosVinculables(m)}
              onCambiarEstado={(estado) => r.cambiarEstado(m, estado)}
              onCambiarCategoria={(categoria) => r.cambiarCategoria(m, categoria)}
              onGuardarRegla={(patron, categoria) => r.guardarRegla(m, patron, categoria)}
              onVincular={(id) => r.vincular(m, id)}
              onCrearGasto={(categoria, contraparte) => r.crearGastoDesdeCargo(m, categoria, contraparte)}
              onCrearIngreso={(categoria, contraparte) => r.crearIngresoDesdeAbono(m, categoria, contraparte)}
            />
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Glosa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Abono</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="sticky right-0 z-10 w-0 bg-background" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.movimientosPeriodo.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">Sin movimientos importados para este período</div>
                </TableCell>
              </TableRow>
            ) : (
              r.movimientosPeriodo.map((m) => (
                <FilaCartola
                  key={m.id}
                  m={m}
                  categoriasConocidas={r.categoriasConocidas}
                  categoriasGastoActivas={r.categoriasGastoActivas}
                  categoriasIngresoActivas={r.categoriasIngresoActivas}
                  vinculables={r.movimientosVinculables(m)}
                  onCambiarEstado={(estado) => r.cambiarEstado(m, estado)}
                  onCambiarCategoria={(categoria) => r.cambiarCategoria(m, categoria)}
                  onGuardarRegla={(patron, categoria) => r.guardarRegla(m, patron, categoria)}
                  onVincular={(id) => r.vincular(m, id)}
                  onCrearGasto={(categoria, contraparte) => r.crearGastoDesdeCargo(m, categoria, contraparte)}
                  onCrearIngreso={(categoria, contraparte) => r.crearIngresoDesdeAbono(m, categoria, contraparte)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
