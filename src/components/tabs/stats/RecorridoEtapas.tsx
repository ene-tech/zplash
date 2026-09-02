"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { estadoDelEmbudo, listarComunicacionesPeriodo } from "@/lib/serverActions";
import {
  ETIQUETA_INTERES,
  SEGMENTOS,
  clasificarConversacionesSinFicha,
  clienteEnSegmento,
  construirEmbudo,
  construirPalancas,
  contarSegmentos,
  estadoPalanca,
  fmtFecha,
  palancasPorEtapa,
  planStatus,
  primerDiaMesActualYMD,
  resolverComunicaciones,
  todayYMD,
  type ComunicacionPeriodo,
  type ConteoDisparos,
  type ConversacionSinFicha,
  type EstadoPalanca,
  type EtapaId,
  type GrupoSegmento,
  type Palanca,
  type SegmentoId,
} from "@/lib/helpers";
import type { Cliente } from "@/types";

// Color por etapa. Es la paleta de ESTADO de la marca (ver globals.css), no
// una categórica: codifica gravedad (al día → por vencer → vencido), por eso
// no comparte banda de luminosidad ni piso de croma. "Nunca vino" y "vencido
// frío" comparten el gris a propósito — los dos son gente inactiva, y quien
// distingue las filas es la etiqueta de texto, no el color.
const COLOR_ETAPA: Record<EtapaId, string> = {
  nunca_vino: "var(--gray)",
  lavado_suelto: "var(--blue)",
  plan_activo: "var(--green)",
  por_vencer: "var(--gold)",
  vencido_reciente: "var(--red)",
  vencido_frio: "var(--gray)",
};

// Qué tiene que pasarle al cliente para caer a la etapa siguiente. Es la
// etiqueta de la flecha: sin esto el diagrama es una lista de cajas, con esto
// es un camino.
const TRANSICION: Partial<Record<EtapaId, string>> = {
  nunca_vino: "pasa por el túnel por primera vez",
  lavado_suelto: "contrata el plan",
  plan_activo: "le quedan 7 días o menos",
  por_vencer: "se le vence",
  vencido_reciente: "pasan 30 días sin volver",
};

// Cómo se lee la venta de plan según de dónde salió: no es lo mismo captar a
// uno que nunca tuvo plan que rescatar a uno que ya se había ido.
const ETIQUETA_CONVERSION: Record<EtapaId, string> = {
  nunca_vino: "contrataron plan",
  lavado_suelto: "contrataron plan",
  plan_activo: "renovaron anticipado",
  por_vencer: "renovaron a tiempo",
  vencido_reciente: "volvieron al plan",
  vencido_frio: "volvieron al plan",
};

// Qué se le vende a esta etapa. Es lo que convierte la pantalla de
// diagnóstico en una de acción: la etapa dice cuándo, el segmento dice a
// quién, y esto dice con qué entrarle.
const JUGADA: Record<EtapaId, string> = {
  nunca_vino: "Traerlo por primera vez: cupón de bienvenida o lavado de prueba.",
  lavado_suelto: "Upselling a plan — el pozo más grande. Argumento: cuántas veces vino este mes contra lo que cuesta el plan.",
  plan_activo: "Retención: inscribirle la tarjeta al que no tiene cobro automático, y migrar al del ilimitado viejo.",
  por_vencer: "Renovación a tiempo. Es la etapa que mejor convierte: acá el recordatorio se paga solo.",
  vencido_reciente: "Rescate en caliente, todavía se acuerda del servicio.",
  vencido_frio: "Reactivación con oferta. Sale caro moverlo, conviene segmentar antes de gastar el descuento.",
};

const COLOR_PALANCA: Record<EstadoPalanca, string> = {
  andando: "var(--green)",
  rebota: "var(--gold)",
  muda: "var(--red)",
  apagada: "var(--red)",
};

const ETIQUETA_PALANCA: Record<EstadoPalanca, string> = {
  andando: "andando",
  rebota: "rebota",
  muda: "encendida, nunca disparó",
  apagada: "apagada",
};

const ETIQUETA_GRUPO: Record<GrupoSegmento, string> = {
  plan: "Plan",
  cobro: "Cobro",
  origen: "Origen",
};

