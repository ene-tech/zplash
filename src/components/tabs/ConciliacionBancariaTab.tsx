"use client";

import { useMemo, useRef, useState } from "react";
import { Buscador } from "@/components/Buscador";
import { useApp } from "@/context/AppContext";
import { importarCartola } from "@/lib/actions";
import type { CartolaParseResult } from "@/lib/cartolaParser";
import { fmtCLP, mesActualKey, mesKey, uidMovimientoContable } from "@/lib/helpers";
import type { CartolaMovimiento, MovimientoContable } from "@/types";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MobileRowMenu, { type MobileRowAction } from "@/components/tabs/MobileRowMenu";

const SIN_VINCULAR = "sin-vincular";

interface FilaCartolaProps {
  m: CartolaMovimiento;
  categoriasConocidas: { categoria: string; grupo?: string }[];
  categoriasGastoActivas: { id: string; nombre: string }[];
  categoriasIngresoActivas: { id: string; nombre: string }[];
  vinculables: MovimientoContable[];
  onCambiarEstado: (estado: CartolaMovimiento["estado"]) => void;
  onCambiarCategoria: (categoria: string) => void;
  onGuardarRegla: (patron: string, categoria: string) => void;
  onVincular: (movimientoContableId: string) => void;
  onCrearGasto: (categoria: string, contraparte: string) => Promise<boolean>;
  onCrearIngreso: (categoria: string, contraparte: string) => Promise<boolean>;
}

// Estado y handlers compartidos entre la fila de tabla (desktop) y la
// tarjeta de lista (mobile) — ver mismo criterio en PerfilesTab.
function useFilaCartolaState(m: CartolaMovimiento, onGuardarRegla: FilaCartolaProps["onGuardarRegla"]) {
  const [categoriaTexto, setCategoriaTexto] = useState(m.categoria || "");
  const [mostrarRegla, setMostrarRegla] = useState(false);
  const [patron, setPatron] = useState(m.glosa.split(" ")[0] || "");
  const [mostrarGasto, setMostrarGasto] = useState(false);
  const [gastoCategoria, setGastoCategoria] = useState("");
  const [gastoContraparte, setGastoContraparte] = useState("");
  const [guardandoGasto, setGuardandoGasto] = useState(false);
  const [mostrarIngreso, setMostrarIngreso] = useState(false);
  const [ingresoCategoria, setIngresoCategoria] = useState("");
  const [ingresoContraparte, setIngresoContraparte] = useState("");
  const [guardandoIngreso, setGuardandoIngreso] = useState(false);

  return {
    categoriaTexto,
    setCategoriaTexto,
    mostrarRegla,
    setMostrarRegla,
    patron,
    setPatron,
    mostrarGasto,
    setMostrarGasto,
    gastoCategoria,
    setGastoCategoria,
    gastoContraparte,
    setGastoContraparte,
    guardandoGasto,
    setGuardandoGasto,
    mostrarIngreso,
    setMostrarIngreso,
    ingresoCategoria,
    setIngresoCategoria,
    ingresoContraparte,
    setIngresoContraparte,
    guardandoIngreso,
    setGuardandoIngreso,
    guardarRegla: () => {
      onGuardarRegla(patron, categoriaTexto);
      setMostrarRegla(false);
    },
  };
}

// Por ahora una sola cuenta soportada; el campo `cuenta` queda en el modelo
// para no tener que migrar el día que se agregue otra (ver plan de este módulo).
const CUENTA = "santander_empresa";

