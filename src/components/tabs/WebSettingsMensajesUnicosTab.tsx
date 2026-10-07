"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { clienteIdsConMensajePlantilla, enviarMensajesMasivosSms, enviarMensajesMasivosWhatsapp } from "@/lib/serverActions";
import { MAX_SEGMENTOS_SMS, segmentosSms, textoFinalSms } from "@/lib/sms/texto";
import { aplicarVariables, fmtFecha, montoDescuento } from "@/lib/helpers";
import { BadgeAprobadoMeta } from "./BadgeAprobadoMeta";
import { AccionEnvioMasivoFields } from "./mensajesUnicos/AccionEnvioMasivoFields";
import { CamposSms } from "./mensajesUnicos/CamposSms";
import { ClientesSeleccionablesList } from "./mensajesUnicos/ClientesSeleccionablesList";
import { FiltrosEnvioMasivo, type FiltroEstado, type FiltroOrigen } from "./mensajesUnicos/FiltrosEnvioMasivo";
import { filtrarClientesMensajeMasivo } from "./mensajesUnicos/filtrarClientesMensajeMasivo";
import type { AccionReglaWhatsapp, ResultadoEnvioMasivoSms, ResultadoEnvioMasivoWhatsapp } from "@/types";

// SMS es un canal paralelo para campañas (ver @/lib/sms/masivo): más barato por
// mensaje que un template MARKETING de WhatsApp, pero sin respuesta del cliente.
type Canal = "whatsapp" | "sms";

// Fuera del componente porque Date.now() es impuro (regla react-hooks/purity
// del React Compiler no lo permite dentro del cuerpo del render) — mismo
// patrón que fueraDeVentana24h en MensajesView.tsx. Solo se usa para el
// preview del mensaje, no para el envío real (ver construirVariables en
// @/lib/whatsapp/reglas, que hace el mismo cálculo server-side).
function fechaOfertaDesdeHoy(dias: number): string {
  return fmtFecha(new Date(Date.now() + dias * 86_400_000).toISOString());
}

// Clientes por request al server action, no todos los seleccionados de una:
// visto en producción (ago-2026) que un envío de ~700 clientes en una sola
// llamada corre la función serverless hasta que Vercel la corta a los 300s
// ("Task timed out after 300 seconds"), a mitad del loop de envío y sin
// avisar nada en la UI — se cortan ~450 clientes sin ningún intento. A este
// tamaño de lote (~1 msg/seg medido) cada request dura menos de un minuto,
// muy por debajo del límite, y el admin ve el progreso lote a lote en vez de
// un spinner ciego varios minutos.
const CLIENTES_POR_LOTE = 50;

function dividirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

function sumarResultados(a: ResultadoEnvioMasivoWhatsapp, b: ResultadoEnvioMasivoWhatsapp): ResultadoEnvioMasivoWhatsapp {
  return {
    total: a.total + b.total,
    enviados: a.enviados + b.enviados,
    fallidos: a.fallidos + b.fallidos,
    sinTelefono: a.sinTelefono + b.sinTelefono,
    cuponError: a.cuponError || b.cuponError,
  };
}

function sumarResultadosSms(a: ResultadoEnvioMasivoSms, b: ResultadoEnvioMasivoSms): ResultadoEnvioMasivoSms {
  return {
    ...sumarResultados(a, b),
    omitidos: a.omitidos + b.omitidos,
    repetidos: a.repetidos + b.repetidos,
    segmentos: a.segmentos + b.segmentos,
    primerError: a.primerError ?? b.primerError,
  };
}