// Eventos que evalúa el cron barriendo clientes, no un hecho puntual. Prender
// uno de estos no afecta "de acá en adelante": en la próxima corrida se
// evalúa contra TODOS los que hoy calzan, y puede salir una tanda grande de
// una sola vez. Por eso la confirmación lo dice.
const EVENTOS_BARRIDO = new Set(["plan_proximo_vencer", "plan_vencido"]);

function Metrica({ valor, label, color }: { valor: number; label: string; color?: string }) {
  return (
    <div style={{ minWidth: 78 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: color || "var(--white)" }}>{valor}</div>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--gray)" }}>{label}</div>
    </div>
  );
}

/**
 * Una regla con su estado real y el botón para prenderla o apagarla. El punto
 * de esta fila es que una regla "activa" que nunca disparó se vea DISTINTA de
 * una que funciona — en Reglas Correo/WhatsApp las dos se ven encendidas.
 *
 * El toggle escribe con el mismo `commit` que usa ReglasCorreoTab, así que la
 * fila se actualiza sola: `activa` sale de AppData, no de la consulta del
 * embudo.
 */
function PalancaFila({ p, puedeEditar }: { p: Palanca; puedeEditar: boolean }) {
  const { data, commit, patchUi } = useApp();
  const estado = estadoPalanca(p);
  const color = COLOR_PALANCA[estado];
  const pctError = p.disparosPeriodo > 0 ? Math.round((p.erroresPeriodo / p.disparosPeriodo) * 100) : 0;

  const aplicar = () => {
    if (p.canal === "correo") {
      commit({ reglasCorreo: data.reglasCorreo.map((r) => (r.id === p.id ? { ...r, activa: !p.activa } : r)) });
    } else {
      commit({ reglasWhatsapp: data.reglasWhatsapp.map((r) => (r.id === p.id ? { ...r, activa: !p.activa } : r)) });
    }
  };

  // Apagar corta mensajes: se puede deshacer con un click y no le llega nada a
  // nadie. Prender manda comunicación real a clientes reales, así que pasa por
  // confirmación — y si es una regla de barrido, avisando del volumen.
  const accionar = () => {
    if (!p.activa) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje:
            `¿Prender "${p.nombre}"? Desde ahora le va a salir ${p.canal === "correo" ? "un correo" : "un WhatsApp"} ` +
            `automático a cada cliente que cumpla la condición.` +
            (EVENTOS_BARRIDO.has(p.tipoEvento)
              ? " Ojo: esta regla la evalúa el cron barriendo la base, así que en la próxima corrida se va a disparar contra TODOS los que hoy calcen, de una sola vez."
              : ""),
          confirmLabel: "Prender",
          danger: false,
          onConfirm: aplicar,
        },
      });
      return;
    }
    aplicar();
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, marginTop: 6, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, lineHeight: 1.35 }}>
          <span style={{ color: "var(--gray)" }}>{p.canal === "correo" ? "Correo" : "WhatsApp"} · </span>
          {p.nombre}
        </div>
        <div style={{ fontSize: 11, color: estado === "andando" ? "var(--gray)" : color }}>
          {ETIQUETA_PALANCA[estado]}
          {p.disparosTotales > 0 && ` · ${p.disparosPeriodo} en el período, ${p.disparosTotales} en total`}
          {estado === "rebota" && ` · ${pctError}% con error`}
          {p.ultimoDisparo && ` · último ${fmtFecha(p.ultimoDisparo)}`}
        </div>
      </div>
      {puedeEditar && (
        <button
          onClick={accionar}
          className="btn ghost"
          style={{
            marginTop: 0,
            padding: "3px 10px",
            fontSize: 11,
            flexShrink: 0,
            color: p.activa ? "var(--gray)" : "var(--green)",
            borderColor: p.activa ? "var(--border)" : "var(--green)",
          }}
        >
          {p.activa ? "Apagar" : "Prender"}
        </button>
      )}
    </div>
  );
}

/**
 * Un número que escribió y no existe en la base. Las dos acciones son las que
 * de verdad cierran el caso: abrirle el chat para responderle, o crearle la
 * ficha con el teléfono ya puesto — sin ficha no se le puede emitir un cupón,
 * porque los cupones van por patente (ver @/db/schema/cupones).
 */
