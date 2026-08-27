"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppUi } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import { fmtHora, nivelEstanque, uid, umbralBajo } from "@/lib/helpers";
import {
  actualizarValvula,
  cargarEstanques,
  crearValvula,
  deleteEstanques,
  deleteValvulas,
  setValvula,
  upsertEstanques,
} from "@/lib/serverActions";
import type { EstanqueConLectura, Valvula } from "@/types";
import { Droplets, Settings } from "lucide-react";

// Cada cuánto se repregunta el estado. El controlador reporta cada ~60s, así
// que refrescar mucho más seguido que esto solo agrega queries sin datos
// nuevos. Esta vista no vive en AppData (ver @/types/estanques): se carga
// sola y se refresca sola.
const REFRESCO_MS = 15_000;

const TABS = [
  { id: "monitor", label: "Monitor", icon: Droplets },
  { id: "config", label: "Estanques y calibración", icon: Settings },
] as const;

/** Un campo numérico vacío o ilegible conserva el valor anterior en vez de
 *  caer a 0. Con capacidad 0 el estanque queda "Lleno" para siempre y el
 *  servidor le cierra la válvula en cada ciclo: borrar el campo para
 *  reescribirlo no puede dejar el llenado inutilizable. */
function num(valor: string, actual: number): number {
  const n = Number(valor);
  return valor.trim() !== "" && Number.isFinite(n) ? n : actual;
}

/** "ESTANQUE 3" cuando 1 y 2 existen — y salta los huecos que dejó un borrado.
 *  `nombre` es UNIQUE en la base, y el upsert resuelve el conflicto por id, no
 *  por nombre: un choque volvía como "no se pudo guardar (sin conexión)". */
function nombreLibre(prefijo: string, usados: string[]): string {
  const tomados = new Set(usados.map((n) => n.toUpperCase()));
  for (let i = 1; ; i++) {
    const candidato = `${prefijo} ${i}`;
    if (!tomados.has(candidato)) return candidato;
  }
}

