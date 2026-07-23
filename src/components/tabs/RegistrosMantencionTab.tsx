"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { uid, vehiculosDesdeUltimaMantencion } from "@/lib/helpers";
import type { RegistroMantencion } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import MobileRowMenu from "@/components/tabs/MobileRowMenu";
import { Trash2 } from "lucide-react";

export default function RegistrosMantencionTab() {
  const { data, ui, patchUi, commit } = useApp();
  const maquinariasActivas = data.maquinarias.filter((m) => m.activo);

  const [maquinariaId, setMaquinariaId] = useState(maquinariasActivas[0]?.id || "");
  const [descripcion, setDescripcion] = useState("");
  const [responsable, setResponsable] = useState(ui.perfilActual?.nombre || "");
  const [costoTexto, setCostoTexto] = useState("");
  const [notas, setNotas] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const maquinariaNombre = (id: string) => data.maquinarias.find((m) => m.id === id)?.nombre || "(máquina eliminada)";

  const maquinariaSeleccionada = data.maquinarias.find((m) => m.id === maquinariaId);
  const proximoConteo = useMemo(() => {
    if (!maquinariaSeleccionada) return null;
    return vehiculosDesdeUltimaMantencion(maquinariaSeleccionada, data.registrosMantencion, data.ingresos, new Date().toISOString());
  }, [maquinariaSeleccionada, data.registrosMantencion, data.ingresos]);

  const registros = useMemo(
    () => data.registrosMantencion.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [data.registrosMantencion]
  );

  const limpiar = () => {
    setDescripcion("");
    setCostoTexto("");
    setNotas("");
  };

  const guardar = async () => {
    if (!maquinariaId) {
      setErr({ msg: "Selecciona una máquina", ok: false });
      return;
    }
    if (!descripcion.trim()) {
      setErr({ msg: "Describe la mantención realizada", ok: false });
      return;
    }
    const maquinaria = data.maquinarias.find((m) => m.id === maquinariaId);
    if (!maquinaria) {
      setErr({ msg: "La máquina seleccionada ya no existe", ok: false });
      return;
    }
    const costo = costoTexto.trim() ? Number(costoTexto) : undefined;
    if (costoTexto.trim() && (Number.isNaN(costo) || (costo as number) < 0)) {
      setErr({ msg: "El costo debe ser un número válido", ok: false });
      return;
    }

    const fecha = new Date().toISOString();
    const nuevo: RegistroMantencion = {
      id: uid(),
      maquinariaId,
      fecha,
      descripcion: descripcion.trim(),
      responsable: responsable.trim() || undefined,
      costo,
      vehiculosDesdeUltima: vehiculosDesdeUltimaMantencion(maquinaria, data.registrosMantencion, data.ingresos, fecha),
      notas: notas.trim() || undefined,
      creadoPor: ui.perfilActual?.nombre || undefined,
    };

    const ok = await commit({ registrosMantencion: [...data.registrosMantencion, nuevo] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar el registro (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Mantención registrada para "${maquinaria.nombre}".`, ok: true });
    limpiar();
  };

  const eliminarRegistro = (registro: RegistroMantencion) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el registro de mantención de "${maquinariaNombre(registro.maquinariaId)}" del ${new Date(registro.fecha).toLocaleString("es-CL")}? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => {
          commit({ registrosMantencion: data.registrosMantencion.filter((r) => r.id !== registro.id) });
        },
      },
    });
  };

  return (
    <div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Al guardar, el sistema calcula automáticamente cuántos vehículos ingresaron al túnel desde la última
        mantención registrada de la máquina elegida (o desde que se creó, si es la primera).
      </div>

      {maquinariasActivas.length === 0 ? (
        <div className="empty">Agrega una máquina activa en la pestaña Máquinas antes de registrar una mantención</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label>Máquina</label>
              <select value={maquinariaId} onChange={(e) => setMaquinariaId(e.target.value)}>
                {maquinariasActivas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 220, flex: 1 }}>
              <label>Responsable</label>
              <input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre de quien la realizó" />
            </div>
            <div className="field" style={{ minWidth: 140 }}>
              <label>Costo (opcional)</label>
              <input
                type="number"
                min={0}
                value={costoTexto}
                onChange={(e) => setCostoTexto(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="field">
            <label>Descripción</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: Cambio de cepillos laterales" />
          </div>

          <div className="field">
            <label>Notas (opcional)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalles adicionales" />
          </div>

          {proximoConteo !== null && (
            <div style={{ color: "var(--gray)", fontSize: 13, marginTop: 4 }}>
              Vehículos ingresados desde la última mantención de esta máquina: <strong>{proximoConteo}</strong>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={limpiar}>
              Limpiar
            </button>
            <button className="btn" onClick={guardar}>
              Guardar mantención
            </button>
          </div>
          <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
            {err?.msg || ""}
          </div>
        </>
      )}

      <h3 style={{ marginTop: 28 }}>Historial de mantenciones</h3>
      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {registros.length === 0 ? (
          <div className="empty">Todavía no hay mantenciones registradas</div>
        ) : (
          registros.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{maquinariaNombre(r.maquinariaId)}</div>
                <div className="truncate text-xs text-muted-foreground">{r.descripcion}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {new Date(r.fecha).toLocaleDateString("es-CL")} · {r.responsable || "Sin responsable"}
                  {r.costo != null ? ` · $${r.costo.toLocaleString("es-CL")}` : ""}
                </div>
              </div>
              {puedeBorrar && (
                <MobileRowMenu actions={[{ label: "Eliminar", icon: <Trash2 />, destructive: true, onClick: () => eliminarRegistro(r) }]} />
              )}
            </div>
          ))
        )}
      </div>

      <div className="table-scroll hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Máquina</TableHead>
              <TableHead className="max-w-[200px]">Descripción</TableHead>
              <TableHead>Vehículos desde última</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Costo</TableHead>
              <TableHead>Notas</TableHead>
              {puedeBorrar && <TableHead className="sticky right-0 z-10 w-0 bg-background" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.length === 0 ? (
              <TableRow>
                <TableCell colSpan={puedeBorrar ? 8 : 7}>
                  <div className="empty">Todavía no hay mantenciones registradas</div>
                </TableCell>
              </TableRow>
            ) : (
              registros.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.fecha).toLocaleString("es-CL")}</TableCell>
                  <TableCell>{maquinariaNombre(r.maquinariaId)}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={r.descripcion}>{r.descripcion}</TableCell>
                  <TableCell>{r.vehiculosDesdeUltima}</TableCell>
                  <TableCell>{r.responsable || "-"}</TableCell>
                  <TableCell>{r.costo != null ? `$${r.costo.toLocaleString("es-CL")}` : "-"}</TableCell>
                  <TableCell>{r.notas || "-"}</TableCell>
                  {puedeBorrar && (
                    <TableCell className="sticky right-0 z-10 bg-background">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Eliminar"
                        aria-label="Eliminar"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => eliminarRegistro(r)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
