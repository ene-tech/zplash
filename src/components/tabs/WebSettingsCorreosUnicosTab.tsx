"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { clienteIdsConCorreoDePlantilla, enviarCorreosMasivos, suscripcionesParaFiltroCorreo } from "@/lib/serverActions";
import { aplicarVariables, fmtFecha, normPlate } from "@/lib/helpers";
import { ClientesSeleccionablesCorreoList } from "./correosUnicos/ClientesSeleccionablesCorreoList";
import {
  FiltrosEnvioCorreo,
  type FiltroAutopago,
  type FiltroEstadoCorreo,
  type FiltroOrigenCorreo,
} from "./correosUnicos/FiltrosEnvioCorreo";
import { filtrarClientesCorreoMasivo, type EstadoAutopago } from "./correosUnicos/filtrarClientesCorreoMasivo";
import type { ResultadoEnvioMasivoCorreo } from "@/types";

// Mismo tamaño de lote y mismo motivo que en Mensajes Únicos de WhatsApp: un
// envío de varios cientos en una sola llamada corre la función serverless
// hasta que Vercel la corta a los 300s, a mitad del loop y sin avisar en la
// UI. Por lotes, cada request dura bastante menos y el admin ve el progreso.
const CLIENTES_POR_LOTE = 50;

// Ventana de la pre-exclusión "ya lo recibió" (ver
// clienteIdsConCorreoDePlantilla). Más larga que las 24h de WhatsApp porque
// acá no hay ventana de sesión de Meta que empuje a reintentar rápido: lo que
// se quiere evitar es repetirle un correo transaccional al mismo cliente en el
// mismo ciclo de plan.
const DIAS_YA_CONTACTADO = 30;

function dividirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

function sumarResultados(a: ResultadoEnvioMasivoCorreo, b: ResultadoEnvioMasivoCorreo): ResultadoEnvioMasivoCorreo {
  return {
    total: a.total + b.total,
    enviados: a.enviados + b.enviados,
    fallidos: a.fallidos + b.fallidos,
    sinEmail: a.sinEmail + b.sinEmail,
    omitidos: (a.omitidos || 0) + (b.omitidos || 0),
  };
}