function ProspectoFila({ c }: { c: ConversacionSinFicha }) {
  const { patchUi } = useApp();
  const abandonoDescuento = c.flujoAbandonado?.tipo === "registro_descuento";

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "7px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nombreContacto || c.telefono}</div>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>
          {c.telefono} · escribió {c.escribio} {c.escribio === 1 ? "vez" : "veces"} · último {fmtFecha(c.ultimoMensajeEn)}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {abandonoDescuento && (
          <span
            style={{
              fontSize: 11,
              color: "var(--gold)",
              border: "1px solid var(--gold)",
              borderRadius: 999,
              padding: "1px 8px",
            }}
            title={`Quedó esperando que le mandara: ${c.flujoAbandonado?.paso}`}
          >
            Pidió el descuento y no lo terminó
          </span>
        )}
        {c.interes && !abandonoDescuento && (
          <span style={{ fontSize: 11, color: "var(--gray)" }}>{ETIQUETA_INTERES[c.interes]}</span>
        )}
        <button
          className="btn ghost"
          style={{ marginTop: 0, padding: "3px 10px", fontSize: 11 }}
          onClick={() => patchUi({ view: "mensajes", conversacionWhatsappSeleccionada: c.conversacionId })}
        >
          Abrir chat
        </button>
        <button
          className="btn ghost"
          style={{ marginTop: 0, padding: "3px 10px", fontSize: 11 }}
          onClick={() => patchUi({ modal: { type: "client", data: null, telefonoInicial: c.telefono } })}
        >
          Crear ficha
        </button>
      </div>
    </div>
  );
}

/**
 * El recorrido, vivo y accionable: las etapas como camino, con qué segmento de
 * cliente hay en cada una, qué acción automática la está empujando (y el botón
 * para prenderla o apagarla ahí mismo), y a quién le está llegando.
 */