function diffDias(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function FilaCartola({
  m,
  categoriasConocidas,
  categoriasGastoActivas,
  categoriasIngresoActivas,
  vinculables,
  onCambiarEstado,
  onCambiarCategoria,
  onGuardarRegla,
  onVincular,
  onCrearGasto,
  onCrearIngreso,
}: FilaCartolaProps) {
  const {
    categoriaTexto,
    setCategoriaTexto,
    mostrarRegla,
    setMostrarRegla,
    patron,
    setPatron,
    mostrarGasto,
    setMostrarGasto,
    gastoCategoria,
    setGastoCategoria,
    gastoContraparte,
    setGastoContraparte,
    guardandoGasto,
    setGuardandoGasto,
    mostrarIngreso,
    setMostrarIngreso,
    ingresoCategoria,
    setIngresoCategoria,
    ingresoContraparte,
    setIngresoContraparte,
    guardandoIngreso,
    setGuardandoIngreso,
    guardarRegla,
  } = useFilaCartolaState(m, onGuardarRegla);

  return (
    <>
      <TableRow>
        <TableCell>{new Date(m.fecha).toLocaleDateString("es-CL")}</TableCell>
        <TableCell className="max-w-[220px] truncate" title={m.glosa}>{m.glosa}</TableCell>
        <TableCell>{m.cargo ? fmtCLP(m.cargo) : "-"}</TableCell>
        <TableCell>{m.abono ? fmtCLP(m.abono) : "-"}</TableCell>
        <TableCell>
          <Buscador
            value={categoriaTexto}
            onChange={setCategoriaTexto}
            opciones={categoriasConocidas}
            onCommit={() => {
              if (categoriaTexto !== (m.categoria || "")) onCambiarCategoria(categoriaTexto);
            }}
            placeholder="Sin clasificar"
            style={{ minWidth: 170, display: "inline-block", verticalAlign: "middle" }}
          />
          <Button variant="ghost" size="sm" onClick={() => setMostrarRegla((v) => !v)} title="Recordar esta categoría para futuras cartolas">
            Regla
          </Button>
          {mostrarRegla && (
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input
                value={patron}
                onChange={(e) => setPatron(e.target.value)}
                placeholder="Palabra clave en la glosa"
                style={{ width: 150 }}
              />
              <button className="btn ghost" onClick={guardarRegla}>
                Guardar regla
              </button>
            </div>
          )}
        </TableCell>
        <TableCell>
          <span className={`status-pill ${m.estado === "conciliado" ? "ok" : m.estado === "ignorado" ? "bad" : "warn"}`}>
            {m.estado === "conciliado" ? "Conciliado" : m.estado === "ignorado" ? "Ignorado" : "Pendiente"}
          </span>
        </TableCell>
        <TableCell className="sticky right-0 z-10 bg-background">
          <div className="flex flex-wrap items-center gap-1">
            {m.estado !== "conciliado" && (
              <Button variant="ghost" size="sm" onClick={() => onCambiarEstado("conciliado")}>
                Conciliar
              </Button>
            )}
            {m.estado === "pendiente" && (
              <Button variant="ghost" size="sm" onClick={() => onCambiarEstado("ignorado")}>
                Ignorar
              </Button>
            )}
            {m.estado !== "pendiente" && (
              <Button variant="ghost" size="sm" onClick={() => onCambiarEstado("pendiente")}>
                Reabrir
              </Button>
            )}
            <Select
              value={m.movimientoContableId || SIN_VINCULAR}
              onValueChange={(v) => onVincular(!v || v === SIN_VINCULAR ? "" : v)}
            >
              <SelectTrigger size="sm" className="max-w-[170px]">
                <SelectValue placeholder="Vincular a..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VINCULAR}>Vincular a...</SelectItem>
                {vinculables.map((mc) => (
                  <SelectItem key={mc.id} value={mc.id}>
                    {new Date(mc.fecha).toLocaleDateString("es-CL")} · {mc.descripcion} · {fmtCLP(mc.monto)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {m.cargo > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMostrarGasto((v) => !v)}>
                Crear gasto
              </Button>
            )}
            {m.abono > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setMostrarIngreso((v) => !v)}>
                Crear ingreso
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {mostrarGasto && (
        <TableRow>
          <TableCell colSpan={7}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
              <select value={gastoCategoria} onChange={(e) => setGastoCategoria(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">Selecciona tipo de gasto...</option>
                {categoriasGastoActivas.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                placeholder="Proveedor (opcional)"
                value={gastoContraparte}
                onChange={(e) => setGastoContraparte(e.target.value)}
              />
              <button
                className="btn"
                disabled={!gastoCategoria || guardandoGasto}
                onClick={async () => {
                  setGuardandoGasto(true);
                  const ok = await onCrearGasto(gastoCategoria, gastoContraparte);
                  setGuardandoGasto(false);
                  if (ok) setMostrarGasto(false);
                }}
              >
                Guardar gasto y conciliar
              </button>
            </div>
          </TableCell>
        </TableRow>
      )}
      {mostrarIngreso && (
        <TableRow>
          <TableCell colSpan={7}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
              <select value={ingresoCategoria} onChange={(e) => setIngresoCategoria(e.target.value)} style={{ minWidth: 220 }}>
                <option value="">Selecciona categoría de ingreso...</option>
                {categoriasIngresoActivas.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                placeholder="Cliente / Origen (opcional)"
                value={ingresoContraparte}
                onChange={(e) => setIngresoContraparte(e.target.value)}
              />
              <button
                className="btn"
                disabled={!ingresoCategoria || guardandoIngreso}
                onClick={async () => {
                  setGuardandoIngreso(true);
                  const ok = await onCrearIngreso(ingresoCategoria, ingresoContraparte);
                  setGuardandoIngreso(false);
                  if (ok) setMostrarIngreso(false);
                }}
              >
                Guardar ingreso y conciliar
              </button>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function FilaCartolaMobile({
  m,
  categoriasConocidas,
  categoriasGastoActivas,
  categoriasIngresoActivas,
  vinculables,
  onCambiarEstado,
  onCambiarCategoria,
  onGuardarRegla,
  onVincular,
  onCrearGasto,
  onCrearIngreso,
}: FilaCartolaProps) {
  const {
    categoriaTexto,
    setCategoriaTexto,
    mostrarGasto,
    setMostrarGasto,
    gastoCategoria,
    setGastoCategoria,
    gastoContraparte,
    setGastoContraparte,
    guardandoGasto,
    setGuardandoGasto,
    mostrarIngreso,
    setMostrarIngreso,
    ingresoCategoria,
    setIngresoCategoria,
    ingresoContraparte,
    setIngresoContraparte,
    guardandoIngreso,
    setGuardandoIngreso,
  } = useFilaCartolaState(m, onGuardarRegla);

  const acciones: MobileRowAction[] = [];
  if (m.estado !== "conciliado") acciones.push({ label: "Conciliar", onClick: () => onCambiarEstado("conciliado") });
  if (m.estado === "pendiente") acciones.push({ label: "Ignorar", onClick: () => onCambiarEstado("ignorado") });
  if (m.estado !== "pendiente") acciones.push({ label: "Reabrir", onClick: () => onCambiarEstado("pendiente") });
  if (m.cargo > 0) acciones.push({ label: "Crear gasto", onClick: () => setMostrarGasto((v) => !v) });
  if (m.abono > 0) acciones.push({ label: "Crear ingreso", onClick: () => setMostrarIngreso((v) => !v) });

  return (
    <div className="p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{new Date(m.fecha).toLocaleDateString("es-CL")}</span>
            <span className="truncate text-xs text-muted-foreground">
              {m.estado === "conciliado" ? "Conciliado" : m.estado === "ignorado" ? "Ignorado" : "Pendiente"}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">{m.glosa}</div>
          <div className="truncate text-xs text-muted-foreground">
            {m.cargo ? `Cargo ${fmtCLP(m.cargo)}` : `Abono ${fmtCLP(m.abono)}`}
          </div>
        </div>
        <MobileRowMenu actions={acciones} />
      </div>

      <div className="mt-2">
        <Buscador
          value={categoriaTexto}
          onChange={setCategoriaTexto}
          opciones={categoriasConocidas}
          onCommit={() => {
            if (categoriaTexto !== (m.categoria || "")) onCambiarCategoria(categoriaTexto);
          }}
          placeholder="Sin clasificar"
        />
      </div>

      <Select value={m.movimientoContableId || SIN_VINCULAR} onValueChange={(v) => onVincular(!v || v === SIN_VINCULAR ? "" : v)}>
        <SelectTrigger size="sm" className="mt-2 w-full">
          <SelectValue placeholder="Vincular a..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_VINCULAR}>Vincular a...</SelectItem>
          {vinculables.map((mc) => (
            <SelectItem key={mc.id} value={mc.id}>
              {new Date(mc.fecha).toLocaleDateString("es-CL")} · {mc.descripcion} · {fmtCLP(mc.monto)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {mostrarGasto && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
          <select value={gastoCategoria} onChange={(e) => setGastoCategoria(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Selecciona tipo de gasto...</option>
            {categoriasGastoActivas.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input placeholder="Proveedor (opcional)" value={gastoContraparte} onChange={(e) => setGastoContraparte(e.target.value)} />
          <button
            className="btn"
            disabled={!gastoCategoria || guardandoGasto}
            onClick={async () => {
              setGuardandoGasto(true);
              const ok = await onCrearGasto(gastoCategoria, gastoContraparte);
              setGuardandoGasto(false);
              if (ok) setMostrarGasto(false);
            }}
          >
            Guardar gasto y conciliar
          </button>
        </div>
      )}
      {mostrarIngreso && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
          <select value={ingresoCategoria} onChange={(e) => setIngresoCategoria(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Selecciona categoría de ingreso...</option>
            {categoriasIngresoActivas.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input
            placeholder="Cliente / Origen (opcional)"
            value={ingresoContraparte}
            onChange={(e) => setIngresoContraparte(e.target.value)}
          />
          <button
            className="btn"
            disabled={!ingresoCategoria || guardandoIngreso}
            onClick={async () => {
              setGuardandoIngreso(true);
              const ok = await onCrearIngreso(ingresoCategoria, ingresoContraparte);
              setGuardandoIngreso(false);
              if (ok) setMostrarIngreso(false);
            }}
          >
            Guardar ingreso y conciliar
          </button>
        </div>
      )}
    </div>
  );
}

export default function ConciliacionBancariaTab() {
  const { data, commit } = useApp();
  const [mes, setMes] = useState(mesActualKey);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState<CartolaParseResult | null>(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [importando, setImportando] = useState(false);
  const [resumenImport, setResumenImport] = useState<{ nuevos: number; duplicados: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div>
      <div className="modal" style={{ maxWidth: 640, margin: "0 0 24px 0" }}>
        <h3>Conciliación Bancaria — Santander Empresa</h3>
        <div className="field">
          <label>Periodo</label>
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <div className="field">
          <label>Subir cartola (PDF de Office Banking Santander)</label>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={onFile} disabled={subiendo} />
        </div>
        {subiendo && <div className="bulk-summary">Leyendo el PDF, no cierres esta ventana...</div>}
        {errorArchivo && (
          <div className="bulk-summary">
            <div className="bad">{errorArchivo}</div>
          </div>
        )}
        {resumenImport && (
          <div className="bulk-summary">
            <div className="ok">{resumenImport.nuevos} movimientos nuevos importados</div>
            {resumenImport.duplicados > 0 && <div className="warn">{resumenImport.duplicados} ya estaban importados (se omitieron)</div>}
          </div>
        )}
      </div>

      {preview && (
        <div className="modal" style={{ maxWidth: 900, margin: "0 0 24px 0" }}>
          <h3>Previsualización antes de importar</h3>
          <div className="stat-grid" style={{ marginBottom: 12 }}>
            <div className="stat-card">
              <div className="num">{preview.movimientos.length}</div>
              <div className="lbl">Movimientos detectados</div>
            </div>
            <div className="stat-card">
              <div className="num">{fmtCLP(preview.movimientos.reduce((s, m) => s + m.abono, 0))}</div>
              <div className="lbl">Total abonos parseado</div>
            </div>
            <div className="stat-card">
              <div className="num">{fmtCLP(preview.movimientos.reduce((s, m) => s + m.cargo, 0))}</div>
              <div className="lbl">Total cargos parseado</div>
            </div>
          </div>
          {preview.warnings.length > 0 && (
            <div className="bulk-summary" style={{ marginBottom: 12 }}>
              {preview.warnings.map((w, i) => (
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
                {preview.movimientos.map((m, i) => (
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
            <button className="btn ghost" onClick={() => setPreview(null)}>
              Descartar
            </button>
            <button className="btn" onClick={confirmarImportacion} disabled={importando || preview.movimientos.length === 0}>
              {importando ? "Importando..." : `Confirmar importación (${preview.movimientos.length})`}
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="num">{fmtCLP(totalAbonos)}</div>
          <div className="lbl">Total abonos del período</div>
        </div>
        <div className="stat-card">
          <div className="num">{fmtCLP(totalCargos)}</div>
          <div className="lbl">Total cargos del período</div>
        </div>
        <div className="stat-card warn">
          <div className="num">{pendientes}</div>
          <div className="lbl">Pendientes</div>
        </div>
        <div className="stat-card ok">
          <div className="num">{conciliados}</div>
          <div className="lbl">Conciliados</div>
        </div>
        <div className="stat-card">
          <div className="num">{ignorados}</div>
          <div className="lbl">Ignorados</div>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border md:hidden">
        {movimientosPeriodo.length === 0 ? (
          <div className="empty">Sin movimientos importados para este período</div>
        ) : (
          movimientosPeriodo.map((m) => (
            <FilaCartolaMobile
              key={m.id}
              m={m}
              categoriasConocidas={categoriasConocidas}
              categoriasGastoActivas={categoriasGastoActivas}
              categoriasIngresoActivas={categoriasIngresoActivas}
              vinculables={movimientosVinculables(m)}
              onCambiarEstado={(estado) => cambiarEstado(m, estado)}
              onCambiarCategoria={(categoria) => cambiarCategoria(m, categoria)}
              onGuardarRegla={(patron, categoria) => guardarRegla(m, patron, categoria)}
              onVincular={(id) => vincular(m, id)}
              onCrearGasto={(categoria, contraparte) => crearGastoDesdeCargo(m, categoria, contraparte)}
              onCrearIngreso={(categoria, contraparte) => crearIngresoDesdeAbono(m, categoria, contraparte)}
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
            {movimientosPeriodo.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <div className="empty">Sin movimientos importados para este período</div>
                </TableCell>
              </TableRow>
            ) : (
              movimientosPeriodo.map((m) => (
                <FilaCartola
                  key={m.id}
                  m={m}
                  categoriasConocidas={categoriasConocidas}
                  categoriasGastoActivas={categoriasGastoActivas}
                  categoriasIngresoActivas={categoriasIngresoActivas}
                  vinculables={movimientosVinculables(m)}
                  onCambiarEstado={(estado) => cambiarEstado(m, estado)}
                  onCambiarCategoria={(categoria) => cambiarCategoria(m, categoria)}
                  onGuardarRegla={(patron, categoria) => guardarRegla(m, patron, categoria)}
                  onVincular={(id) => vincular(m, id)}
                  onCrearGasto={(categoria, contraparte) => crearGastoDesdeCargo(m, categoria, contraparte)}
                  onCrearIngreso={(categoria, contraparte) => crearIngresoDesdeAbono(m, categoria, contraparte)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