export default function WebSettingsCorreosUnicosTab() {
  const { data, patchUi, loadingHistorial } = useAppData();
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCorreo>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigenCorreo>("todos");
  const [vencidoDiasMax, setVencidoDiasMax] = useState("");
  const [pasadasMin, setPasadasMin] = useState("");
  const [pasadasMax, setPasadasMax] = useState("");
  const [filtroAutopago, setFiltroAutopago] = useState<FiltroAutopago>("todos");
  const [autopago, setAutopago] = useState<Map<string, EstadoAutopago> | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [plantillaId, setPlantillaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEnvioMasivoCorreo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yaContactados, setYaContactados] = useState<Set<string>>(new Set());
  // Los ids que excluyó la plantilla ANTERIOR, para poder devolverlos a la
  // selección al cambiar de plantilla sin tocar lo que el admin excluyó a
  // mano. En un ref y no en estado: solo lo lee el efecto de abajo, y como
  // estado se dispararía a sí mismo.
  const autoExcluidosRef = useRef<string[]>([]);

  const plantilla = data.plantillasCorreo.find((p) => p.id === plantillaId);

  // Las suscripciones Oneclick no viven en AppData/commit() (mismo criterio
  // que SuscripcionesTab): se piden una vez al montar y se indexan por patente
  // para el filtro de cobro automático. Se queda con la PRIMERA fila de cada
  // patente porque el listado ya viene ordenado por estado (activa <
  // suspendida < pendiente < cancelada) — una patente que canceló y volvió a
  // inscribir tiene más de una fila, y la que manda es la activa.
  useEffect(() => {
    let cancelado = false;
    suscripcionesParaFiltroCorreo().then((suscripciones) => {
      if (cancelado) return;
      const porPatente = new Map<string, EstadoAutopago>();
      for (const s of suscripciones) {
        const key = normPlate(s.patente);
        if (porPatente.has(key)) continue;
        porPatente.set(key, { estado: s.estado, ultimoCobroRechazado: s.ultimoCobro?.estado === "rechazada" });
      }
      setAutopago(porPatente);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Al elegir una plantilla, excluye automáticamente a quien ya la recibió
  // hace poco. Solo pre-marca la exclusión: el admin puede reincluir a mano.
  // La garantía dura contra duplicados no es esta lista sino la idempotencia
  // de disparos_regla_correo (ver enviarCorreosMasivos).
  //
  // Al cambiar de plantilla las exclusiones automáticas de la anterior se
  // deshacen antes de calcular las nuevas: son de esa plantilla, no del
  // cliente. Si se acumularan, el segundo envío saldría con gente
  // deseleccionada en silencio mientras el resumen de abajo — que se lee de
  // `yaContactados`, ya reseteado — jura que no se excluyó a nadie.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setYaContactados(new Set());
      setExcluidos((prev) => {
        const next = new Set(prev);
        for (const id of autoExcluidosRef.current) next.delete(id);
        return next;
      });
      autoExcluidosRef.current = [];
      if (!plantillaId) return;
      const desdeISO = new Date(Date.now() - DIAS_YA_CONTACTADO * 86_400_000).toISOString();
      const ids = await clienteIdsConCorreoDePlantilla(plantillaId, desdeISO);
      if (cancelado) return;
      autoExcluidosRef.current = ids;
      setYaContactados(new Set(ids));
      setExcluidos((prev) => new Set([...prev, ...ids]));
    })();
    return () => {
      cancelado = true;
    };
  }, [plantillaId]);

  const candidatos = useMemo(
    () =>
      filtrarClientesCorreoMasivo(
        data.clientes,
        { filtroEstado, filtroOrigen, vencidoDiasMax, pasadasMin, pasadasMax, filtroAutopago, busqueda },
        autopago,
        // Sin el historial cargado no hay pasadas que contar: se pasa undefined
        // para que el filtro devuelva vacío en vez de dejar entrar a todos con 0.
        loadingHistorial ? undefined : data.ingresos
      ),
    [
      data.clientes,
      data.ingresos,
      loadingHistorial,
      filtroEstado,
      filtroOrigen,
      vencidoDiasMax,
      pasadasMin,
      pasadasMax,
      filtroAutopago,
      autopago,
      busqueda,
    ]
  );

  const seleccionables = candidatos.filter((c) => c.email);
  const sinEmail = candidatos.length - seleccionables.length;
  const seleccionados = seleccionables.filter((c) => !excluidos.has(c.id));

  const primerElegido = seleccionados[0];
  // Mismas variables que construirVariables arma server-side en el envío real
  // (ver @/lib/whatsapp/reglas/motor), salvo las que dependen de una venta o
  // de una oferta calculada — un envío puntual no tiene monto ni oferta detrás,
  // así que esas quedan vacías igual que en el correo de verdad.
  const variablesPreview = {
    nombre: primerElegido?.nombre || "(nombre del cliente)",
    patente: primerElegido?.patente || "(patente)",
    plan: primerElegido?.plan || "",
    fechaVencimiento: primerElegido?.vencimiento ? fmtFecha(primerElegido.vencimiento) : "",
    monto: "",
  };
  const asuntoPreview = plantilla ? aplicarVariables(plantilla.asunto, variablesPreview) : "";
  const cuerpoPreview = plantilla ? aplicarVariables(plantilla.cuerpo, variablesPreview) : "";

  const toggleCliente = (id: string) => {
    setExcluidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enviar = async () => {
    setEnviando(true);
    setResultado(null);
    const lotes = dividirEnLotes(
      seleccionados.map((c) => c.id),
      CLIENTES_POR_LOTE
    );
    let acumulado: ResultadoEnvioMasivoCorreo = { total: 0, enviados: 0, fallidos: 0, sinEmail: 0, omitidos: 0 };
    for (const lote of lotes) {
      const r = await enviarCorreosMasivos({ plantillaCorreoId: plantillaId, clienteIds: lote });
      acumulado = sumarResultados(acumulado, r);
      setResultado(acumulado); // progreso visible lote a lote, no solo al final
    }
    setEnviando(false);
  };

  const confirmarEnvio = () => {
    if (!plantilla) {
      setErr("Elige una plantilla de correo");
      return;
    }
    if (!seleccionados.length) {
      setErr("No hay clientes seleccionados");
      return;
    }
    setErr(null);
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `Vas a enviar "${plantilla.nombre}" por correo a ${seleccionados.length} cliente(s). Esta acción no se puede deshacer. ¿Confirmar?`,
        confirmLabel: "Enviar",
        danger: true,
        onConfirm: enviar,
      },
    });
  };

  return (
    <div>
      <div className="modal" style={{ maxWidth: 720, margin: "0 0 20px 0" }}>
        <h3>Correos Únicos</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginBottom: 14 }}>
          Envía una plantilla de correo puntual a un grupo de clientes filtrado en el momento — el equivalente por mail
          de &quot;Mensajes Únicos&quot;. Úsalo para lo que ninguna regla automática cubre: por ejemplo, alcanzar a los
          que se vencieron hace más días que la ventana que mira el cron de &quot;Reglas Correo&quot;. Para lo que sí es
          recurrente, conviene una regla en <strong>Reglas Correo</strong> (ej. &quot;No se pudo cobrar la mensualidad&quot;,
          que se dispara sola en el momento exacto del rechazo) en vez de repetir este envío a mano.
        </div>

        <FiltrosEnvioCorreo
          filtroEstado={filtroEstado}
          setFiltroEstado={setFiltroEstado}
          filtroOrigen={filtroOrigen}
          setFiltroOrigen={setFiltroOrigen}
          vencidoDiasMax={vencidoDiasMax}
          setVencidoDiasMax={setVencidoDiasMax}
          pasadasMin={pasadasMin}
          setPasadasMin={setPasadasMin}
          pasadasMax={pasadasMax}
          setPasadasMax={setPasadasMax}
          filtroAutopago={filtroAutopago}
          setFiltroAutopago={setFiltroAutopago}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
        />

        <div className="hint" style={{ textAlign: "left", fontSize: 13, marginBottom: 8 }}>
          {/* Sin este caso, el filtro de cobro automático recién elegido muestra
              "0 cliente(s) coinciden" mientras la consulta está en vuelo, y se
              lee como que no hay nadie en ese segmento en vez de que todavía no
              se sabe (filtrarClientesCorreoMasivo devuelve vacío a propósito
              hasta que carga). */}
          {filtroAutopago !== "todos" && !autopago ? (
            "Cargando suscripciones para filtrar por cobro automático..."
          ) : loadingHistorial && (pasadasMin.trim() || pasadasMax.trim()) ? (
            "Cargando historial de pasadas..."
          ) : (
            <>
              {candidatos.length} cliente(s) coinciden con el filtro
              {sinEmail > 0 ? ` (${sinEmail} sin email registrado, no se les puede enviar)` : ""} ·{" "}
              <strong>{seleccionados.length} seleccionado(s)</strong>
              {yaContactados.size > 0
                ? ` (${yaContactados.size} ya recibieron esta plantilla en los últimos ${DIAS_YA_CONTACTADO} días, excluidos automáticamente — puedes reincluirlos a mano, pero la misma plantilla no se repite dentro del mismo ciclo de plan del cliente)`
                : ""}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <button type="button" className="icon-btn" onClick={() => setExcluidos(new Set())}>
            Seleccionar todos
          </button>
          <button type="button" className="icon-btn" onClick={() => setExcluidos(new Set(seleccionables.map((c) => c.id)))}>
            Deseleccionar todos
          </button>
        </div>

        <ClientesSeleccionablesCorreoList candidatos={candidatos} excluidos={excluidos} onToggle={toggleCliente} />

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

        {plantilla && (
          <div className="field" style={{ marginBottom: 10 }}>
            <label>Vista previa (con el primer cliente seleccionado)</label>
            <input readOnly value={asuntoPreview} style={{ marginBottom: 6 }} />
            <textarea readOnly rows={5} value={cuerpoPreview} />
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginTop: 4 }}>
              El correo real sale con el diseño de marca (logo, footer) alrededor de este texto.
            </div>
          </div>
        )}

        {err && <div className="err">{err}</div>}
        {resultado && (
          <div className="err" style={{ color: resultado.fallidos ? undefined : "var(--green)" }}>
            {enviando ? "Procesando... " : ""}
            Enviado a {resultado.enviados} de {enviando ? seleccionados.length : resultado.total} cliente(s)
            {enviando ? ` (${resultado.total} procesados hasta ahora)` : ""}.
            {resultado.fallidos ? ` ${resultado.fallidos} fallaron.` : ""}
            {resultado.sinEmail ? ` ${resultado.sinEmail} sin email.` : ""}
            {resultado.omitidos ? ` ${resultado.omitidos} ya la habían recibido en este ciclo de plan, no se reenvió.` : ""}
          </div>
        )}

        <button className="btn" onClick={confirmarEnvio} disabled={enviando || !plantilla || !seleccionados.length}>
          {enviando ? `Enviando... (${resultado?.total ?? 0}/${seleccionados.length})` : `Enviar a ${seleccionados.length} cliente(s)`}
        </button>
      </div>
    </div>
  );
}