export default function EstanquesView() {
  const { ui, patchUi, logout } = useAppUi();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("monitor");
  const [estanques, setEstanques] = useState<EstanqueConLectura[]>([]);
  const [valvulas, setValvulas] = useState<Valvula[]>([]);
  // `ahora` viaja en el estado y no se lee con Date.now() dentro del render:
  // un componente no puede leer el reloj directo (react-hooks/purity), y de
  // paso "Sin señal" aparece en el mismo tick en que llegan los datos.
  const [ahora, setAhora] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const montado = useRef(true);

  const refrescar = useCallback(async () => {
    try {
      const datos = await cargarEstanques();
      if (!montado.current) return;
      setEstanques(datos.estanques);
      setValvulas(datos.valvulas);
      setAhora(Date.now());
      setErrorCarga(false);
    } catch {
      // Sin este catch, un fallo de red dejaba la promesa rechazada y la
      // pantalla clavada en "Consultando los sensores…" para siempre.
      if (montado.current) setErrorCarga(true);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    // La carga se envuelve acá adentro y no se llama refrescar() directo:
    // react-hooks/set-state-in-effect no puede ver que los setState de
    // refrescar() ocurren después de un await.
    const cargar = async () => {
      await refrescar();
    };
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [refrescar]);

  const confirmar = (mensaje: string, confirmLabel: string, accion: () => void, danger = false) =>
    patchUi({ modal: { type: "confirm", mensaje, confirmLabel, danger, onConfirm: accion } });

  const pedirValvula = (v: Valvula, abrir: boolean) => {
    const aplicar = async () => {
      await setValvula(v.id, abrir);
      refrescar();
    };
    // Cerrar es siempre seguro y va directo. Abrir agua a distancia, sin
    // tener el estanque a la vista, pasa por confirmación.
    if (!abrir) {
      aplicar();
      return;
    }
    confirmar(`Vas a abrir "${v.nombre}" de forma remota. ¿Confirmas?`, "Abrir", aplicar);
  };

  return (
    <>
      <Topbar
        mode={`Estanques y Válvulas · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout()}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="sidebar-layout">
          <div className="tabs-sidebar">
            {TABS.map((t) => (
              <div
                key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                onClick={() => setTab(t.id)}
                title={t.label}
              >
                <t.icon />
                <span className="tab-label">{t.label}</span>
              </div>
            ))}
          </div>
          <div className="sidebar-content">
            {errorCarga && (
              <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
                No se pudo consultar el estado. Reintentando cada {REFRESCO_MS / 1000}s.
              </div>
            )}
            {cargando ? (
              <div className="empty">Consultando los sensores…</div>
            ) : tab === "monitor" ? (
              <Monitor
                estanques={estanques.filter((e) => e.activo)}
                valvulas={valvulas.filter((v) => v.activo)}
                ahora={ahora}
                onValvula={pedirValvula}
              />
            ) : (
              <Configuracion
                estanques={estanques}
                valvulas={valvulas}
                onCambio={refrescar}
                onConfirmar={confirmar}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Monitor({
  estanques,
  valvulas,
  ahora,
  onValvula,
}: {
  estanques: EstanqueConLectura[];
  valvulas: Valvula[];
  ahora: number;
  onValvula: (v: Valvula, abrir: boolean) => void;
}) {
  if (!estanques.length && !valvulas.length) {
    return <div className="empty">Todavía no hay estanques ni válvulas. Créalos en la pestaña de al lado.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h3>Nivel de estanques</h3>
        <div className="nivel-grid">
          {estanques.map((e) => {
            const n = nivelEstanque(e, ahora);
            return (
              <div key={e.id} className="modal nivel-card">
                <div className="nivel-head">
                  <span className="nivel-nombre">{e.nombre}</span>
                  {/* El estado va además en texto y nunca solo en el color de
                      la barra: con daltonismo, o en la pantalla del local
                      lavada por el sol, el color no alcanza. */}
                  <span className={`status-pill ${n.cls}`}>{n.label}</span>
                </div>
                <div
                  className="nivel-bar"
                  title={e.ultima ? `Lectura del sensor: ${e.ultima.crudo} · ${fmtHora(e.ultima.medidoEn)}` : "Sin lecturas"}
                >
                  <div className={`nivel-fill ${n.cls}`} style={{ width: `${n.porcentaje ?? 0}%` }} />
                </div>
                {n.litros === null ? (
                  <div className="nivel-datos">
                    Última lectura: {e.ultima ? fmtHora(e.ultima.medidoEn) : "nunca"}
                  </div>
                ) : (
                  <div className="nivel-datos">
                    <strong>{Math.round(n.litros).toLocaleString("es-CL")} L</strong> de{" "}
                    {e.capacidadLitros.toLocaleString("es-CL")} L · {Math.round(n.porcentaje ?? 0)}%
                  </div>
                )}
                {e.contenido && <div className="nivel-datos">{e.contenido}</div>}
              </div>
            );
          })}
          {!estanques.length && <div className="empty">Sin estanques activos</div>}
        </div>
      </div>

      <div>
        <h3>Válvulas</h3>
        <div className="nivel-grid">
          {valvulas.map((v) => {
            // Pedida pero sin confirmar = el controlador todavía no reportó
            // que la aplicó (o está caído, o el relé quedó trabado). No se
            // pinta como si ya estuviera en esa posición: en una llave de
            // agua esa mentira se paga cara.
            const confirmada = !!v.confirmadaEn;
            const estanque = estanques.find((e) => e.id === v.estanqueId);
            return (
              <div key={v.id} className="modal nivel-card">
                <div className="nivel-head">
                  <span className="nivel-nombre">{v.nombre}</span>
                  <span className={`status-pill ${confirmada ? (v.abierta ? "ok" : "warn") : "bad"}`}>
                    {confirmada ? (v.abierta ? "Abierta" : "Cerrada") : "Sin confirmar"}
                  </span>
                </div>
                <div className="nivel-datos">
                  {estanque ? `Llena ${estanque.nombre}` : "Sin estanque asociado"}
                  {v.cambiadoPor ? ` · ${v.cambiadoPor}, ${fmtHora(v.cambiadoEn)}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn" disabled={v.abierta} onClick={() => onValvula(v, true)}>
                    Abrir
                  </button>
                  <button className="btn ghost" disabled={!v.abierta} onClick={() => onValvula(v, false)}>
                    Cerrar
                  </button>
                </div>
              </div>
            );
          })}
          {!valvulas.length && <div className="empty">Sin válvulas activas</div>}
        </div>
      </div>
    </div>
  );
}

