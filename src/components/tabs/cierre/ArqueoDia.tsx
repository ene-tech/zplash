"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import PriceInput from "@/components/PriceInput";
import { cerrarCaja } from "@/lib/serverActions";
import {
  CATEGORIA_AJUSTE_CIERRE,
  fmtCLP,
  fmtFecha,
  fmtHora,
  idAjusteCierre,
  puedeCerrarCaja,
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
  // Asiento de ajuste de ingreso a túnel (se guarda junto con el cierre).
  const [ajusteAutos, setAjusteAutos] = useState("");
  const [ajusteAutosMotivo, setAjusteAutosMotivo] = useState("");

  if (cierre) return <CajaCerrada cierre={cierre} />;
  if (!puedeCerrarCaja(ui.perfilActual?.modulos)) return null;

  const efectivoEsperado = p.metodosPago.find((m) => m.metodo === "Efectivo")?.monto || 0;
  const contado = efectivoContado === "" ? undefined : Number(efectivoContado);
  const diferencia = contado === undefined ? null : contado - efectivoEsperado;
  const idAjuste = idAjusteCierre(p.dia);
  const ajusteInscrito = data.movimientosContables.find((m) => m.id === idAjuste);
  const autosAjuste = Math.trunc(Number(ajusteAutos || "0")) || 0;

  // El asiento de ajuste monetario es un movimiento contable de ingreso con
  // id determinístico por día (ver idAjusteCierre): vuelve a inscribirse
  // encima del anterior en vez de acumular ajustes sueltos, y desde que se
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
    const ajuste: MovimientoContable = {
      id: idAjuste,
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
      movimientosContables: [ajuste, ...data.movimientosContables.filter((m) => m.id !== idAjuste)],
    });
    setInscribiendo(false);
    if (!ok) {
      setErr("No se pudo inscribir el asiento de ajuste. Revisa la conexión e inténtalo de nuevo.");
      return;
    }
    setErr("");
    setAjusteMonto("");
    setAjusteMotivo("");
  };

  const cerrar = () => {
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
          const ok = await cerrarCaja(nuevo);
          setCerrando(false);
          if (!ok) {
            setErr("No se pudo cerrar la caja. Puede que el día ya esté cerrado o que tu perfil no tenga el permiso.");
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
        vez cerrado el día no se puede modificar nunca más, ni deshacer.
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
        Contabilidad con la fecha del día, y desde ahí entra en los totales y medios de pago de esta pantalla. Hay un solo asiento
        de ajuste por día: volver a inscribirlo reemplaza al anterior.
      </p>
      {ajusteInscrito && (
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          Asiento inscrito: <strong>{fmtCLP(ajusteInscrito.monto)}</strong> · {etiquetaMetodo(ajusteInscrito.metodoPago)} ·{" "}
          {ajusteInscrito.notas} <span style={{ color: "var(--gray)" }}>({ajusteInscrito.creadoPor})</span>
        </p>
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
            {inscribiendo ? "Inscribiendo…" : ajusteInscrito ? "Reemplazar asiento" : "Inscribir asiento"}
          </button>
        </div>
      </div>

      {p.movimientosManualesDia.length > 0 && (
        <p style={{ fontSize: 12, color: "var(--gray)", margin: "4px 0 14px" }}>
          El día incluye {p.movimientosManualesDia.length} ingreso(s) cargado(s) a mano en Contabilidad por{" "}
          {fmtCLP(p.movimientosManualesDia.reduce((s, m) => s + m.monto, 0))} — el asiento de ajuste, si lo inscribiste, va
          incluido ahí y ya suma en los totales de arriba.
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
function fechaEnElDia(dia: string): string {
  return dia === todayYMD() ? new Date().toISOString() : new Date(`${dia}T12:00:00`).toISOString();
}

function etiquetaTipo(tipo: string): string {
  return PRODUCTOS_CIERRE.find((x) => x.tipo === tipo)?.label || tipo;
}

function etiquetaMetodo(metodoPago?: string): string {
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
