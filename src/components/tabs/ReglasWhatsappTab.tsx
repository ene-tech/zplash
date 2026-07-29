"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES, uid } from "@/lib/helpers";
import type { AccionReglaWhatsapp, ReglaWhatsapp, TipoEventoReglaWhatsapp } from "@/types";
import { BadgeAprobadoMeta } from "./BadgeAprobadoMeta";

const TIPOS_VENTA_CONOCIDOS = [
  "Lavado único",
  "Plan nuevo",
  "Renovación preferencial",
  "Reactivación promocional",
  "Plan nuevo (Web)",
  "Renovación (Web)",
  "Renovación automática (Oneclick)",
];

function resumenCondicion(r: ReglaWhatsapp): string {
  if (r.tipoEvento === "venta_creada") {
    const tipo = r.condicionTipoVenta || "cualquier tipo de venta";
    const planes = r.condicionPlanes?.length ? ` (plan: ${r.condicionPlanes.join(", ")})` : "";
    const delay = r.delayDias ? `, ${r.delayDias} día(s) después` : ", de inmediato";
    return `Al vender "${tipo}"${planes}${delay}`;
  }
  if (r.tipoEvento === "cobro_fallido") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    return `Al fallar un cobro automático (Oneclick)${planes}`;
  }
  if (r.tipoEvento === "ingreso_plan_registrado") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    return `Al registrar el ingreso de un cliente con plan vigente${planes}`;
  }
  if (r.tipoEvento === "primer_ingreso_mes") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    return `En el primer ingreso del mes de un cliente con plan vigente${planes}`;
  }
  if (r.tipoEvento === "cambio_patente") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    return `Al aplicarse un cambio de patente${planes}`;
  }
  const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
  return `${r.condicionDiasAntesVencimiento ?? 0} día(s) antes del vencimiento${planes}`;
}

