"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { PASES_INCLUIDOS_X5, PLANES, TIPOS_VENTA_PLAN, uid } from "@/lib/helpers";
import { enviarInvitacionesMigracionWoo } from "@/lib/serverActions";
import type { ReglaCorreo, ResultadoEnvioMasivoCorreo, TipoEventoReglaCorreo } from "@/types";

// Opciones del selector "al vender X". Salen de TIPOS_VENTA_PLAN para que un
// canal nuevo no quede sin poder disparar reglas: esta lista era una copia a
// mano y se había quedado sin las promos cobradas por Webpay/Oneclick, así que
// no había forma de mandarle un correo a quien reactivaba su plan por la web.
// "Lavado único" se agrega aparte porque no es una venta de plan.
const TIPOS_VENTA_CONOCIDOS = ["Lavado único", ...TIPOS_VENTA_PLAN];

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
    const pasadas = r.condicionPasadasMax != null ? ` · solo hasta ${r.condicionPasadasMax} pasada(s) el último mes pagado` : "";
    return `${cuando}${planes}${pasadas}`;
  }
  if (r.tipoEvento === "migracion_woo_legacy") {
    return `Solo al apretar "Enviar invitaciones" más abajo (no automático)`;
  }
  if (r.tipoEvento === "tope_ilimitado_superado") {
    return `Cuando un cliente del ilimitado viejo pasa más de ${PASES_INCLUIDOS_X5} veces en su mes, al registrarse esa pasada`;
  }
  if (r.tipoEvento === "pendiente_validacion_x5") {
    return `Cuando el cobro automático de un cliente del ilimitado viejo se salta porque todavía no acepta el Plan X5 (la tarjeta está bien)`;
  }
  if (r.tipoEvento === "suscripcion_cancelada") {
    return `Cuando se corta el cobro automático de un cliente: "Cancelar suscripción" en su ficha, o el propio cliente eliminando su tarjeta en Mi Cuenta`;
  }
  if (r.tipoEvento === "envio_manual") {
    return `No dispara sola — la crea "Correos Únicos" para poder registrar ahí sus envíos puntuales`;
  }
  const planes = r.condicionPlanes?.length ? ` del plan ${r.condicionPlanes.join(", ")}` : "";
  const soloSinAutopago = r.condicionSoloSinAutopago ? " · solo clientes sin tarjeta inscrita" : "";
  const soloConPromo = r.condicionSoloConPromoRenovacion ? " · solo con promoción de renovación vigente" : "";
  return `${r.condicionDiasAntesVencimiento ?? 0} día(s) antes del vencimiento${planes}${soloSinAutopago}${soloConPromo}`;
}

function ReglaRow({ regla, puedeBorrar, verTexto }: { regla: ReglaCorreo; puedeBorrar: boolean; verTexto: boolean }) {
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
      {plantilla && (
        <details open={verTexto} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Ver el correo que recibe el cliente</summary>
          <div style={{ marginTop: 6, fontSize: 13, borderLeft: "3px solid var(--gray)", paddingLeft: 10 }}>
            <div style={{ fontWeight: 600 }}>Asunto: {plantilla.asunto}</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{plantilla.cuerpo}</div>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 6 }}>
              Sale dentro de la plantilla base: logo arriba, botón &quot;Ir a Mi Cuenta&quot; y pie con
              info@zplash.cl. Las {"{{variables}}"} se reemplazan con los datos del cliente al enviar.
            </div>
          </div>
        </details>
      )}
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
  const [verTextos, setVerTextos] = useState(false);
  const puedeBorrar = ui.perfilActual?.modulos.includes("permisos") || false;

  const nombreRef = useRef<HTMLInputElement>(null);
  const [tipoEvento, setTipoEvento] = useState<TipoEventoReglaCorreo>("venta_creada");
  const condicionTipoVentaRef = useRef<HTMLInputElement>(null);
  const [planesElegidos, setPlanesElegidos] = useState<string[]>([]);
  const diasAntesRef = useRef<HTMLInputElement>(null);
  const diasDespuesRef = useRef<HTMLInputElement>(null);
  const pasadasMaxRef = useRef<HTMLInputElement>(null);
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
      // Vacío = sin tope (no `|| 0`, que dejaría fuera a todos salvo a los de 0 pasadas).
      condicionPasadasMax:
        tipoEvento === "plan_vencido" && pasadasMaxRef.current?.value.trim() ? Number(pasadasMaxRef.current.value) : undefined,
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
    if (pasadasMaxRef.current) pasadasMaxRef.current.value = "";
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
            <option value="tope_ilimitado_superado">Un cliente del ilimitado viejo se pasó del tope del X5</option>
            <option value="suscripcion_cancelada">Se cancela la suscripción de un cliente (ficha o Mi Cuenta)</option>
            <option value="pendiente_validacion_x5">No se pudo cobrar porque el cliente no ha aceptado el Plan X5</option>
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
              Solo clientes sin tarjeta inscrita (sin pago automático)
            </label>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
              No le avisa a quien ya tenga tarjeta Oneclick registrada, sea de web o de local (a ese el cobro
              automático lo va a renovar solo). El resto — web y local sin tarjeta — sí recibe el aviso.
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
          <>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Días de demora después del vencimiento</label>
              <input ref={diasDespuesRef} type="number" min={0} defaultValue={0} />
              <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
                0 = avisa al día siguiente de vencer. Con, por ejemplo, 3 días, le da tiempo a un reintento de cobro
                automático antes de mandar el correo — útil para una regla aparte dirigida a clientes a los que no se
                les pudo cargar el plan.
              </div>
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>Máximo de pasadas del último mes pagado (opcional)</label>
              <input ref={pasadasMaxRef} type="number" min={0} placeholder="sin tope" />
              <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12.5 }}>
                Vacío = le llega a todos. Con un tope, la regla dispara solo para quien pasó esa cantidad de veces o
                menos en el último mes que tuvo plan. El correo de reactivación argumenta con{" "}
                <code>{"{{pasadas}}"}</code>, y a quien pasaba más veces que las incluidas en el {PLANES[0]} ese texto
                le estaría ofreciendo menos lavados de los que usaba.
              </div>
            </div>
          </>
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
        <>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 13 }}>
            <input type="checkbox" checked={verTextos} onChange={(e) => setVerTextos(e.target.checked)} />
            Ver todos los textos que reciben los clientes
          </label>
          {/* Activas primero: las apagadas (campañas de "Correos Únicos" ya usadas, duplicados) son
              historial, no lo que le llega hoy a un cliente. */}
          {[...data.reglasCorreo]
            .sort((a, b) => Number(b.activa) - Number(a.activa) || a.tipoEvento.localeCompare(b.tipoEvento))
            .map((r) => (
              <ReglaRow key={r.id} regla={r} puedeBorrar={puedeBorrar} verTexto={verTextos} />
            ))}
        </>
      )}
    </div>
  );
}