function Configuracion({
  estanques,
  valvulas,
  onCambio,
  onConfirmar,
}: {
  estanques: EstanqueConLectura[];
  valvulas: Valvula[];
  onCambio: () => void;
  onConfirmar: (mensaje: string, confirmLabel: string, accion: () => void, danger?: boolean) => void;
}) {
  const [err, setErr] = useState<{ msg: string; ok: boolean } | null>(null);

  const guardar = async (operacion: Promise<boolean>) => {
    setErr((await operacion) ? { msg: "Guardado", ok: true } : { msg: "No se pudo guardar", ok: false });
    onCambio();
  };

  const borrarEstanque = (e: EstanqueConLectura) =>
    onConfirmar(
      `Borrar "${e.nombre}" elimina también todo su historial de lecturas y desasocia sus válvulas. ¿Confirmas?`,
      "Borrar",
      () => guardar(deleteEstanques([e.id])),
      true
    );

  /** Sube o baja un estanque una posición. Reescribe todos los que quedan con
   *  un `orden` distinto al que tenían y no solo los dos que se permutan: los
   *  estanques anteriores a esta columna traen todos orden 0, y permutar dos
   *  ceros no mueve nada. */
  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= estanques.length) return;
    const copia = [...estanques];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    guardar(upsertEstanques(copia.flatMap((e, idx) => (e.orden === idx ? [] : [{ ...e, orden: idx }]))));
  };

  const borrarValvula = (v: Valvula) =>
    onConfirmar(`Borrar la válvula "${v.nombre}". ¿Confirmas?`, "Borrar", () => guardar(deleteValvulas([v.id])), true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {err && <div style={{ color: err.ok ? "var(--green)" : "var(--red)", fontSize: 13 }}>{err.msg}</div>}

      <div>
        <h3>Estanques</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, margin: "6px 0 14px" }}>
          Litros = (lectura del sensor − offset) × litros por unidad. Llena el estanque hasta un nivel que conozcas,
          mira el valor crudo en la columna de la derecha y ajusta estos dos números hasta que calce: ningún sensor
          viene calibrado para tu estanque. En un ultrasónico (mide distancia al agua, no columna) los litros por
          unidad van en negativo y el offset es la lectura con el estanque lleno.
        </div>
        <table>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Nombre</th>
              <th>Contenido</th>
              <th>Capacidad (L)</th>
              <th>Offset</th>
              <th>L / unidad</th>
              <th>Umbral bajo (L)</th>
              <th>Activo</th>
              <th>Crudo</th>
              <th>ID para el controlador</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {estanques.map((e, i) => (
              <tr key={e.id}>
                <td>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="icon-btn" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      title="Bajar"
                      disabled={i === estanques.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  <input
                    defaultValue={e.nombre}
                    onBlur={(ev) => guardar(upsertEstanques([{ ...e, nombre: ev.target.value.toUpperCase() }]))}
                  />
                </td>
                <td>
                  <input
                    defaultValue={e.contenido || ""}
                    placeholder="Agua, shampoo…"
                    onBlur={(ev) => guardar(upsertEstanques([{ ...e, contenido: ev.target.value }]))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={e.capacidadLitros}
                    onBlur={(ev) =>
                      guardar(upsertEstanques([{ ...e, capacidadLitros: num(ev.target.value, e.capacidadLitros) }]))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    defaultValue={e.offsetCrudo}
                    onBlur={(ev) => guardar(upsertEstanques([{ ...e, offsetCrudo: num(ev.target.value, e.offsetCrudo) }]))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="any"
                    defaultValue={e.litrosPorUnidad}
                    onBlur={(ev) =>
                      guardar(upsertEstanques([{ ...e, litrosPorUnidad: num(ev.target.value, e.litrosPorUnidad) }]))
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={e.umbralBajoLitros ?? ""}
                    placeholder={String(Math.round(umbralBajo(e)))}
                    onBlur={(ev) =>
                      guardar(
                        upsertEstanques([
                          { ...e, umbralBajoLitros: ev.target.value.trim() ? num(ev.target.value, umbralBajo(e)) : undefined },
                        ])
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    defaultChecked={e.activo}
                    onChange={(ev) => guardar(upsertEstanques([{ ...e, activo: ev.target.checked }]))}
                  />
                </td>
                <td style={{ color: "var(--gray)" }}>{e.ultima ? e.ultima.crudo : "—"}</td>
                <td style={{ color: "var(--gray)", fontFamily: "monospace" }}>{e.id}</td>
                <td>
                  <button className="icon-btn" onClick={() => borrarEstanque(e)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!estanques.length && <div className="empty">Todavía no hay estanques</div>}
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() =>
            guardar(
              upsertEstanques([
                {
                  id: uid(),
                  nombre: nombreLibre("ESTANQUE", estanques.map((e) => e.nombre)),
                  capacidadLitros: 1000,
                  offsetCrudo: 0,
                  litrosPorUnidad: 1,
                  activo: true,
                  orden: estanques.length,
                  creadoEn: new Date().toISOString(),
                },
              ])
            )
          }
        >
          Agregar estanque
        </button>
      </div>

      <div>
        <h3>Válvulas</h3>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, margin: "6px 0 14px" }}>
          Asociar la válvula a un estanque hace que el servidor la cierre cuando ese estanque llega a su capacidad, y
          también si queda abierta más de hora y media. Los dos son respaldos: la protección real contra rebalse sigue
          siendo la boya mecánica.
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estanque que llena</th>
              <th>Activa</th>
              <th>ID para el controlador</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {valvulas.map((v) => (
              <tr key={v.id}>
                <td>
                  <input
                    defaultValue={v.nombre}
                    onBlur={(ev) => guardar(actualizarValvula(v.id, { nombre: ev.target.value.toUpperCase() }))}
                  />
                </td>
                <td>
                  <select
                    defaultValue={v.estanqueId || ""}
                    onChange={(ev) => guardar(actualizarValvula(v.id, { estanqueId: ev.target.value }))}
                  >
                    <option value="">Ninguno</option>
                    {estanques.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    defaultChecked={v.activo}
                    onChange={(ev) => guardar(actualizarValvula(v.id, { activo: ev.target.checked }))}
                  />
                </td>
                <td style={{ color: "var(--gray)", fontFamily: "monospace" }}>{v.id}</td>
                <td>
                  <button className="icon-btn" onClick={() => borrarValvula(v)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!valvulas.length && <div className="empty">Todavía no hay válvulas</div>}
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() =>
            guardar(
              crearValvula({
                id: uid(),
                nombre: nombreLibre("VÁLVULA", valvulas.map((v) => v.nombre)),
                abierta: false,
                cambiadoEn: new Date().toISOString(),
                activo: true,
              })
            )
          }
        >
          Agregar válvula
        </button>
      </div>
    </div>
  );
}