function ReglaRow({ regla, puedeBorrar }: { regla: ReglaWhatsapp; puedeBorrar: boolean }) {
  const { data, commit } = useApp();
  const plantilla = data.plantillasWhatsapp.find((p) => p.id === regla.plantillaWhatsappId);

  const toggleActiva = () => {
    commit({ reglasWhatsapp: data.reglasWhatsapp.map((r) => (r.id === regla.id ? { ...r, activa: !r.activa } : r)) });
  };

  const borrar = () => {
    commit({ reglasWhatsapp: data.reglasWhatsapp.filter((r) => r.id !== regla.id) });
  };

  return (
    <div className="vehicle-card" style={{ opacity: regla.activa ? 1 : 0.6, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{regla.nombre}</div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 4 }}>
        {resumenCondicion(regla)}
      </div>
      <div className="hint" style={{ textAlign: "left", fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>
          {regla.accion === "cupon_descuento"
            ? `Genera descuento: ${regla.cuponEsPorcentaje ? `${regla.cuponValor}%` : `$${regla.cuponValor}`}, válido ${regla.cuponValidezDias} día(s)`
            : "Solo manda el mensaje (sin descuento)"}
          {" · Plantilla: "}
          {plantilla?.nombre || "(eliminada)"}
        </span>
        {plantilla && <BadgeAprobadoMeta aprobado={plantilla.metaAprobado} />}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="icon-btn" onClick={toggleActiva}>
          {regla.activa ? "Desactivar" : "Reactivar"}
        </button>
        {puedeBorrar && (
          <button className="icon-btn" onClick={borrar}>
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReglasWhatsappTab() {
  const { data, ui, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const nombreRef = useRef<HTMLInputElement>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEventoReglaWhatsapp>("venta_creada");
  const condicionTipoVentaRef = useRef<HTMLInputElement>(null);
  const [planesElegidos, setPlanesElegidos] = useState<string[]>([]);
  const diasAntesRef = useRef<HTMLInputElement>(null);
  const delayDiasRef = useRef<HTMLInputElement>(null);
  const [accion, setAccion] = useState<AccionReglaWhatsapp>("cupon_descuento");
  const [cuponEsPorcentaje, setCuponEsPorcentaje] = useState(false);
  const cuponValorRef = useRef<HTMLInputElement>(null);
  const cuponValidezDiasRef = useRef<HTMLInputElement>(null);
  const [plantillaId, setPlantillaId] = useState("");

  const togglePlan = (plan: string) => {
    setPlanesElegidos((prev) => (prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan]));
  };

  const agregar = async () => {
    const nombre = nombreRef.current?.value.trim() || "";
    if (!nombre) {
      setErr({ msg: "El nombre de la regla es obligatorio", ok: false });
      return;
    }
    if (!plantillaId) {
      setErr({ msg: "Elige una plantilla de WhatsApp", ok: false });
      return;
    }
    const cuponValor = Number(cuponValorRef.current?.value || 0);
    if (accion === "cupon_descuento" && (!cuponValor || cuponValor <= 0)) {
      setErr({ msg: "Ingresa el valor del descuento", ok: false });
      return;
    }

    const nueva: ReglaWhatsapp = {
      id: uid(),
      nombre,
      activa: true,
      tipoEvento,
      condicionTipoVenta: tipoEvento === "venta_creada" ? condicionTipoVentaRef.current?.value.trim() || undefined : undefined,
      condicionPlanes: planesElegidos.length ? planesElegidos : undefined,
      condicionDiasAntesVencimiento:
        tipoEvento === "plan_proximo_vencer" ? Number(diasAntesRef.current?.value || 0) : undefined,
      delayDias: tipoEvento === "venta_creada" ? Number(delayDiasRef.current?.value || 0) : 0,
      accion,
      cuponEsPorcentaje: accion === "cupon_descuento" ? cuponEsPorcentaje : undefined,
      cuponValor: accion === "cupon_descuento" ? cuponValor : undefined,
      cuponValidezDias: accion === "cupon_descuento" ? Number(cuponValidezDiasRef.current?.value || 7) : undefined,
      plantillaWhatsappId: plantillaId,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || undefined,
    };

    const ok = await commit({ reglasWhatsapp: [...data.reglasWhatsapp, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Regla agregada correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (condicionTipoVentaRef.current) condicionTipoVentaRef.current.value = "";
    if (diasAntesRef.current) diasAntesRef.current.value = "";
    if (delayDiasRef.current) delayDiasRef.current.value = "";
    if (cuponValorRef.current) cuponValorRef.current.value = "";
    if (cuponValidezDiasRef.current) cuponValidezDiasRef.current.value = "";
    setPlanesElegidos([]);
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Nueva regla WhatsApp</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Define cuándo el sistema le escribe a un cliente por WhatsApp: al registrarse una venta que coincida, o unos
          días antes de que venza su plan. Las plantillas se administran en la pestaña &quot;WhatsApp Webhooks&quot;.
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Nombre de la regla</label>
          <input ref={nombreRef} placeholder="Ej: Descuento retorno lavado único" />
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Evento que dispara la regla</label>
          <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as TipoEventoReglaWhatsapp)}>
            <option value="venta_creada">Se registra una venta</option>
            <option value="plan_proximo_vencer">El plan de un cliente está por vencer</option>
            <option value="cobro_fallido">No se pudo cobrar la mensualidad (Oneclick)</option>
            <option value="ingreso_plan_registrado">Se registra el ingreso de un cliente con plan vigente</option>
            <option value="primer_ingreso_mes">Cliente con plan vigente ingresa por primera vez en el mes</option>
            <option value="cambio_patente">Se aplica un cambio de patente</option>
          </select>
        </div>

        {tipoEvento === "venta_creada" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="field" style={{ flex: 1, minWidth: 200, margin: 0 }}>
              <label>Tipo de venta (vacío = cualquiera)</label>
              <input ref={condicionTipoVentaRef} placeholder="Ej: Lavado único" list="tipos-venta-reglas" />
              <datalist id="tipos-venta-reglas">
                {TIPOS_VENTA_CONOCIDOS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="field" style={{ width: 160, margin: 0 }}>
              <label>Esperar (días)</label>
              <input ref={delayDiasRef} type="number" min={0} defaultValue={0} />
            </div>
          </div>
        )}

        {tipoEvento === "plan_proximo_vencer" && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Días antes del vencimiento</label>
            <input ref={diasAntesRef} type="number" min={0} defaultValue={5} />
          </div>
        )}

        {PLANES.length > 1 && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Restringir a planes (vacío = todos)</label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {PLANES.map((p) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400 }}>
                  <input type="checkbox" checked={planesElegidos.includes(p)} onChange={() => togglePlan(p)} />
                  {p}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Acción</label>
          <select value={accion} onChange={(e) => setAccion(e.target.value as AccionReglaWhatsapp)}>
            <option value="cupon_descuento">Generar descuento (reconocido por patente al volver)</option>
            <option value="mensaje_simple">Solo enviar el mensaje</option>
          </select>
        </div>

        {accion === "cupon_descuento" && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Tipo</label>
              <select value={cuponEsPorcentaje ? "pct" : "monto"} onChange={(e) => setCuponEsPorcentaje(e.target.value === "pct")}>
                <option value="monto">Monto fijo ($)</option>
                <option value="pct">Porcentaje (%)</option>
              </select>
            </div>
            <div className="field" style={{ width: 140, margin: 0 }}>
              <label>Valor</label>
              <input ref={cuponValorRef} type="number" min={0} placeholder={cuponEsPorcentaje ? "Ej: 20" : "Ej: 4990"} />
            </div>
            <div className="field" style={{ width: 140, margin: 0 }}>
              <label>Válido por (días)</label>
              <input ref={cuponValidezDiasRef} type="number" min={1} defaultValue={7} />
            </div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Plantilla de WhatsApp a enviar</label>
          <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
            <option value="">Elige una plantilla...</option>
            {data.plantillasWhatsapp
              .filter((p) => p.activo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </div>

        <div className="err" style={{ color: err?.ok ? "var(--green)" : undefined }}>
          {err?.msg || ""}
        </div>
        <button className="btn" onClick={agregar}>
          Agregar regla
        </button>
      </div>

      {data.reglasWhatsapp.length === 0 ? (
        <div className="hint">Todavía no hay reglas configuradas.</div>
      ) : (
        data.reglasWhatsapp.map((r) => <ReglaRow key={r.id} regla={r} puedeBorrar={puedeBorrar} />)
      )}
    </div>
  );
}
