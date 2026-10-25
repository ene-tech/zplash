"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import PriceInput from "@/components/PriceInput";
import { cerrarCaja, reabrirCaja, solicitarReaperturaCaja } from "@/lib/serverActions";
import {
  ahoraEnSantiago,
  CATEGORIA_AJUSTE_CIERRE,
  esAjusteCierreDelDia,
  fmtCLP,
  fmtFecha,
  finHorarioOperador,
  fmtHora,
  idAjusteCierre,
  puedeCerrarCaja,
  puedeCerrarCajaDeHoy,
  puedeReabrirCaja,
  resumenCierreTexto,
  signo,
  todayYMD,
} from "@/lib/helpers";
import type { CierreCaja, Ingreso, MovimientoContable, ResumenCierre, Venta } from "@/types";
import { PRODUCTOS_CIERRE } from "./productos";

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
];

interface Props {
  /** Día que se está mirando, "YYYY-MM-DD". CierreTab solo monta esto cuando
   * el período elegido es un único día: el arqueo se hace de a un día. */
  dia: string;
  ventasDia: Venta[];
  ingresosDia: Ingreso[];
  movimientosManualesDia: MovimientoContable[];
  metodosPago: { metodo: string; cantidad: number; monto: number }[];
  cantidadVentas: number;
  totalVentas: number;
}

