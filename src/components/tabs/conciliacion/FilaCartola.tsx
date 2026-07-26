"use client";

import { Buscador } from "@/components/Buscador";
import { fmtCLP } from "@/lib/helpers";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SIN_VINCULAR, useFilaCartolaState, type FilaCartolaProps } from "./useFilaCartolaState";

export function FilaCartola({
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