export default function WebSettingsMensajesUnicosTab() {
  const { data, patchUi } = useAppData();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>("todos");
  const [visitasMin, setVisitasMin] = useState("");
  const [visitasMax, setVisitasMax] = useState("");
  const [inactivoDiasMin, setInactivoDiasMin] = useState("");
  const [clienteDesdeDiasMin, setClienteDesdeDiasMin] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [campanaSms, setCampanaSms] = useState("");
  const [textoSms, setTextoSms] = useState("");
  const [resultadoSms, setResultadoSms] = useState<ResultadoEnvioMasivoSms | null>(null);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [plantillaId, setPlantillaId] = useState("");
  const [accion, setAccion] = useState<AccionReglaWhatsapp>("mensaje_simple");
  const [cuponEsPorcentaje, setCuponEsPorcentaje] = useState(false);
  const [cuponValor, setCuponValor] = useState("");
  const [cuponValidezDias, setCuponValidezDias] = useState("7");
  const [precioBase, setPrecioBase] = useState("");
  const [montoOferta, setMontoOferta] = useState("");
  const [diasValidez, setDiasValidez] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioMasivoWhatsapp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yaContactados, setYaContactados] = useState<Set<string>>(new Set());

  const plantilla = data.plantillasWhatsapp.find((p) => p.id === plantillaId);

  // Al elegir una plantilla, excluye automáticamente a quien ya la recibió en
  // las últimas 24h (ver clienteIdsConMensajePlantilla) — así, si un envío
  // masivo se cortó a mitad de camino (visto en producción: timeout de 300s
  // de la función serverless) y el admin reintenta con el mismo filtro, no le
  // vuelve a llegar el mensaje a quien ya lo recibió. Solo pre-marca la
  // exclusión: el admin puede reincluir a mano si de verdad quiere reenviar.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setYaContactados(new Set());
      if (canal !== "whatsapp" || !plantilla?.metaNombre) return;
      const hace24hISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const ids = await clienteIdsConMensajePlantilla(plantilla.metaNombre, hace24hISO);
      if (cancelado) return;
      setYaContactados(new Set(ids));
      setExcluidos((prev) => new Set([...prev, ...ids]));
    })();
    return () => {
      cancelado = true;
    };
  }, [canal, plantilla?.metaNombre]);

  const candidatos = useMemo(
    () => filtrarClientesMensajeMasivo(data.clientes, { filtroEstado, filtroOrigen, visitasMin, visitasMax, inactivoDiasMin, clienteDesdeDiasMin, busqueda }),
    [data.clientes, filtroEstado, filtroOrigen, visitasMin, visitasMax, inactivoDiasMin, clienteDesdeDiasMin, busqueda]
  );

  const seleccionables = candidatos.filter((c) => c.telefono);
  const sinTelefono = candidatos.length - seleccionables.length;
  const seleccionados = seleccionables.filter((c) => !excluidos.has(c.id));

  // Se chequea contra metaVariables (lo que enviarSegunPlantilla realmente
  // sustituye como parámetro posicional del template en Meta), no contra el
  // texto libre de plantilla.mensaje — el admin puede editar metaVariables a
  // mano y quedar desalineado del mensaje (ver hint en WebSettingsWhatsappTab).
  // En SMS no hay metaVariables: las variables son las que aparecen en el texto.
  const metaVariablesMin =
    canal === "sms"
      ? [...textoSms.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1].toLowerCase())
      : plantilla?.metaVariables?.map((v) => v.toLowerCase()) || [];
  const usaMontoOferta = metaVariablesMin.includes("montooferta");
  // fechaVencimientoOferta (hoy + diasValidez, ver construirVariables en
  // @/lib/whatsapp/reglas) también depende de que el admin ingrese los días de
  // validez, aunque el mensaje no muestre el número de días como tal — mismo
  // input de más abajo, dos variables calculadas a partir de él.
  const usaFechaVencimientoOferta = metaVariablesMin.includes("fechavencimientooferta");
  const usaDiasValidez = metaVariablesMin.includes("diasvalidez") || usaFechaVencimientoOferta;

  // Con accion="cupon_descuento" montoOferta/diasValidez del mensaje se
  // derivan del cupón (mismo criterio que ejecutarAccionRegla para las
  // ReglaWhatsapp), no de los campos de texto libre de más abajo.
  const montoOfertaEfectivo = accion === "cupon_descuento" ? cuponValor : montoOferta;
  const diasValidezEfectivo = accion === "cupon_descuento" ? cuponValidezDias : diasValidez;

  // montoDescuento/montoAPagar del preview: mismo cálculo que hace el envío
  // real en enviarMensajesMasivosWhatsapp (@/lib/whatsapp/masivo), solo si
  // hay un precio base indicado — ver hint en AccionEnvioMasivoFields.
  const precioBaseNum = accion === "cupon_descuento" && precioBase ? Number(precioBase) : undefined;
  const montoDescuentoEfectivo =
    precioBaseNum !== undefined && cuponValor
      ? montoDescuento({ esPorcentaje: cuponEsPorcentaje, valor: Number(cuponValor) }, precioBaseNum)
      : undefined;
  const montoAPagarEfectivo =
    precioBaseNum !== undefined && montoDescuentoEfectivo !== undefined
      ? Math.max(0, precioBaseNum - montoDescuentoEfectivo)
      : undefined;

  const primerElegido = seleccionados[0];
  const variablesPreview = {
    nombre: primerElegido?.nombre || "(nombre del cliente)",
    patente: primerElegido?.patente || "(patente)",
    plan: primerElegido?.plan || "",
    fechaVencimiento: primerElegido?.vencimiento ? fmtFecha(primerElegido.vencimiento) : "",
    fechaVencimientoOferta:
      diasValidezEfectivo && !isNaN(Number(diasValidezEfectivo)) ? fechaOfertaDesdeHoy(Number(diasValidezEfectivo)) : "",
    montoOferta: montoOfertaEfectivo,
    montoDescuento: montoDescuentoEfectivo !== undefined ? String(montoDescuentoEfectivo) : "",
    montoAPagar: montoAPagarEfectivo !== undefined ? String(montoAPagarEfectivo) : "",
    diasValidez: diasValidezEfectivo,
    monto: "",
    descuentoReferido: "(descuento referido)",
  };
  const preview = plantilla ? aplicarVariables(plantilla.mensaje, variablesPreview) : "";
  const previewSms = aplicarVariables(textoSms, variablesPreview);
  const segmentosPorCliente = segmentosSms(textoFinalSms(previewSms, "XXXXXX"));

  const toggleCliente = (id: string) => {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const opcionesOferta = () => ({
    accion,
    cuponEsPorcentaje: accion === "cupon_descuento" ? cuponEsPorcentaje : undefined,
    cuponValor: accion === "cupon_descuento" ? Number(cuponValor || 0) : undefined,
    cuponValidezDias: accion === "cupon_descuento" ? Number(cuponValidezDias || 7) : undefined,
    precioBase: precioBaseNum,
    montoOferta: accion === "mensaje_simple" && usaMontoOferta && montoOferta ? Number(montoOferta) : undefined,
    diasValidez: accion === "mensaje_simple" && usaDiasValidez && diasValidez ? Number(diasValidez) : undefined,
  });

  const enviarSms = async () => {
    setEnviando(true);
    setResultadoSms(null);
    let acumulado: ResultadoEnvioMasivoSms = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0, omitidos: 0, repetidos: 0, segmentos: 0 };
    for (const lote of dividirEnLotes(seleccionados.map((c) => c.id), CLIENTES_POR_LOTE)) {
      const r = await enviarMensajesMasivosSms({ campana: campanaSms, texto: textoSms, clienteIds: lote, ...opcionesOferta() });
      acumulado = sumarResultadosSms(acumulado, r);
      setResultadoSms(acumulado);
      // Mismo criterio que WhatsApp con los cupones; y si ningún SMS del lote
      // salió (sin saldo, credenciales), los lotes siguientes fallarían igual.
      if (r.cuponError || (r.fallidos > 0 && r.enviados === 0)) break;
    }
    setEnviando(false);
  };

  const enviar = async () => {
    if (canal === "sms") return enviarSms();
    setEnviando(true);
    setResultado(null);
    const lotes = dividirEnLotes(
      seleccionados.map((c) => c.id),
      CLIENTES_POR_LOTE
    );
    let acumulado: ResultadoEnvioMasivoWhatsapp = { total: 0, enviados: 0, fallidos: 0, sinTelefono: 0 };
    for (const lote of lotes) {
      const r = await enviarMensajesMasivosWhatsapp({
        plantillaId,
        clienteIds: lote,
        ...opcionesOferta(),
      });
      acumulado = sumarResultados(acumulado, r);
      setResultado(acumulado); // progreso visible lote a lote, no solo al final
      // Si el lote de cupones no se pudo guardar, no tiene sentido seguir con
      // los lotes siguientes (misma plantilla/acción, mismo error esperable) —
      // mejor cortar y avisar que seguir mandando promesas de descuento rotas.
      if (r.cuponError) break;
    }
    setEnviando(false);
  };

  const confirmarEnvio = () => {
    if (canal === "sms") return confirmarEnvioSms();
    if (!plantilla) {
      setErr("Elige una plantilla de WhatsApp");
      return;
    }
    if (!seleccionados.length) {
      setErr("No hay clientes seleccionados");
      return;
    }
    if (accion === "cupon_descuento" && (!cuponValor || Number(cuponValor) <= 0)) {
      setErr("Ingresa el valor del descuento");
      return;
    }
    setErr(null);
    const avisoCupon =
      accion === "cupon_descuento"
        ? ` Se generará un cupón de descuento por cliente, atado a su patente.`
        : "";
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `Vas a enviar "${plantilla.nombre}" a ${seleccionados.length} cliente(s) por WhatsApp.${avisoCupon} Esta acción no se puede deshacer. ¿Confirmar?`,
        confirmLabel: "Enviar",
        danger: true,
        onConfirm: enviar,
      },
    });
  };

  const confirmarEnvioSms = () => {
    if (!campanaSms.trim()) return setErr("Ponle un nombre a la campaña");
    if (!textoSms.trim()) return setErr("Escribe el texto del SMS");
    if (segmentosPorCliente > MAX_SEGMENTOS_SMS) return setErr(`El texto pasa de ${MAX_SEGMENTOS_SMS} SMS por cliente: acórtalo`);
    if (!seleccionados.length) return setErr("No hay clientes seleccionados");
    if (accion === "cupon_descuento" && (!cuponValor || Number(cuponValor) <= 0)) return setErr("Ingresa el valor del descuento");
    setErr(null);
    const avisoCupon = accion === "cupon_descuento" ? ` Se generará un cupón de descuento por cliente, atado a su patente.` : "";
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `Vas a enviar la campaña "${campanaSms.trim()}" por SMS a ${seleccionados.length} cliente(s), ${segmentosPorCliente} SMS cada uno (~${seleccionados.length * segmentosPorCliente} SMS en total). Se saltan los que pidieron no recibir mensajes y los que ya recibieron esta campaña.${avisoCupon} Esta acción no se puede deshacer. ¿Confirmar?`,
        confirmLabel: "Enviar",
        danger: true,
        onConfirm: enviar,
      },
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Mensajes Únicos</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Envía un mensaje puntual por WhatsApp a un grupo de clientes filtrado en el momento — por ejemplo, avisar un
          cierre por mantención a todos los clientes con plan, u ofrecer un precio especial a los que tienen el plan
          vencido y no lo han renovado. Solo se puede enviar usando una plantilla con su template ya{" "}
          <strong>Aprobado en Meta</strong> (pestaña &quot;WhatsApp Plantillas&quot;): la mayoría de estos clientes no te
          han escrito en las últimas 24 horas, así que un mensaje de texto libre sería rechazado por WhatsApp. Por{" "}
          <strong>SMS</strong> el texto es libre y sale más barato, pero el cliente no puede responder: sirve para
          campañas, no para conversar.
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>Canal</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            <option value="whatsapp">WhatsApp (plantilla aprobada en Meta)</option>
            <option value="sms">SMS (texto libre)</option>
          </select>
        </div>

        <FiltrosEnvioMasivo
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          filtroOrigen={filtroOrigen}
          setFiltroOrigen={setFiltroOrigen}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          visitasMin={visitasMin}
          setVisitasMin={setVisitasMin}
          visitasMax={visitasMax}
          setVisitasMax={setVisitasMax}
          inactivoDiasMin={inactivoDiasMin}
          setInactivoDiasMin={setInactivoDiasMin}
          clienteDesdeDiasMin={clienteDesdeDiasMin}
          setClienteDesdeDiasMin={setClienteDesdeDiasMin}
        />

        <div className="hint" style={{ textAlign: "left", fontSize: 13, marginBottom: 8 }}>
          {candidatos.length} cliente(s) coinciden con el filtro
          {sinTelefono > 0 ? ` (${sinTelefono} sin teléfono registrado, no se les puede enviar)` : ""} ·{" "}
          <strong>{seleccionados.length} seleccionado(s)</strong>
          {yaContactados.size > 0 ? ` (${yaContactados.size} ya recibieron esta plantilla en las últimas 24h, excluidos automáticamente — reincluye a mano en la lista si quieres reenviarles)` : ""}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button type="button" className="icon-btn" onClick={() => setExcluidos(new Set())}>
            Seleccionar todos
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setExcluidos(new Set(seleccionables.map((c) => c.id)))}
          >
            Deseleccionar todos
          </button>
        </div>

        <ClientesSeleccionablesList candidatos={candidatos} excluidos={excluidos} onToggle={toggleCliente} />

        {canal === "whatsapp" && (
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
        )}

        {canal === "whatsapp" && plantilla && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <BadgeAprobadoMeta aprobado={plantilla.metaAprobado} />
            {!plantilla.metaNombre && (
              <span className="err" style={{ margin: 0 }}>
                Esta plantilla no tiene template de Meta configurado, no se puede enviar.
              </span>
            )}
          </div>
        )}

        <AccionEnvioMasivoFields
          accion={accion}
          setAccion={setAccion}
          cuponEsPorcentaje={cuponEsPorcentaje}
          setCuponEsPorcentaje={setCuponEsPorcentaje}
          cuponValor={cuponValor}
          setCuponValor={setCuponValor}
          cuponValidezDias={cuponValidezDias}
          setCuponValidezDias={setCuponValidezDias}
          precioBase={precioBase}
          setPrecioBase={setPrecioBase}
          usaMontoOferta={usaMontoOferta}
          usaDiasValidez={usaDiasValidez}
          montoOferta={montoOferta}
          setMontoOferta={setMontoOferta}
          diasValidez={diasValidez}
          setDiasValidez={setDiasValidez}
        />

        {canal === "whatsapp" && plantilla && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Vista previa (con el primer cliente seleccionado)</label>
            <textarea readOnly rows={4} value={preview} />
          </div>
        )}

        {canal === "sms" && (
          <CamposSms campana={campanaSms} setCampana={setCampanaSms} texto={textoSms} setTexto={setTextoSms} preview={previewSms} />
        )}

        {err && <div className="err">{err}</div>}
        {canal === "sms" && resultadoSms?.cuponError && (
          <div className="err">No se pudieron guardar los cupones del lote en curso: no se envió ningún SMS de ese lote.</div>
        )}
        {canal === "sms" && resultadoSms && (
          <div className="err" style={{ color: resultadoSms.fallidos ? undefined : "var(--green)" }}>
            {enviando ? "Procesando... " : ""}
            SMS enviado a {resultadoSms.enviados} de {resultadoSms.total} cliente(s) ({resultadoSms.segmentos} SMS cobrados).
            {resultadoSms.fallidos ? ` ${resultadoSms.fallidos} fallaron${resultadoSms.primerError ? ` (${resultadoSms.primerError})` : ""}.` : ""}
            {resultadoSms.sinTelefono ? ` ${resultadoSms.sinTelefono} sin celular válido.` : ""}
            {resultadoSms.omitidos ? ` ${resultadoSms.omitidos} pidieron no recibir mensajes.` : ""}
            {resultadoSms.repetidos ? ` ${resultadoSms.repetidos} ya habían recibido esta campaña.` : ""}
          </div>
        )}
        {canal === "whatsapp" && resultado?.cuponError && (
          <div className="err">
            No se pudieron guardar los cupones de descuento del lote en curso — no se envió ningún WhatsApp de ese lote
            (revisa los logs; probablemente haya que reintentar). El progreso mostrado abajo es real hasta antes de este
            lote.
          </div>
        )}
        {canal === "whatsapp" && resultado && (
          <div className="err" style={{ color: resultado.fallidos ? undefined : "var(--green)" }}>
            {enviando ? "Procesando... " : ""}
            Enviado a {resultado.enviados} de {enviando ? seleccionados.length : resultado.total} cliente(s)
            {enviando ? ` (${resultado.total} procesados hasta ahora)` : ""}.
            {resultado.fallidos ? ` ${resultado.fallidos} fallaron.` : ""}
            {resultado.sinTelefono ? ` ${resultado.sinTelefono} sin teléfono.` : ""}
          </div>
        )}

        <button
          className="btn"
          onClick={confirmarEnvio}
          disabled={enviando || !seleccionados.length || (canal === "whatsapp" ? !plantilla : !textoSms.trim() || !campanaSms.trim())}
        >
          {enviando
            ? `Enviando... (${(canal === "sms" ? resultadoSms : resultado)?.total ?? 0}/${seleccionados.length})`
            : `Enviar ${canal === "sms" ? "SMS " : ""}a ${seleccionados.length} cliente(s)`}
        </button>
      </div>
    </div>
  );
}
