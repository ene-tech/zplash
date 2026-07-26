"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { todayYMD, uid, vehiculosDesdeUltimaMantencion } from "@/lib/helpers";
import type { AlertaMantencion, RegistroMantencion } from "@/types";

// Toda la lógica de Alertas de Mantención: agendar una alerta futura,
// completar una pendiente (genera el RegistroMantencion real), cancelarla o
// eliminarla del historial.
export function useAlertasMantencion() {
  const { data, ui, patchUi, commit } = useApp();
  const maquinariasActivas = data.maquinarias.filter((m) => m.activo);

  const [maquinariaId, setMaquinariaId] = useState(maquinariasActivas[0]?.id || "");
  const [descripcion, setDescripcion] = useState("");
  const [fechaObjetivo, setFechaObjetivo] = useState(todayYMD());
  const [notas, setNotas] = useState("");
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const [completandoId, setCompletandoId] = useState<string | null>(null);
  const [responsableCompletar, setResponsableCompletar] = useState(ui.perfilActual?.nombre || "");
  const [costoCompletarTexto, setCostoCompletarTexto] = useState("");

  const maquinariaNombre = (id: string) => data.maquinarias.find((m) => m.id === id)?.nombre || "(máquina eliminada)";

  const pendientes = useMemo(
    () =>
      data.alertasMantencion
        .filter((a) => a.estado === "pendiente")
        .slice()
        .sort((a, b) => (a.fechaObjetivo < b.fechaObjetivo ? -1 : 1)),
    [data.alertasMantencion]
  );
  const historial = useMemo(
    () =>
      data.alertasMantencion
        .filter((a) => a.estado !== "pendiente")
        .slice()
        .sort((a, b) => (a.fechaObjetivo < b.fechaObjetivo ? 1 : -1)),
    [data.alertasMantencion]
  );

  const completando = completandoId ? data.alertasMantencion.find((a) => a.id === completandoId) || null : null;

  const limpiar = () => {
    setDescripcion("");
    setFechaObjetivo(todayYMD());
    setNotas("");
  };

  const agendar = async () => {
    if (!maquinariaId) {
      setErr({ msg: "Selecciona una máquina", ok: false });
      return;
    }
    if (!descripcion.trim()) {
      setErr({ msg: "Describe la mantención a agendar", ok: false });
      return;
    }
    if (!fechaObjetivo) {
      setErr({ msg: "Elige la fecha objetivo", ok: false });
      return;
    }
    const nueva: AlertaMantencion = {
      id: uid(),
      maquinariaId,
      descripcion: descripcion.trim(),
      fechaObjetivo,
      estado: "pendiente",
      notas: notas.trim() || undefined,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || undefined,
    };
    const ok = await commit({ alertasMantencion: [...data.alertasMantencion, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar la alerta (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Alerta agendada para "${maquinariaNombre(maquinariaId)}".`, ok: true });
    limpiar();
  };

  const iniciarCompletar = (alerta: AlertaMantencion) => {
    setCompletandoId(alerta.id);
    setResponsableCompletar(ui.perfilActual?.nombre || "");
    setCostoCompletarTexto("");
  };

  const confirmarCompletar = async () => {
    if (!completando) return;
    const maquinaria = data.maquinarias.find((m) => m.id === completando.maquinariaId);
    if (!maquinaria) {
      setErr({ msg: "La máquina de esta alerta ya no existe", ok: false });
      return;
    }
    const costo = costoCompletarTexto.trim() ? Number(costoCompletarTexto) : undefined;
    if (costoCompletarTexto.trim() && (Number.isNaN(costo) || (costo as number) < 0)) {
      setErr({ msg: "El costo debe ser un número válido", ok: false });
      return;
    }

    const fecha = new Date().toISOString();
    const registro: RegistroMantencion = {
      id: uid(),
      maquinariaId: completando.maquinariaId,
      fecha,
      descripcion: completando.descripcion,
      responsable: responsableCompletar.trim() || undefined,
      costo,
      vehiculosDesdeUltima: vehiculosDesdeUltimaMantencion(maquinaria, data.registrosMantencion, data.ingresos, fecha),
      notas: completando.notas,
      creadoPor: ui.perfilActual?.nombre || undefined,
    };
    const actualizada: AlertaMantencion = {
      ...completando,
      estado: "completada",
      completadoEn: fecha,
      registroMantencionId: registro.id,
    };
    const ok = await commit({
      registrosMantencion: [...data.registrosMantencion, registro],
      alertasMantencion: data.alertasMantencion.map((a) => (a.id === completando.id ? actualizada : a)),
    });
    if (!ok) {
      setErr({ msg: "No se pudo registrar la mantención (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: `Mantención de "${maquinariaNombre(completando.maquinariaId)}" registrada.`, ok: true });
    setCompletandoId(null);
  };

  const cancelarAlerta = (alerta: AlertaMantencion) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Cancelar la alerta "${alerta.descripcion}" de "${maquinariaNombre(alerta.maquinariaId)}"? Quedará en el historial como cancelada.`,
        confirmLabel: "Cancelar alerta",
        onConfirm: () => {
          commit({
            alertasMantencion: data.alertasMantencion.map((a) =>
              a.id === alerta.id ? { ...a, estado: "cancelada" as const } : a
            ),
          });
        },
      },
    });
  };

  const eliminarAlerta = (alerta: AlertaMantencion) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar del historial la alerta "${alerta.descripcion}" de "${maquinariaNombre(alerta.maquinariaId)}"? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => {
          commit({ alertasMantencion: data.alertasMantencion.filter((a) => a.id !== alerta.id) });
        },
      },
    });
  };

  return {
    maquinariasActivas,
    maquinariaId,
    setMaquinariaId,
    descripcion,
    setDescripcion,
    fechaObjetivo,
    setFechaObjetivo,
    notas,
    setNotas,
    err,
    puedeBorrar,
    completando,
    responsableCompletar,
    setResponsableCompletar,
    costoCompletarTexto,
    setCostoCompletarTexto,
    maquinariaNombre,
    pendientes,
    historial,
    limpiar,
    agendar,
    iniciarCompletar,
    confirmarCompletar,
    cancelarAlerta,
    eliminarAlerta,
    setCompletandoId,
  };
}