export function RecorridoEtapas() {
  const { data, ui, patchUi, loadingHistorial } = useApp();
  const desde = ui.statsDesde || primerDiaMesActualYMD();
  const hasta = ui.statsHasta || todayYMD();
  // Prender o apagar una regla es editar Web Settings, que es donde viven los
  // editores y el permiso que exige el servidor (ver upsertReglasCorreo). Sin
  // ese módulo el commit fallaría en silencio, así que ni se ofrece el botón.
  const puedeEditar = !!ui.perfilActual?.modulos.includes("web_settings");

  const [abierta, setAbierta] = useState<EtapaId | null>(null);
  const [filtro, setFiltro] = useState<{ etapa: EtapaId; segmento: SegmentoId } | null>(null);
  const [prospectosAbiertos, setProspectosAbiertos] = useState(false);
  // El período que trajo lo que hay guardado. Se guarda junto a los datos (en
  // vez de un flag `cargando` aparte que el efecto tenga que prender a mano)
  // para poder DERIVAR si lo que está en pantalla corresponde al rango que se
  // está pidiendo ahora: si no corresponde, todavía se está cargando y no hay
  // que mostrar los números del rango anterior bajo las fechas nuevas.
  const [cargado, setCargado] = useState<{
    desde: string;
    hasta: string;
    filas: ComunicacionPeriodo[];
    conteos: { correo: ConteoDisparos[]; whatsapp: ConteoDisparos[] };
    cobros: { aprobados: number; rechazados: number };
    patentesAutopago: string[];
    sinFicha: ConversacionSinFicha[];
  } | null>(null);
  const cargando = cargado?.desde !== desde || cargado?.hasta !== hasta;

  useEffect(() => {
    let cancelado = false;
    const desdeISO = new Date(`${desde}T00:00:00`).toISOString();
    const hastaISO = new Date(`${hasta}T23:59:59.999`).toISOString();
    Promise.all([listarComunicacionesPeriodo(desdeISO, hastaISO), estadoDelEmbudo(desdeISO, hastaISO)])
      .then(([filas, estado]) => {
        if (!cancelado) setCargado({ desde, hasta, filas, ...estado });
      })
      .catch(() => {
        if (!cancelado) {
          setCargado({
            desde,
            hasta,
            filas: [],
            conteos: { correo: [], whatsapp: [] },
            cobros: { aprobados: 0, rechazados: 0 },
            patentesAutopago: [],
            sinFicha: [],
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [desde, hasta]);

  const listo = !cargando && cargado ? cargado : null;
  // Memoizados y no ternarios sueltos: mientras carga devuelven un objeto nuevo
  // en cada render, y eso invalidaba los useMemo de abajo una vez por render.
  const crudas = useMemo(() => listo?.filas ?? [], [listo]);
  const conteos = useMemo(() => listo?.conteos ?? { correo: [], whatsapp: [] }, [listo]);
  const patentesAutopago = useMemo(() => new Set(listo?.patentesAutopago ?? []), [listo]);
  const resueltas = useMemo(() => resolverComunicaciones(crudas, data.clientes), [crudas, data.clientes]);
  // Lo que no se le pudo cargar a nadie: WhatsApp de números que no tienen
  // ficha (gente preguntando precios sin ser cliente) y correos automáticos
  // guardados sin cliente_id. Se muestra en vez de descartarse callado, porque
  // si no el embudo se lee como si cubriera TODA la comunicación del período.
  const sinAtribuir = crudas.length - resueltas.length;

  const filas = useMemo(
    () =>
      construirEmbudo({
        clientes: data.clientes,
        ventas: data.ventas,
        ingresos: data.ingresos,
        comunicaciones: resueltas,
        desde,
        hasta,
      }),
    [data.clientes, data.ventas, data.ingresos, resueltas, desde, hasta]
  );

  // Las reglas salen de AppData (no de la consulta) justamente para que
  // prender una desde acá se vea al toque: `commit` parcha AppData y esto se
  // recalcula. Del servidor solo vienen los conteos de disparos.
  const palancas = useMemo(
    () => construirPalancas(data.reglasCorreo, data.reglasWhatsapp, conteos),
    [data.reglasCorreo, data.reglasWhatsapp, conteos]
  );
  const porEtapa = useMemo(() => palancasPorEtapa(palancas), [palancas]);

  // Etapa cero: escribió por WhatsApp y no existe en la base. El embudo
  // arrancaba en "ficha creada", así que esta gente no aparecía en ninguna
  // parte — solo como el número de mensajes sin atribuir del pie.
  const { prospectos, sinVincular } = useMemo(
    () => clasificarConversacionesSinFicha(listo?.sinFicha ?? [], data.clientes),
    [listo, data.clientes]
  );

  // El desvío silencioso del embudo: al cliente le rebota la tarjeta, no hizo
  // nada, y se le cae el plan. Solo se avisa si la palanca que debería
  // contarle no está funcionando — si está andando, esto no es una alerta.
  const palancaCobro = palancas.find((p) => p.tipoEvento === "cobro_fallido" && p.canal === "correo");
  const cobroSinAviso =
    !!listo && listo.cobros.rechazados > 0 && (!palancaCobro || estadoPalanca(palancaCobro) !== "andando");

  // Escala de las barras: la etapa más poblada ocupa el ancho completo. Es una
  // sola medida (clientes de hoy) contra un solo eje — el resto de las cifras
  // van como número, no como segunda escala encima de la misma barra.
  const maxClientes = Math.max(1, ...filas.map((f) => f.clientes.length));

  const irAReglas = (canal: "correo" | "whatsapp") =>
    patchUi({ view: "web_settings", webSettingsTab: canal === "correo" ? "correo_reglas" : "whatsapp_reglas" });

  return (
    <div>
      <h3 style={{ fontSize: 16, color: "var(--gold)", margin: "24px 0 6px" }}>Recorrido del cliente</h3>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, margin: "0 0 14px" }}>
        El camino que baja el cliente solo, y la palanca que tendría que estar subiéndolo de vuelta al plan. Los
        mensajes y las ventas se cuentan en la etapa en la que estaba el cliente ese día, no en la de hoy: por eso el
        que se rescató este mes suma su venta en &quot;vencido&quot; y su ficha en &quot;plan al día&quot;.
      </div>

      <div className="toolbar">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Desde</label>
          <input type="date" value={desde} style={{ maxWidth: 170 }} onChange={(e) => patchUi({ statsDesde: e.target.value })} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Hasta</label>
          <input type="date" value={hasta} style={{ maxWidth: 170 }} onChange={(e) => patchUi({ statsHasta: e.target.value })} />
        </div>
        <button
          className="btn ghost"
          style={{ alignSelf: "flex-end" }}
          onClick={() => patchUi({ statsDesde: primerDiaMesActualYMD(), statsHasta: todayYMD() })}
        >
          Mes actual
        </button>
      </div>

      {loadingHistorial && (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          Cargando historial de ventas e ingresos…
        </div>
      )}

      {cobroSinAviso && listo && (
        <div
          style={{
            border: "1px solid var(--red)",
            borderLeft: "4px solid var(--red)",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--red)", marginBottom: 2 }}>
            {listo.cobros.rechazados} {listo.cobros.rechazados === 1 ? "cobro rechazado" : "cobros rechazados"} sin aviso al
            cliente
          </div>
          <div style={{ color: "var(--gray)" }}>
            Se le cae el plan sin haber hecho nada y se entera cuando le cobran el lavado suelto.{" "}
            {palancaCobro
              ? `La regla "${palancaCobro.nombre}" ${estadoPalanca(palancaCobro) === "muda" ? "figura activa pero nunca ha disparado" : "está apagada"}.`
              : "No hay ninguna regla de cobro fallido configurada."}
          </div>
        </div>
      )}

      {!cargando && (prospectos.length > 0 || sinVincular.length > 0) && (
        <>
          <div className="vehicle-card" style={{ margin: "0 0 6px", padding: 12, borderLeft: "4px solid var(--blue)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>Escribió por WhatsApp y no es cliente</span>
              <span style={{ fontSize: 10, color: "var(--blue)", letterSpacing: 0.6 }}>◄ ANTES DE LA PRIMERA FICHA</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>
              Números que entraron por WhatsApp y no tienen ficha en la base. Todavía no son parte del embudo: no se
              les puede emitir un cupón porque los cupones van por patente, así que el paso es crearles la ficha o
              responderles.
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 18, margin: "10px 0 4px" }}>
              <Metrica valor={prospectos.length} label="Prospectos sin ficha" color="var(--blue)" />
              <Metrica
                valor={prospectos.filter((p) => p.flujoAbandonado?.tipo === "registro_descuento").length}
                label="Pidieron descuento y no terminaron"
                color="var(--gold)"
              />
              <Metrica valor={sinVincular.length} label="Tienen ficha, falta vincular" />
            </div>

            <button
              onClick={() => setProspectosAbiertos(!prospectosAbiertos)}
              style={{ background: "none", border: "none", padding: 0, marginTop: 4, fontSize: 12, color: "var(--gold)", cursor: "pointer" }}
            >
              {prospectosAbiertos ? "▾ Ocultar la lista" : "▸ Ver los " + prospectos.length + " prospectos"}
            </button>

            {prospectosAbiertos && (
              <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
                {prospectos.map((c) => (
                  <ProspectoFila key={c.conversacionId} c={c} />
                ))}
                {sinVincular.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--gray)" }}>
                    <b style={{ color: "var(--gold)" }}>{sinVincular.length} conversaciones son de clientes que SÍ existen</b>, pero
                    el número quedó sin vincular a la ficha, así que sus mensajes no le suman a ninguna etapa del
                    embudo. Se arregla dejando el teléfono de la ficha en formato +569XXXXXXXX:
                    <div style={{ marginTop: 6 }}>
                      {sinVincular.slice(0, 20).map(({ conversacion, cliente }) => (
                        <button
                          key={conversacion.conversacionId}
                          onClick={() => patchUi({ modal: { type: "client", data: cliente } })}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            background: "none",
                            border: "none",
                            borderBottom: "1px solid var(--border)",
                            padding: "5px 0",
                            fontSize: 12,
                            color: "inherit",
                            cursor: "pointer",
                          }}
                        >
                          {conversacion.telefono} → {cliente.nombre} ({cliente.patente})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 6px 14px" }}>
            <span style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1 }}>↓</span>
            <span style={{ fontSize: 11.5, color: "var(--gray)" }}>se le crea la ficha</span>
          </div>
        </>
      )}

      {filas.map((f, i) => {
        const color = COLOR_ETAPA[f.etapa];
        const ancho = (f.clientes.length / maxClientes) * 100;
        const abiertaEsta = abierta === f.etapa;
        const palancasEtapa = porEtapa[f.etapa] ?? [];
        const transicion = TRANSICION[f.etapa];
        const segmentos = contarSegmentos(f.clientes, patentesAutopago);
        const segmentoActivo = filtro?.etapa === f.etapa ? filtro.segmento : null;
        const visibles: Cliente[] = segmentoActivo
          ? f.clientes.filter((c) => clienteEnSegmento(c, segmentoActivo, patentesAutopago))
          : f.clientes;

        return (
          <div key={f.etapa}>
            <div className="grid gap-2.5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              {/* --- la etapa --- */}
              <div className="vehicle-card" style={{ margin: 0, padding: 12, borderLeft: `4px solid ${color}` }}>
                <button
                  onClick={() => setAbierta(abiertaEsta ? null : f.etapa)}
                  style={{
                    display: "block",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    textAlign: "left",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                  aria-expanded={abiertaEsta}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontWeight: 700 }}>{f.label}</span>
                    {f.etapa === "plan_activo" && (
                      <span style={{ fontSize: 10, color: "var(--green)", letterSpacing: 0.6 }}>◄ ACÁ HAY QUE LLEVARLO</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 2 }}>{f.desc}</div>

                  {/* Barra de magnitud: una sola medida (clientes hoy), un solo
                      eje, anclada a la izquierda. El número va al lado en texto,
                      no encima de la barra. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
                    <div style={{ flex: 1, minWidth: 0, height: 10, background: "var(--bg)", borderRadius: 999 }}>
                      <div
                        title={`${f.clientes.length} clientes en "${f.label}"`}
                        style={{ width: `${ancho}%`, height: "100%", background: color, borderRadius: 999 }}
                      />
                    </div>
                    <span style={{ fontSize: 17, fontWeight: 700, minWidth: 52, textAlign: "right" }}>{f.clientes.length}</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
                    <Metrica valor={f.comunicaciones.waSalientes} label="WhatsApp enviados" />
                    <Metrica valor={f.comunicaciones.waEntrantes} label="WhatsApp recibidos" />
                    <Metrica valor={f.comunicaciones.correos} label="Correos enviados" />
                    <Metrica
                      valor={f.compraronPlan}
                      label={ETIQUETA_CONVERSION[f.etapa]}
                      color={f.compraronPlan ? "var(--green)" : undefined}
                    />
                  </div>
                </button>

                {/* --- con qué se le entra: el desglose dentro de la etapa --- */}
                {f.clientes.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                    {(["plan", "cobro", "origen"] as GrupoSegmento[]).map((grupo) => {
                      const delGrupo = SEGMENTOS.filter((s) => s.grupo === grupo && segmentos[s.id] > 0);
                      if (!delGrupo.length) return null;
                      return (
                        <div key={grupo} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--gray)", width: 46 }}>
                            {ETIQUETA_GRUPO[grupo]}
                          </span>
                          {delGrupo.map((s) => {
                            const activo = segmentoActivo === s.id;
                            return (
                              <button
                                key={s.id}
                                title={s.ayuda}
                                onClick={() => {
                                  setAbierta(f.etapa);
                                  setFiltro(activo ? null : { etapa: f.etapa, segmento: s.id });
                                }}
                                style={{
                                  border: `1px solid ${activo ? "var(--gold)" : "var(--border)"}`,
                                  background: "none",
                                  color: activo ? "var(--gold)" : "inherit",
                                  borderRadius: 999,
                                  padding: "2px 9px",
                                  fontSize: 11.5,
                                  cursor: "pointer",
                                }}
                              >
                                {s.label} <b>{segmentos[s.id]}</b>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  onClick={() => setAbierta(abiertaEsta ? null : f.etapa)}
                  style={{ background: "none", border: "none", padding: 0, marginTop: 6, fontSize: 12, color: "var(--gold)", cursor: "pointer" }}
                >
                  {abiertaEsta ? "▾ Ocultar clientes" : "▸ Ver los clientes de esta etapa"}
                </button>

                {abiertaEsta && (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    {segmentoActivo && (
                      <div style={{ fontSize: 12, color: "var(--gold)", marginBottom: 6 }}>
                        Filtrando por {SEGMENTOS.find((s) => s.id === segmentoActivo)?.label} · {visibles.length} clientes ·{" "}
                        <button
                          onClick={() => setFiltro(null)}
                          style={{ background: "none", border: "none", padding: 0, color: "var(--gray)", cursor: "pointer", fontSize: 12 }}
                        >
                          quitar filtro
                        </button>
                      </div>
                    )}
                    {visibles.length === 0 ? (
                      <div style={{ fontSize: 13, color: "var(--gray)" }}>No hay nadie acá.</div>
                    ) : (
                      <>
                        {/* Tope de 100 para no pintar 2.000 filas al abrir
                            "vencido frío": el listado completo con filtros ya
                            existe en el módulo Clientes, esto es para
                            reconocer casos. */}
                        {visibles.slice(0, 100).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => patchUi({ modal: { type: "clienteInfo", data: c } })}
                            style={{
                              display: "flex",
                              width: "100%",
                              flexWrap: "wrap",
                              gap: 10,
                              alignItems: "baseline",
                              background: "none",
                              border: "none",
                              borderBottom: "1px solid var(--border)",
                              padding: "6px 0",
                              textAlign: "left",
                              cursor: "pointer",
                              color: "inherit",
                            }}
                          >
                            <span style={{ fontWeight: 600, minWidth: 84 }}>{c.patente}</span>
                            <span style={{ flex: 1, minWidth: 120 }}>{c.nombre}</span>
                            <span style={{ fontSize: 12, color: "var(--gray)" }}>
                              {c.vencimiento ? `vence ${fmtFecha(c.vencimiento)}` : `${c.visitas || 0} pasadas`} ·{" "}
                              {planStatus(c).label}
                            </span>
                          </button>
                        ))}
                        {visibles.length > 100 && (
                          <div style={{ fontSize: 12, color: "var(--gray)", paddingTop: 8 }}>
                            …y {visibles.length - 100} más. Para verlos todos, usá el módulo Clientes con el filtro de
                            estado.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* --- qué actúa sobre esta etapa, y el botón para accionarlo --- */}
              <div
                className="vehicle-card"
                style={{ margin: 0, padding: 12, background: "var(--bg-panel)", display: "flex", flexDirection: "column" }}
              >
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--gray)", marginBottom: 6 }}>
                  Qué hace el sistema acá
                </div>
                {cargando ? (
                  <div style={{ fontSize: 13, color: "var(--gray)" }}>Cargando…</div>
                ) : palancasEtapa.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--gray)" }}>
                    <span style={{ color: "var(--gold)" }}>Sin acción automática.</span> Ninguna regla apunta a esta
                    etapa: lo que reciban sale de campañas cargadas a mano.
                  </div>
                ) : (
                  palancasEtapa.map((p) => <PalancaFila key={p.id} p={p} puedeEditar={puedeEditar} />)
                )}

                <div style={{ marginTop: "auto", paddingTop: 10, fontSize: 11.5, color: "var(--gray)", lineHeight: 1.45 }}>
                  {JUGADA[f.etapa]}
                </div>

                {puedeEditar && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn ghost" style={{ marginTop: 0, padding: "3px 10px", fontSize: 11 }} onClick={() => irAReglas("correo")}>
                      Reglas Correo
                    </button>
                    <button className="btn ghost" style={{ marginTop: 0, padding: "3px 10px", fontSize: 11 }} onClick={() => irAReglas("whatsapp")}>
                      Reglas WhatsApp
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* --- la flecha al siguiente escalón --- */}
            {transicion && i < filas.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 6px 14px" }}>
                <span style={{ color: "var(--gray)", fontSize: 14, lineHeight: 1 }}>↓</span>
                <span style={{ fontSize: 11.5, color: "var(--gray)" }}>{transicion}</span>
              </div>
            )}
          </div>
        );
      })}

      {cargando ? (
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)" }}>
          Cargando comunicaciones y estado de las reglas…
        </div>
      ) : (
        sinAtribuir > 0 && (
          <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12 }}>
            {sinAtribuir} mensajes del período no entran en ninguna etapa porque no se pudo saber de qué cliente son:
            WhatsApp de números que no tienen ficha (alguien preguntando precios sin ser cliente) y correos guardados
            sin ficha asociada.
          </div>
        )
      )}
    </div>
  );
}