// Arquear y cerrar la caja de un día. Las ventas e ingresos del día NO se
// editan ni se borran acá: si algo no cuadra se inscribe un asiento de ajuste
// —de ingreso a túnel (conteo de vehículos) o de ingreso monetario (plata)—,
// que queda registrado con su motivo y deja ver para siempre con qué se
// cuadró el día. El cierre es irreversible: a partir de ahí ninguna venta/
// ingreso/movimiento de ese día se puede tocar (el bloqueo de verdad vive del
// lado del servidor, ver los guards de @/lib/dataAccess/cierre).
export function ArqueoDia(p: Props) {
  const { data, ui, commit, patchUi } = useApp();
  const cierre = data.cierresCaja.find((c) => c.fecha === p.dia);
  const [efectivoContado, setEfectivoContado] = useState("");
  const [notas, setNotas] = useState("");
  const [err, setErr] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [inscribiendo, setInscribiendo] = useState(false);
  // Asiento de ajuste de ingreso monetario (se inscribe antes de cerrar).
  const [ajusteResta, setAjusteResta] = useState(false);
  const [ajusteMonto, setAjusteMonto] = useState("");
  const [ajusteMetodo, setAjusteMetodo] = useState("efectivo");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  // Id del asiento en curso: se fija al primer intento y se reusa si hay que
  // reintentar, para que un guardado que llegó a la base aunque la pantalla
  // lo diera por fallido no quede inscrito dos veces (el servidor no pisa un
  // id existente, ver insertarAjustesCierre). Va atado al contenido: si se
  // cambia monto, medio o motivo es otro asiento. Se libera al guardar bien.
  const ajustePendiente = useRef<{ id: string; firma: string } | null>(null);
  // Asiento de ajuste de ingreso a túnel (se guarda junto con el cierre).
  const [ajusteAutos, setAjusteAutos] = useState("");
  const [ajusteAutosMotivo, setAjusteAutosMotivo] = useState("");

  if (cierre) return <CajaCerrada cierre={cierre} />;
  if (!puedeCerrarCaja(ui.perfilActual?.modulos)) return null;

  const finDelDia = finHorarioOperador(data.config, new Date(`${p.dia}T12:00:00`));
  const efectivoEsperado = p.metodosPago.find((m) => m.metodo === "Efectivo")?.monto || 0;
  const contado = efectivoContado === "" ? undefined : Number(efectivoContado);
  const diferencia = contado === undefined ? null : contado - efectivoEsperado;
  const ajustesInscritos = data.movimientosContables
    .filter((m) => esAjusteCierreDelDia(m.id, p.dia))
    .sort((a, b) => (a.creadoEn || "").localeCompare(b.creadoEn || ""));
  const totalAjustes = ajustesInscritos.reduce((s, m) => s + m.monto, 0);
  const autosAjuste = Math.trunc(Number(ajusteAutos || "0")) || 0;

  // Cada asiento de ajuste monetario es un movimiento contable de ingreso
  // propio (id nuevo, ver idAjusteCierre): un día puede tener varios, unos
  // que suman y otros que restan, y ninguno pisa al anterior. Desde que se
  // guarda entra solo en los totales y medios de pago del día (useCierreData
  // ya lee los ingresos contables manuales del período), así que la caja
  // queda cuadrada sin tocar ninguna venta.
  const inscribirAjuste = async () => {
    const magnitud = Number(ajusteMonto || "0");
    const motivo = ajusteMotivo.trim();
    if (magnitud <= 0) {
      setErr("El monto del asiento de ajuste debe ser mayor a 0.");
      return;
    }
    if (!motivo) {
      setErr("Escribe el motivo del ajuste: es lo que queda registrado en el asiento.");
      return;
    }
    const monto = ajusteResta ? -magnitud : magnitud;
    const firma = JSON.stringify([p.dia, monto, ajusteMetodo, motivo]);
    if (ajustePendiente.current?.firma !== firma) ajustePendiente.current = { id: idAjusteCierre(p.dia), firma };
    const ajuste: MovimientoContable = {
      id: ajustePendiente.current.id,
      tipo: "ingreso",
      fecha: fechaEnElDia(p.dia),
      descripcion: `${CATEGORIA_AJUSTE_CIERRE} ${p.dia} – ${motivo}`,
      categoria: CATEGORIA_AJUSTE_CIERRE,
      monto,
      estado: "pagado",
      metodoPago: ajusteMetodo as MovimientoContable["metodoPago"],
      notas: motivo,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || "",
    };
    setInscribiendo(true);
    const ok = await commit({
      movimientosContables: [ajuste, ...data.movimientosContables.filter((m) => m.id !== ajuste.id)],
    });
    setInscribiendo(false);
    if (!ok) {
      setErr("No se pudo inscribir el asiento de ajuste. Revisa la conexión e inténtalo de nuevo.");
      return;
    }
    ajustePendiente.current = null;
    setErr("");
    setAjusteMonto("");
    setAjusteMotivo("");
  };

  const cerrar = () => {
    if (p.dia === todayYMD() && !cierreDeHoyHabilitado(data.config)) {
      setErr(`La caja de hoy se puede cerrar recién después de las ${finDelDia}, al terminar el horario de funcionamiento.`);
      return;
    }
    if (autosAjuste !== 0 && !ajusteAutosMotivo.trim()) {
      setErr("Escribe el motivo del ajuste de ingreso a túnel: es lo que queda registrado en el asiento.");
      return;
    }
    setErr("");
    const resumen: ResumenCierre = {
      cantidadIngresos: p.ingresosDia.length,
      cantidadVentas: p.cantidadVentas,
      totalVentas: p.totalVentas,
      metodosPago: p.metodosPago,
      efectivoEsperado,
      efectivoContado: contado,
      ajusteIngresos: autosAjuste !== 0 ? { cantidad: autosAjuste, motivo: ajusteAutosMotivo.trim() } : undefined,
    };
    patchUi({
      modal: {
        type: "confirm",
        mensaje: resumenCierreTexto(p.dia, resumen, p.dia === todayYMD()),
        confirmLabel: "Cerrar el día",
        danger: true,
        onConfirm: async () => {
          setCerrando(true);
          // cerradoPor/cerradoEn los reescribe el servidor (ver cerrarCaja):
          // acá van solo para dejar el objeto completo en memoria.
          const nuevo: CierreCaja = {
            fecha: p.dia,
            cerradoPor: ui.perfilActual?.nombre || "",
            cerradoEn: new Date().toISOString(),
            resumen,
            notas: notas.trim() || undefined,
          };
          const res = await cerrarCaja(nuevo);
          setCerrando(false);
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          setErr("");
          // No existe commitCierresCaja: la fila ya la escribió el Server
          // Action de arriba y este commit() solo refresca el estado local
          // (sin ops para esta entidad, no vuelve a guardar nada).
          commit({ cierresCaja: [nuevo, ...data.cierresCaja] });
        },
      },
    });
  };

  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 6 }}>Cierre y arqueo del {fmtFecha(p.dia + "T00:00:00")}</h3>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 14 }}>
        El día se cierra tal como quedó registrado: las ventas y los ingresos de abajo no se editan ni se borran. Si algo no
        cuadra, inscribe un asiento de ajuste con su motivo — así queda para siempre el registro de con qué se cuadró la caja. Una
        vez cerrado el día no se puede modificar; reabrirlo lo aprueba solo Gerencia.
        {p.dia === todayYMD() && ` La caja de hoy se cierra después de las ${finDelDia}, al terminar el horario de funcionamiento.`}
      </p>

      <details className="disclosure">
        <summary>
          Ventas del día <span className="count">({p.ventasDia.length})</span>
        </summary>
        <div className="disclosure-body">
          {p.ventasDia.length === 0 ? (
            <div className="empty">Sin ventas en el día</div>
          ) : (
            <div className="table-scroll">
              <table style={{ marginTop: 4 }}>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Patente</th>
                    <th>Cliente / detalle</th>
                    <th>Tipo de venta</th>
                    <th>Monto</th>
                    <th>Medio de pago</th>
                  </tr>
                </thead>
                <tbody>
                  {p.ventasDia.map((v) => (
                    <tr key={v.id}>
                      <td>{fmtHora(v.fecha)}</td>
                      <td>{v.patente || "—"}</td>
                      <td>{v.nombre}</td>
                      <td>{etiquetaTipo(v.tipo)}</td>
                      <td>{fmtCLP(v.precio)}</td>
                      <td>{etiquetaMetodo(v.metodoPago)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <details className="disclosure">
        <summary>
          Ingresos al túnel del día <span className="count">({p.ingresosDia.length})</span>
        </summary>
        <div className="disclosure-body">
          {p.ingresosDia.length === 0 ? (
            <div className="empty">Sin ingresos en el día</div>
          ) : (
            <div className="table-scroll">
              <table style={{ marginTop: 4 }}>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Patente</th>
                    <th>Cliente</th>
                    <th>Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {p.ingresosDia.map((i) => (
                    <tr key={i.id}>
                      <td>{fmtHora(i.fecha)}</td>
                      <td>{i.patente}</td>
                      <td>{i.nombre}</td>
                      <td>{i.creadoPor || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <h4 style={{ fontSize: 14, color: "var(--gold)", margin: "18px 0 4px" }}>Asiento de ajuste de ingreso a túnel</h4>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
        Diferencia entre los vehículos que pasaron de verdad y los {p.ingresosDia.length} que registró el sistema. Positivo si
        faltan (ej: 2), negativo si se registraron de más (ej: -1). Se guarda con el cierre del día.
      </p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="field" style={{ maxWidth: 150 }}>
          <label>Vehículos (+/-)</label>
          <input type="number" step="1" value={ajusteAutos} onChange={(e) => setAjusteAutos(e.target.value)} placeholder="0" />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Motivo del ajuste</label>
          <input
            value={ajusteAutosMotivo}
            onChange={(e) => setAjusteAutosMotivo(e.target.value)}
            placeholder="Ej: 2 autos que pasaron sin registrar en la mañana"
          />
        </div>
      </div>
      {autosAjuste !== 0 && (
        <p style={{ fontSize: 13, marginBottom: 14 }}>
          Vehículos del día: {p.ingresosDia.length} registrados {signo(autosAjuste)} de ajuste ={" "}
          <strong>{p.ingresosDia.length + autosAjuste}</strong>
        </p>
      )}

      <h4 style={{ fontSize: 14, color: "var(--gold)", margin: "18px 0 4px" }}>Asiento de ajuste de ingreso monetario</h4>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
        Plata que entró y no quedó registrada (suma) o que quedó registrada de más (resta). Se inscribe como ingreso en
        Contabilidad con la fecha del día, y desde ahí entra en los totales y medios de pago de esta pantalla. Puedes inscribir
        varios asientos en el día: cada uno queda registrado por separado con su motivo.
      </p>
      {ajustesInscritos.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          <div style={{ marginBottom: 4 }}>
            Asientos inscritos ({ajustesInscritos.length}) · total <strong>{fmtCLP(totalAjustes)}</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {ajustesInscritos.map((a) => (
              <li key={a.id}>
                <strong>{fmtCLP(a.monto)}</strong> · {etiquetaMetodo(a.metodoPago)} · {a.notas}{" "}
                <span style={{ color: "var(--gray)" }}>
                  ({a.creadoPor}
                  {a.creadoEn ? `, ${fmtHora(a.creadoEn)}` : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ maxWidth: 190 }}>
          <label>Ajuste</label>
          <select value={ajusteResta ? "resta" : "suma"} onChange={(e) => setAjusteResta(e.target.value === "resta")}>
            <option value="suma">Suma a la caja</option>
            <option value="resta">Resta de la caja</option>
          </select>
        </div>
        <div className="field" style={{ maxWidth: 150 }}>
          <label>Monto</label>
          <PriceInput value={ajusteMonto} onChange={setAjusteMonto} />
        </div>
        <div className="field" style={{ maxWidth: 190 }}>
          <label>Medio de pago</label>
          <select value={ajusteMetodo} onChange={(e) => setAjusteMetodo(e.target.value)}>
            {METODOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label>Motivo del ajuste</label>
          <input
            value={ajusteMotivo}
            onChange={(e) => setAjusteMotivo(e.target.value)}
            placeholder="Ej: lavado de moto cobrado en efectivo sin registrar"
          />
        </div>
        <div className="field">
          <button className="btn secondary" disabled={inscribiendo} onClick={inscribirAjuste}>
            {inscribiendo ? "Inscribiendo…" : ajustesInscritos.length > 0 ? "Inscribir otro asiento" : "Inscribir asiento"}
          </button>
        </div>
      </div>

      {p.movimientosManualesDia.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--gray)", margin: "4px 0 14px" }}>
          El día incluye {p.movimientosManualesDia.length} ingreso(s) cargado(s) a mano en Contabilidad por{" "}
          {fmtCLP(p.movimientosManualesDia.reduce((s, m) => s + m.monto, 0))} — los asientos de ajuste, si inscribiste alguno, van
          incluidos ahí y ya suman en los totales de arriba.
        </p>
      )}

      <div className="toolbar" style={{ alignItems: "flex-end", marginTop: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Efectivo contado</label>
          <PriceInput value={efectivoContado} onChange={setEfectivoContado} style={{ maxWidth: 150 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, color: "var(--gray)", textTransform: "uppercase" }}>Notas del cierre (opcional)</label>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: faltó vuelto de la mañana" />
        </div>
        <button className="btn" disabled={cerrando} onClick={cerrar}>
          {cerrando ? "Cerrando…" : "Revisar y cerrar el día"}
        </button>
      </div>

      <p style={{ fontSize: 13, marginTop: 10 }}>
        Efectivo esperado en caja: <strong>{fmtCLP(efectivoEsperado)}</strong>
        {diferencia !== null && (
          <span style={{ color: diferencia === 0 ? "var(--green)" : "var(--red)" }}>
            {diferencia === 0
              ? " · la caja cuadra"
              : diferencia > 0
                ? ` · sobran ${fmtCLP(diferencia)}`
                : ` · faltan ${fmtCLP(-diferencia)}`}
          </span>
        )}
      </p>

      {err && <p className="err">{err}</p>}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  borderRadius: 12,
  padding: 16,
  marginBottom: 24,
};

/** Fecha con la que se inscribe el asiento de ajuste: tiene que caer dentro
 * del día que se está cuadrando (si no, no entraría en su cierre). Para el
 * día de hoy usa la hora real; para un día pasado, el mediodía. Fuera del
 * componente para no leer el reloj durante el render. */
function cierreDeHoyHabilitado(config: Parameters<typeof puedeCerrarCajaDeHoy>[0]): boolean {
  return puedeCerrarCajaDeHoy(config, ahoraEnSantiago());
}

function fechaEnElDia(dia: string): string {
  return dia === todayYMD() ? new Date().toISOString() : new Date(`${dia}T12:00:00`).toISOString();
}

function etiquetaTipo(tipo: string): string {
  return PRODUCTOS_CIERRE.find((x) => x.tipo === tipo)?.label || tipo;
}

function etiquetaMetodo(metodoPago?: string): string {
  if (metodoPago === "orden_compra") return "Orden de compra";
  return METODOS_PAGO.find((m) => m.value === metodoPago)?.label || metodoPago || "Sin especificar";
}

function CajaCerrada({ cierre }: { cierre: CierreCaja }) {
  const { resumen } = cierre;
  const diferencia = resumen.efectivoContado === undefined ? null : resumen.efectivoContado - resumen.efectivoEsperado;
  return (
    <div style={panelStyle}>
      <h3 style={{ fontSize: 16, color: "var(--gold)", marginBottom: 6 }}>Caja cerrada · {fmtFecha(cierre.fecha + "T00:00:00")}</h3>
      <p style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
        Cerrada por {cierre.cerradoPor} el {fmtFecha(cierre.cerradoEn)} a las {fmtHora(cierre.cerradoEn)}. Este día ya no se puede
        modificar.
      </p>
      <ReaperturaCaja cierre={cierre} />
      <table>
        <tbody>
          <tr>
            <td>Vehículos ingresados</td>
            <td>{resumen.cantidadIngresos}</td>
          </tr>
          {resumen.ajusteIngresos && (
            <tr>
              <td>Asiento de ajuste de ingreso a túnel</td>
              <td>
                {signo(resumen.ajusteIngresos.cantidad)} · {resumen.ajusteIngresos.motivo} · total real{" "}
                {resumen.cantidadIngresos + resumen.ajusteIngresos.cantidad}
              </td>
            </tr>
          )}
          <tr>
            <td>Ventas</td>
            <td>
              {resumen.cantidadVentas} · {fmtCLP(resumen.totalVentas)}
            </td>
          </tr>
          {resumen.metodosPago.map((m) => (
            <tr key={m.metodo}>
              <td>{m.metodo}</td>
              <td>
                {m.cantidad} · {fmtCLP(m.monto)}
              </td>
            </tr>
          ))}
          <tr>
            <td>Efectivo esperado</td>
            <td>{fmtCLP(resumen.efectivoEsperado)}</td>
          </tr>
          <tr>
            <td>Efectivo contado</td>
            <td>
              {resumen.efectivoContado === undefined ? "No se contó" : fmtCLP(resumen.efectivoContado)}
              {diferencia !== null && diferencia !== 0 && (
                <span style={{ color: "var(--red)" }}>
                  {diferencia > 0 ? ` · sobraron ${fmtCLP(diferencia)}` : ` · faltaron ${fmtCLP(-diferencia)}`}
                </span>
              )}
            </td>
          </tr>
          {cierre.notas && (
            <tr>
              <td>Notas</td>
              <td>{cierre.notas}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Reabrir la caja de hoy: quien la cerró (módulo "arqueo") lo pide con un
// motivo y Gerencia lo aprueba. Los permisos de verdad viven en
// solicitarReaperturaCaja/reabrirCaja; acá solo se esconde lo que no aplica.
function ReaperturaCaja({ cierre }: { cierre: CierreCaja }) {
  const { data, ui, commit, patchUi } = useApp();
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const perfil = ui.perfilActual;
  const esGerencia = puedeReabrirCaja(perfil?.nombre);
  if (cierre.fecha !== todayYMD()) return null;
  if (!esGerencia && !puedeCerrarCaja(perfil?.modulos)) return null;

  const solicitar = async () => {
    setEnviando(true);
    const res = await solicitarReaperturaCaja(cierre.fecha, motivo);
    setEnviando(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setErr("");
    const actualizado: CierreCaja = {
      ...cierre,
      reaperturaSolicitadaPor: perfil?.nombre || "",
      reaperturaSolicitadaEn: new Date().toISOString(),
      reaperturaMotivo: motivo.trim(),
    };
    // Sin ops para esta entidad: solo refresca el estado local (ver cerrar).
    commit({ cierresCaja: data.cierresCaja.map((c) => (c.fecha === cierre.fecha ? actualizado : c)) });
  };

  const reabrir = () => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Reabrir la caja de hoy? Se borra el arqueo guardado y el POS y el túnel vuelven a registrar ventas. Al final del día hay que volver a cerrarla.`,
        confirmLabel: "Reabrir caja",
        danger: true,
        onConfirm: async () => {
          setEnviando(true);
          const res = await reabrirCaja(cierre.fecha);
          setEnviando(false);
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          setErr("");
          commit({ cierresCaja: data.cierresCaja.filter((c) => c.fecha !== cierre.fecha) });
        },
      },
    });
  };

  return (
    <div style={{ margin: "0 0 14px", padding: 12, border: "1px dashed var(--border)", borderRadius: 10 }}>
      {cierre.reaperturaSolicitadaEn ? (
        <p style={{ fontSize: 13, marginBottom: esGerencia ? 10 : 0 }}>
          <strong>{cierre.reaperturaSolicitadaPor}</strong> pidió reabrir la caja a las {fmtHora(cierre.reaperturaSolicitadaEn)}:{" "}
          {cierre.reaperturaMotivo}
          {!esGerencia && <span style={{ color: "var(--gray)" }}> · esperando a Gerencia</span>}
        </p>
      ) : (
        !esGerencia && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
              <label>Motivo para reabrir</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: se cerró antes de tiempo, falta vender" />
            </div>
            <button className="btn secondary" disabled={enviando} onClick={solicitar}>
              {enviando ? "Enviando…" : "Solicitar apertura de caja"}
            </button>
          </div>
        )
      )}
      {esGerencia && (
        <button className="btn" disabled={enviando} onClick={reabrir}>
          {cierre.reaperturaSolicitadaEn ? "Aprobar y reabrir caja" : "Reabrir caja"}
        </button>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
