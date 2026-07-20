"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { importarClientes } from "@/lib/actions";

export default function BulkModal() {
  const { data, commit, patchUi } = useApp();
  const [summary, setSummary] = useState<{
    guardadoOk: boolean;
    nuevos: number;
    actualizados: number;
    errores: number[];
  } | null>(null);
  const [readError, setReadError] = useState(false);
  const [loading, setLoading] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadError(false);
    setSummary(null);
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
      const result = importarClientes(data, rows);
      const guardadoOk = await commit(result.patch);
      setSummary({ guardadoOk, nuevos: result.nuevos, actualizados: result.actualizados, errores: result.errores });
    } catch {
      setReadError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal" style={{ maxWidth: 520 }}>
      <h3>Carga masiva de clientes</h3>
      <div className="bulk-drop">
        Sube un archivo Excel (.xlsx) con las columnas:
        <br />
        <strong>Nombre, Patente, Telefono, Email, Vehiculo, Fecha Contratacion, Tipo Documento, Razon Social, RUT, Direccion, Giro, Origen</strong>
        <br />
        <br />
        Todos los clientes quedan asignados automáticamente al &quot;Plan Ilimitado Mensual&quot;.
        <br />
        El vencimiento del plan se calcula automáticamente: 1 mes desde la Fecha de Contratación.
        <br />
        Las columnas de facturación son opcionales y solo se guardan si Tipo Documento es &quot;Factura&quot;.
        <br />
        La columna Origen es opcional: escribe &quot;Web&quot; si el cliente llegó por la web, o déjala vacía / escribe
        &quot;Local&quot; si fue presencial.
        <br />
        Si la patente ya existe, se actualizan sus datos. Si no existe, se crea un cliente nuevo.
      </div>
      <input type="file" accept=".xlsx,.xls" onChange={onFile} />
      <div id="bulkSummary">
        {loading && <div className="bulk-summary">Guardando filas, no cierres esta ventana...</div>}
        {readError && (
          <div className="bulk-summary">
            <div className="bad">No se pudo leer el archivo. Verifica que sea un Excel válido.</div>
          </div>
        )}
        {summary && (
          <div className="bulk-summary">
            {!summary.guardadoOk && (
              <div className="bad">
                ⚠️ Los cambios se aplicaron en pantalla pero NO se pudieron guardar de forma permanente (falló el
                almacenamiento). Revisa tu conexión y vuelve a intentar la carga; si sales de la app ahora, se
                perderán estos cambios.
              </div>
            )}
            <div className="ok">{summary.nuevos} nuevos creados</div>
            <div className="warn">{summary.actualizados} actualizados</div>
            {summary.errores.length > 0 && (
              <div className="bad">
                {summary.errores.length} filas con error (patente inválida/faltante o nombre faltante): filas{" "}
                {summary.errores.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => patchUi({ modal: null })}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
