"use client";

import { Buscador } from "@/components/Buscador";
import { fmtCLP } from "@/lib/helpers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MobileRowMenu, { type MobileRowAction } from "@/components/tabs/MobileRowMenu";
import { MobileRecordCard, MobileRecordMeta, MobileRecordAvatar } from "@/components/MobileRecordCard";
import { Landmark } from "lucide-react";
import { ESTADO_LABEL, ESTADO_TONE, SIN_VINCULAR, useFilaCartolaState, type FilaCartolaProps } from "./useFilaCartolaState";

export function FilaCartolaMobile({
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
    <MobileRecordCard
      avatar={<MobileRecordAvatar icon={Landmark} tone={ESTADO_TONE[m.estado]} />}
      title={new Date(m.fecha).toLocaleDateString("es-CL")}
      subtitle={m.glosa}
      menu={<MobileRowMenu actions={acciones} />}
      meta={
        <MobileRecordMeta
          left={<span className={`status-pill ${ESTADO_TONE[m.estado]}`}>{ESTADO_LABEL[m.estado]}</span>}
          right={<div className="font-medium">{m.cargo ? `Cargo ${fmtCLP(m.cargo)}` : `Abono ${fmtCLP(m.abono)}`}</div>}
        />
      }
    >
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
    </MobileRecordCard>
  );
}
