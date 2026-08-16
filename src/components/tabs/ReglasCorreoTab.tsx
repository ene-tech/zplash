"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES, uid } from "@/lib/helpers";
import { enviarInvitacionesMigracionWoo } from "@/lib/serverActions";
import type { ReglaCorreo, ResultadoEnvioMasivoCorreo, TipoEventoReglaCorreo } from "@/types";

const TIPOS_VENTA_CONOCIDOS = [
  "Lavado único",
  "Plan nuevo",
  "Renovación preferencial",
  "Reactivación promocional",
  "Plan nuevo (Web)",
  "Renovación (Web)",
  "Renovación automática (Oneclick)",
];

function resumenCondicion(r: ReglaCorreo): string {
  if (r.tipoEvento === "venta_creada" || r.tipoEvento === "venta_creada_presencial") {
    const tipo = r.condicionTipoVenta || "cualquier tipo de venta";
    const planes = r.condicionPlanes?.length ? ` (plan: ${r.condicionPlanes.join(", ")})` : "";
    const presencial = r.tipoEvento === "venta_creada_presencial" ? " presencial (no web/automática)" : "";
    return `Al vender "${tipo}"${presencial}${planes}, de inmediato`;
  }
  if (r.tipoEvento === "cobro_fallido") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    return `Al fallar un cobro automático (Oneclick)${planes}`;
  }
  if (r.tipoEvento === "plan_vencido") {
    const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
    const dias = r.condicionDiasDespuesVencimiento || 0;
    const cuando = dias > 0 ? `${dias} día(s) después de vencer el plan` : "Al día siguiente de vencer el plan";
    return `${cuando}${planes}`;
  }
  if (r.tipoEvento === "migracion_woo_legacy") {
    return `Solo al apretar "Enviar invitaciones" más abajo (no automático)`;
  }
  if (r.tipoEvento === "envio_manual") {
    return `No dispara sola — la crea "Correos Únicos" para poder registrar ahí sus envíos puntuales`;
  }
  const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
  const soloSinAutopago = r.condicionSoloSinAutopago ? " · solo clientes sin pago automático activo" : "";
  const soloConPromo = r.condicionSoloConPromoRenovacion ? " · solo con promoción de renovación vigente" : "";
  return `${r.condicionDiasAntesVencimiento ?? 0} día(s) antes del vencimiento${planes}${soloSinAutopago}${soloConPromo}`;
}

