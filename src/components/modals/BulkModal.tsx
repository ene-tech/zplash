"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { importarClientes } from "@/lib/logic";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

  const cerrar = () => patchUi({ modal: null });

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadError(false);
    setSummary(null);
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      // xlsx tiene una vulnerabilidad conocida sin parche (prototype pollution
      // + ReDoS, GHSA-4r6h-8v6p-xvw6 / GHSA-5pgg-2g8v-p4x9). Riesgo aceptado:
      // esto corre en el navegador del propio operador sobre un archivo que
      // él mismo elige subir — no expone al servidor ni a otros usuarios.
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
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carga masiva de clientes</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Sube un archivo Excel (.xlsx) con las columnas:
            <br />
            <strong>Nombre, Patente, Telefono, Email, Vehiculo, Fecha Contratacion, Tipo Documento, Razon Social, RUT, Direccion, Giro, Origen</strong>
            <br />
            <br />
            Todos los clientes quedan asignados automáticamente al &quot;Plan Ilimitado Mensual&quot;.
            <br />
            El vencimiento del plan se calcula automáticamente: 1 mes desde la Fecha de Contratación.
            <br />
            Las columnas de facturación (Razón Social, RUT, Dirección, Giro) solo se usan si Tipo Documento es
            &quot;Factura&quot;, y en ese caso son obligatorias: una fila Factura sin todas ellas se marca como error y no
            se guarda.
            <br />
            La columna Origen es opcional: escribe &quot;Web&quot; si el cliente llegó por la web, o déjala vacía / escribe
            &quot;Local&quot; si fue presencial.
            <br />
            Si la patente ya existe, se actualizan sus datos. Si no existe, se crea un cliente nuevo.
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={onFile} className="text-sm" />

          {loading && <p className="text-sm">Guardando filas, no cierres esta ventana...</p>}
          {readError && <p className="text-sm text-destructive">No se pudo leer el archivo. Verifica que sea un Excel válido.</p>}
          {summary && (
            <div className="grid gap-1.5 text-sm leading-relaxed">
              {!summary.guardadoOk && (
                <p className="font-bold text-destructive">
                  ⚠️ Los cambios se aplicaron en pantalla pero NO se pudieron guardar de forma permanente (falló el
                  almacenamiento). Revisa tu conexión y vuelve a intentar la carga; si sales de la app ahora, se
                  perderán estos cambios.
                </p>
              )}
              <p className="font-bold text-[color:var(--green)]">{summary.nuevos} nuevos creados</p>
              <p className="font-bold text-primary">{summary.actualizados} actualizados</p>
              {summary.errores.length > 0 && (
                <p className="font-bold text-destructive">
                  {summary.errores.length} filas con error (patente inválida/faltante, nombre faltante, o Factura sin Razón
                  Social/RUT/Dirección/Giro completos): filas {summary.errores.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
