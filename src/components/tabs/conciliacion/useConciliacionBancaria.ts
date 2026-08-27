"use client";

import { useMemo, useState, type RefObject } from "react";
import { useAppData } from "@/context/AppContext";
import { importarCartola } from "@/lib/logic";
import type { CartolaParseResult } from "@/lib/cartolaParser";
import { mesActualKey, mesKey, uidMovimientoContable } from "@/lib/helpers";
import type { CartolaMovimiento, MovimientoContable } from "@/types";

// Por ahora una sola cuenta soportada; el campo `cuenta` queda en el modelo
// para no tener que migrar el día que se agregue otra (ver plan de este módulo).
export const CUENTA = "santander_empresa";

function diffDias(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

// Lógica de la pestaña de Conciliación Bancaria: importación de cartola PDF
// (preview + confirmación), y las acciones por movimiento (cambiar estado,
// clasificar por categoría, aprender regla, vincular a un movimiento
// contable existente, o crear uno nuevo directo desde el cargo/abono).
export function useConciliacionBancaria(fileInputRef: RefObject<HTMLInputElement | null>) {
  const { data, commit } = useAppData();
  const [mes, setMes] = useState(mesActualKey);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState<CartolaParseResult | null>(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [importando, setImportando] = useState(false);
  const [resumenImport, setResumenImport] = useState<{ nuevos: number; duplicados: number } | null>(null);

  const movimientosPeriodo = useMemo(
    () =>
      data.cartolaMovimientos
        .filter((m) => m.cuenta === CUENTA && mesKey(m.fecha) === mes)
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()),
    [data.cartolaMovimientos, mes]
  );

  // Un solo Map keyed por nombre de categoría: si el mismo nombre aparece
  // como canal de ingreso, glosa de gasto y/o regla aprendida, se muestra
  // una sola vez, priorizando el catálogo oficial (ingreso/gasto) sobre el
  // texto libre aprendido de reglas.
  const categoriasConocidas = useMemo(() => {
    const porNombre = new Map<string, { categoria: string; grupo: string }>();
    for (const r of data.reglasConciliacion) porNombre.set(r.categoria, { categoria: r.categoria, grupo: "Usado antes" });
    for (const c of data.categoriasGasto) if (c.activa) porNombre.set(c.nombre, { categoria: c.nombre, grupo: "Categoría de gasto" });
    for (const c of data.categoriasIngreso) if (c.activa) porNombre.set(c.nombre, { categoria: c.nombre, grupo: "Categoría de ingreso" });
    return Array.from(porNombre.values()).sort((a, b) => a.categoria.localeCompare(b.categoria));
  }, [data.categoriasIngreso, data.categoriasGasto, data.reglasConciliacion]);

  const categoriasGastoActivas = useMemo(() => data.categoriasGasto.filter((c) => c.activa), [data.categoriasGasto]);
  const categoriasIngresoActivas = useMemo(() => data.categoriasIngreso.filter((c) => c.activa), [data.categoriasIngreso]);

  const totalAbonos = movimientosPeriodo.reduce((s, m) => s + m.abono, 0);
  const totalCargos = movimientosPeriodo.reduce((s, m) => s + m.cargo, 0);
  const pendientes = movimientosPeriodo.filter((m) => m.estado === "pendiente").length;
  const conciliados = movimientosPeriodo.filter((m) => m.estado === "conciliado").length;
  const ignorados = movimientosPeriodo.filter((m) => m.estado === "ignorado").length;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setErrorArchivo("");
    setResumenImport(null);
    setPreview(null);
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      const res = await fetch("/api/conciliacion/parsear-cartola", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setErrorArchivo(json.error || "No se pudo leer el archivo");
        return;
      }
      setPreview(json as CartolaParseResult);
    } catch {
      setErrorArchivo("No se pudo leer el archivo. Verifica tu conexión.");
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmarImportacion = async () => {
    if (!preview) return;
    setImportando(true);
    const resultado = importarCartola(data, preview.movimientos, CUENTA);
    const ok = await commit(resultado.patch);
    setImportando(false);
    if (!ok) {
      setErrorArchivo("No se pudo guardar (sin conexión). Intenta de nuevo.");
      return;
    }
    setResumenImport({ nuevos: resultado.nuevos, duplicados: resultado.duplicados });
    setPreview(null);
  };

  const cambiarEstado = (m: CartolaMovimiento, estado: CartolaMovimiento["estado"]) => {
    commit({ cartolaMovimientos: data.cartolaMovimientos.map((x) => (x.id === m.id ? { ...x, estado } : x)) });
  };

  const cambiarCategoria = (m: CartolaMovimiento, categoria: string) => {
    commit({
      cartolaMovimientos: data.cartolaMovimientos.map((x) => (x.id === m.id ? { ...x, categoria: categoria || undefined } : x)),
    });
  };

  const guardarRegla = (m: CartolaMovimiento, patronTexto: string, categoria: string) => {
    if (!patronTexto.trim() || !categoria.trim()) return;
    const id = patronTexto.trim().toUpperCase();
    const reglas = [
      ...data.reglasConciliacion.filter((r) => r.id !== id),
      { id, categoria: categoria.trim(), creadoEn: new Date().toISOString() },
    ];
    // Además de esta fila, aplica la regla nueva a otras filas pendientes sin
    // categoría cuya glosa también calce — así "enseñar" una glosa clasifica
    // de una vez el resto del período, no solo la fila que se editó.
    const cartola = data.cartolaMovimientos.map((x) =>
      !x.categoria && x.glosa.toUpperCase().includes(id) ? { ...x, categoria: categoria.trim() } : x
    );
    commit({ reglasConciliacion: reglas, cartolaMovimientos: cartola });
  };

  const vincular = (m: CartolaMovimiento, movimientoContableId: string) => {
    commit({
      cartolaMovimientos: data.cartolaMovimientos.map((x) =>
        x.id === m.id
          ? { ...x, movimientoContableId: movimientoContableId || undefined, estado: movimientoContableId ? "conciliado" : "pendiente" }
          : x
      ),
    });
  };

  const movimientosVinculables = (m: CartolaMovimiento): MovimientoContable[] => {
    const tipoBuscado = m.abono > 0 ? "ingreso" : "egreso";
    const yaVinculados = new Set(
      data.cartolaMovimientos.filter((x) => x.id !== m.id && x.movimientoContableId).map((x) => x.movimientoContableId)
    );
    return data.movimientosContables
      .filter((mc) => mc.tipo === tipoBuscado && !yaVinculados.has(mc.id))
      .sort((a, b) => diffDias(a.fecha, m.fecha) - diffDias(b.fecha, m.fecha))
      .slice(0, 30);
  };

  const crearGastoDesdeCargo = async (m: CartolaMovimiento, categoria: string, contraparte: string): Promise<boolean> => {
    const id = uidMovimientoContable();
    const nuevo: MovimientoContable = {
      id,
      tipo: "egreso",
      fecha: m.fecha,
      descripcion: m.glosa,
      categoria: categoria.trim(),
      contraparte: contraparte.trim() || undefined,
      monto: m.cargo,
      estado: "pagado_cc",
      creadoEn: new Date().toISOString(),
      creadoPor: "Conciliación Bancaria",
      fechaPago: m.fecha,
    };
    return commit({
      movimientosContables: [nuevo, ...data.movimientosContables],
      cartolaMovimientos: data.cartolaMovimientos.map((x) => (x.id === m.id ? { ...x, movimientoContableId: id, estado: "conciliado" } : x)),
    });
  };

  const crearIngresoDesdeAbono = async (m: CartolaMovimiento, categoria: string, contraparte: string): Promise<boolean> => {
    const id = uidMovimientoContable();
    const nuevo: MovimientoContable = {
      id,
      tipo: "ingreso",
      fecha: m.fecha,
      descripcion: categoria.trim() + (contraparte.trim() ? ` – ${contraparte.trim()}` : ""),
      categoria: categoria.trim(),
      contraparte: contraparte.trim() || undefined,
      monto: m.abono,
      estado: "pagado",
      metodoPago: "transferencia",
      creadoEn: new Date().toISOString(),
      creadoPor: "Conciliación Bancaria",
    };
    return commit({
      movimientosContables: [nuevo, ...data.movimientosContables],
      cartolaMovimientos: data.cartolaMovimientos.map((x) => (x.id === m.id ? { ...x, movimientoContableId: id, estado: "conciliado" } : x)),
    });
  };

  return {
    mes,
    setMes,
    subiendo,
    preview,
    setPreview,
    errorArchivo,
    importando,
    resumenImport,
    movimientosPeriodo,
    categoriasConocidas,
    categoriasGastoActivas,
    categoriasIngresoActivas,
    totalAbonos,
    totalCargos,
    pendientes,
    conciliados,
    ignorados,
    onFile,
    confirmarImportacion,
    cambiarEstado,
    cambiarCategoria,
    guardarRegla,
    vincular,
    movimientosVinculables,
    crearGastoDesdeCargo,
    crearIngresoDesdeAbono,
  };
}