function ReglaRow({ regla, puedeBorrar }: { regla: ReglaCorreo; puedeBorrar: boolean }) {
  const { data, commit } = useApp();
  const plantilla = data.plantillasCorreo.find((p) => p.id === regla.plantillaCorreoId);

  const toggleActiva = () => {
    commit({ reglasCorreo: data.reglasCorreo.map((r) => (r.id === regla.id ? { ...r, activa: !r.activa } : r)) });
  };

  const borrar = () => {
    commit({ reglasCorreo: data.reglasCorreo.filter((r) => r.id !== regla.id) });
  };

  return (
    <div className="vehicle-card" style={{ opacity: regla.activa ? 1 : 0.6, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{regla.nombre}</div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 8 }}>
        {resumenCondicion(regla)} · Plantilla: {plantilla?.nombre || "(eliminada)"}
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

function MigracionWooCard() {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioMasivoCorreo | null>(null);

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    const r = await enviarInvitacionesMigracionWoo();
    setResultado(r);
    setEnviando(false);
  };

  return (
    <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
      <h3>Migrar clientes de WooCommerce</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
        Envía la plantilla de la regla &quot;migracion_woo_legacy&quot; (crea una más abajo si todavía no existe) a
        todos los clientes cuya renovación automática aún la cobra el sistema anterior (WooCommerce Subscriptions) —
        ver &quot;Gestionada por nuestro sistema anterior&quot; en Mi Cuenta. Solo invita: el cliente tiene que
        reinscribir su tarjeta él mismo, Transbank no permite hacerlo por atrás. Apretar el botón de nuevo solo
        alcanza a los que falten, no reenvía a quien ya recibió la invitación.
      </div>
      <button className="btn" onClick={enviar} disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar invitaciones"}
      </button>
      {resultado && (
        <div className="err" style={{ color: resultado.fallidos ? undefined : "var(--green)", marginTop: 10 }}>
          {resultado.total === 0
            ? "No hay ninguna regla activa de tipo \"migracion_woo_legacy\" — créala más abajo primero."
            : `Enviado a ${resultado.enviados} de ${resultado.total} cliente(s) con renovación WooCommerce.`}
          {resultado.fallidos ? ` ${resultado.fallidos} fallaron.` : ""}
          {resultado.sinEmail ? ` ${resultado.sinEmail} sin email registrado.` : ""}
        </div>
      )}
    </div>
  );
}

export default function ReglasCorreoTab() {
  const { data, ui, commit } = useApp();
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const nombreRef = useRef<HTMLInputElement>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEventoReglaCorreo>("venta_creada");
  const condicionTipoVentaRef = useRef<HTMLInputElement>(null);
  const [planesElegidos, setPlanesElegidos] = useState<string[]>([]);
  const diasAntesRef = useRef<HTMLInputElement>(null);
  const diasDespuesRef = useRef<HTMLInputElement>(null);
  const [soloSinAutopago, setSoloSinAutopago] = useState(false);
  const [soloConPromoRenovacion, setSoloConPromoRenovacion] = useState(false);
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
      setErr({ msg: "Elige una plantilla de correo", ok: false });
      return;
    }

    const nueva: ReglaCorreo = {
      id: uid(),
      nombre,
      activa: true,
      tipoEvento,
      condicionTipoVenta:
        tipoEvento === "venta_creada" || tipoEvento === "venta_creada_presencial"
          ? condicionTipoVentaRef.current?.value.trim() || undefined
          : undefined,
      condicionPlanes: planesElegidos.length ? planesElegidos : undefined,
      condicionDiasAntesVencimiento: tipoEvento === "plan_proximo_vencer" ? Number(diasAntesRef.current?.value || 0) : undefined,
      condicionSoloSinAutopago: tipoEvento === "plan_proximo_vencer" ? soloSinAutopago : undefined,
      condicionSoloConPromoRenovacion: tipoEvento === "plan_proximo_vencer" ? soloConPromoRenovacion : undefined,
      condicionDiasDespuesVencimiento: tipoEvento === "plan_vencido" ? Number(diasDespuesRef.current?.value || 0) : undefined,
      delayDias: 0,
      plantillaCorreoId: plantillaId,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || undefined,
    };

    const ok = await commit({ reglasCorreo: [...data.reglasCorreo, nueva] });
    if (!ok) {
      setErr({ msg: "No se pudo guardar (sin conexión). Intenta de nuevo.", ok: false });
      return;
    }
    setErr({ msg: "Regla agregada correctamente", ok: true });
    if (nombreRef.current) nombreRef.current.value = "";
    if (condicionTipoVentaRef.current) condicionTipoVentaRef.current.value = "";
    if (diasAntesRef.current) diasAntesRef.current.value = "";
    if (diasDespuesRef.current) diasDespuesRef.current.value = "";
    setPlanesElegidos([]);
    setSoloSinAutopago(false);
    setSoloConPromoRenovacion(false);
  };

  return (
    <div>
      <MigracionWooCard />

      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Nueva regla de correo</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Define cuándo el sistema le manda un correo a un cliente: al registrarse una venta que coincida, al fallar
          un cobro automático, o cerca del vencimiento de su plan. Las plantillas (asunto y cuerpo) se administran en
          la pestaña &quot;Mail Templates&quot;.
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Nombre de la regla</label>
          <input ref={nombreRef} placeholder="Ej: Confirmación de compra" />
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Evento que dispara la regla</label>
          <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as TipoEventoReglaCorreo)}>
            <option value="venta_creada">Se registra una venta</option>
            <option value="venta_creada_presencial">Se registra una venta presencial (no web/automática)</option>
            <option value="cobro_fallido">No se pudo cobrar la mensualidad (Oneclick)</option>
            <option value="plan_proximo_vencer">El plan de un cliente está por vencer</option>
            <option value="plan_vencido">El plan de un cliente acaba de vencer</option>
            <option value="migracion_woo_legacy">Campaña &quot;Migrar clientes de WooCommerce&quot; (manual, ver arriba)</option>
          </select>
        </div>

        {(tipoEvento === "venta_creada" || tipoEvento === "venta_creada_presencial") && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Tipo de venta (vacío = cualquiera)</label>
            <input ref={condicionTipoVentaRef} placeholder="Ej: Lavado único" list="tipos-venta-reglas-correo" />
            <datalist id="tipos-venta-reglas-correo">
              {TIPOS_VENTA_CONOCIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        )}

        {tipoEvento === "plan_proximo_vencer" && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Días antes del vencimiento</label>
            <input ref={diasAntesRef} type="number" min={0} defaultValue={5} />
          </div>
        )}

        {tipoEvento === "plan_proximo_vencer" && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
              <input type="checkbox" checked={soloSinAutopago} onChange={(e) => setSoloSinAutopago(e.target.checked)} />
              Solo clientes sin pago automático activo
            </label>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
              No le avisa a un cliente Web que ya tiene tarjeta Oneclick registrada (a ese el cobro automático lo va a
              renovar solo). Los clientes de local siempre reciben el aviso.
            </div>
          </div>
        )}

        {tipoEvento === "plan_proximo_vencer" && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={soloConPromoRenovacion}
                onChange={(e) => setSoloConPromoRenovacion(e.target.checked)}
              />
              Solo clientes con promoción de renovación vigente
            </label>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
              Manda el correo únicamente a quien tenga un precio preferencial de renovación disponible por la web (ver
              Configuración → Precios de planes): así el cliente que viene mucho, que renovaría al precio normal, queda
              fuera de la invitación. Usa <code>{"{{precioRenovacion}}"}</code> en la plantilla para mostrar ese precio.
            </div>
          </div>
        )}

        {tipoEvento === "plan_vencido" && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Días de demora después del vencimiento</label>
            <input ref={diasDespuesRef} type="number" min={0} defaultValue={0} />
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
              0 = avisa al día siguiente de vencer. Con, por ejemplo, 3 días, le da tiempo a un reintento de cobro
              automático antes de mandar el correo — útil para una regla aparte dirigida a clientes a los que no se
              les pudo cargar el plan.
            </div>
          </div>
        )}

        {PLANES.length > 1 && tipoEvento !== "migracion_woo_legacy" && (
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
          <label>Plantilla de correo a enviar</label>
          <select value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
            <option value="">Elige una plantilla...</option>
            {data.plantillasCorreo
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

      {data.reglasCorreo.length === 0 ? (
        <div className="hint">Todavía no hay reglas configuradas.</div>
      ) : (
        data.reglasCorreo.map((r) => <ReglaRow key={r.id} regla={r} puedeBorrar={puedeBorrar} />)
      )}
    </div>
  );
}
