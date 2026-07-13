"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import DatosTransferencia from "@/components/DatosTransferencia";
import {
  PATENTE_FORMATO_MSG,
  RUT_FORMATO_MSG,
  SERVICIOS_ADICIONALES,
  findClient,
  fmtCLP,
  formatRut,
  isValidPatente,
  isValidRut,
  normPlate,
  planStatus,
  precioServicioAdicional,
  todayStr,
  uid,
  uidIngreso,
} from "@/lib/helpers";
import type { Cliente, Empresa, Ingreso, Venta } from "@/types";

const GLOSA_LIMPIEZA_COMPLETA = "Limpieza Completa";

const ERROR_GUARDADO = "No se pudo guardar el servicio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";
const CATEGORIA_DETAILING = "Lavado Completo Detailing";
const CATEGORIA_ADICIONALES = "Servicios Adicionales";
const AJUSTES = [5000, 10000] as const;

type EstadoPago = "pagado" | "abono50" | "pendiente";
type Linea = { id: string; nombre: string; precio: number };
type ItemPersonalizado = { id: string; nombre: string; precio: number };

export default function ServiciosAdicionalesView() {
  const { data, ui, commit, patchUi } = useApp();
  const patenteRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const horaEntregaRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const detallePersonalizadoRef = useRef<HTMLInputElement>(null);
  const montoPersonalizadoRef = useRef<HTMLInputElement>(null);

  const [patenteBuscada, setPatenteBuscada] = useState<string | null>(null);
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [itemsPersonalizados, setItemsPersonalizados] = useState<ItemPersonalizado[]>([]);
  const [ajuste, setAjuste] = useState<0 | 5000 | 10000>(0);
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [estadoPago, setEstadoPago] = useState<EstadoPago | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [err, setErr] = useState("");

  const clienteExistente = patenteBuscada ? findClient(data.clientes, patenteBuscada) || null : null;
  const categorias = Array.from(new Set(SERVICIOS_ADICIONALES.map((s) => s.categoria)));

  const hayDetailingSeleccionado = serviciosSeleccionados.some(
    (id) => SERVICIOS_ADICIONALES.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );

  const primerDetailingIdx = serviciosSeleccionados.findIndex(
    (id) => SERVICIOS_ADICIONALES.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );
  const lineasCatalogo: Linea[] = serviciosSeleccionados.map((id, idx) => {
    const s = SERVICIOS_ADICIONALES.find((x) => x.id === id)!;
    const precio = precioServicioAdicional(data.precios, s) + (idx === primerDetailingIdx && ajuste > 0 ? ajuste : 0);
    return { id: s.id, nombre: s.nombre, precio };
  });
  const lineasPersonalizadas: Linea[] = itemsPersonalizados.map((i) => ({ id: i.id, nombre: i.nombre, precio: i.precio }));
  const lineas: Linea[] = [...lineasCatalogo, ...lineasPersonalizadas];
  const totalListado = lineas.reduce((s, l) => s + l.precio, 0);
  const montoCobradoTotal = estadoPago === "pagado" ? totalListado : estadoPago === "abono50" ? Math.round(totalListado / 2) : 0;

  const toggleServicio = (id: string, categoria: string) => {
    setServiciosSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setErr("");
    if (categoria !== CATEGORIA_DETAILING) return;
  };

  const agregarPersonalizado = () => {
    const nombre = detallePersonalizadoRef.current?.value.trim() || "";
    const monto = Number(montoPersonalizadoRef.current?.value || "0");
    if (!nombre || !monto || monto <= 0) {
      setErr("Ingresa un detalle y un monto válido para el servicio personalizado");
      return;
    }
    setErr("");
    setItemsPersonalizados((prev) => [...prev, { id: "custom-" + Date.now(), nombre, precio: monto }]);
    if (detallePersonalizadoRef.current) detallePersonalizadoRef.current.value = "";
    if (montoPersonalizadoRef.current) montoPersonalizadoRef.current.value = "";
  };

  const quitarPersonalizado = (id: string) => {
    setItemsPersonalizados((prev) => prev.filter((i) => i.id !== id));
  };

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos en vez de tipearlos de nuevo.
  // Si no existe, registrar() la crea con este cliente como contacto.
  const onRutBlur = () => {
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (rutRef.current) rutRef.current.value = rutFormateado;
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rutFormateado);
    if (!empresa) return;
    if (razonSocialRef.current) razonSocialRef.current.value = empresa.razonSocial;
    if (direccionRef.current) direccionRef.current.value = empresa.direccion || "";
    if (giroRef.current) giroRef.current.value = empresa.giro || "";
  };

  const buscarPatente = () => {
    const patente = normPlate(patenteRef.current?.value || "");
    if (!patente) {
      setErr("Ingresa una patente");
      return;
    }
    if (!isValidPatente(patente)) {
      setErr(PATENTE_FORMATO_MSG);
      return;
    }
    setErr("");
    const cliente = findClient(data.clientes, patente);
    setPatenteBuscada(patente);
    setTipoDoc(cliente?.tipoDocumento === "Factura" ? "Factura" : "Boleta");
    setServiciosSeleccionados([]);
    setItemsPersonalizados([]);
    setAjuste(0);
    setEstadoPago(null);
    setMetodoPago(null);
  };

  const cambiarPatente = () => {
    setPatenteBuscada(null);
    setServiciosSeleccionados([]);
    setItemsPersonalizados([]);
    setAjuste(0);
    setEstadoPago(null);
    setMetodoPago(null);
    setErr("");
  };

  const registrar = async () => {
    if (!patenteBuscada) return;
    if (lineas.length === 0) {
      setErr("Selecciona al menos un servicio");
      return;
    }
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    if (!nombre) {
      setErr("El nombre es obligatorio");
      return;
    }
    if (!estadoPago) {
      setErr("Indica si está pagado, con abono del 50% o por pagar");
      return;
    }
    if (estadoPago !== "pendiente" && !metodoPago) {
      setErr("Selecciona efectivo o tarjeta");
      return;
    }

    const telefono = telefonoRef.current?.value.trim() || "";
    const email = emailRef.current?.value.trim() || "";
    const vehiculo = vehiculoRef.current?.value.trim() || "";
    const razonSocial = tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDoc === "Factura" ? rutRef.current?.value.trim() || "" : "";
    if (tipoDoc === "Factura" && !isValidRut(rutRaw)) {
      setErr(RUT_FORMATO_MSG);
      return;
    }
    const rut = tipoDoc === "Factura" ? formatRut(rutRaw) : "";
    const direccion = tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "";
    const horaEntrega = horaEntregaRef.current?.value || "";
    const notas = notasRef.current?.value.trim() || "";

    setErr("");
    const patente = patenteBuscada;
    const existente = clienteExistente;

    let clientes = data.clientes;
    let clienteId: string;

    if (existente) {
      const actualizado: Cliente = {
        ...existente,
        nombre,
        telefono: telefono || existente.telefono,
        email: email || existente.email,
        vehiculo: vehiculo || existente.vehiculo,
        tipoDocumento: tipoDoc,
        razonSocial: tipoDoc === "Factura" ? razonSocial : existente.razonSocial,
        rut: tipoDoc === "Factura" ? rut : existente.rut,
        direccion: tipoDoc === "Factura" ? direccion : existente.direccion,
        giro: tipoDoc === "Factura" ? giro : existente.giro,
      };
      clientes = data.clientes.map((c) => (c.id === existente.id ? actualizado : c));
      clienteId = existente.id;
    } else {
      const nuevo: Cliente = {
        id: uid(),
        nombre,
        patente,
        telefono,
        email,
        vehiculo,
        tipoDocumento: tipoDoc,
        razonSocial,
        rut,
        direccion,
        giro,
        vencimiento: null,
        fechaContratacion: null,
        origen: "LOCAL",
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
      clientes = [...data.clientes, nuevo];
      clienteId = nuevo.id;
    }

    // El RUT manda: si es Factura y ese RUT no pertenece a ninguna empresa ya
    // registrada, se crea una nueva en Empresas con este cliente como contacto.
    let nuevaEmpresa: Empresa | undefined;
    if (tipoDoc === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: clienteId,
        contactoNombre: nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
    }

    const ahora = new Date().toISOString();

    // Un lavado completo/detailing implica que el vehículo pasó por el túnel,
    // así que además de las ventas se deja registro en Historial de Ingresos.
    let ingresosNuevos = data.ingresos;
    if (hayDetailingSeleccionado) {
      const clienteParaIngreso = clientes.find((c) => c.id === clienteId)!;
      const ingreso: Ingreso = {
        id: uidIngreso(),
        clienteId,
        patente,
        nombre,
        fecha: ahora,
        planEstadoAlIngreso: planStatus(clienteParaIngreso).cls,
        creadoPor: ui.perfilActual?.nombre || "",
        glosa: GLOSA_LIMPIEZA_COMPLETA,
      };
      clientes = clientes.map((c) =>
        c.id === clienteId ? { ...c, visitas: (c.visitas || 0) + 1, ultimaVisita: ahora } : c
      );
      ingresosNuevos = [ingreso, ...data.ingresos];
    }

    const ventasNuevas: Venta[] = lineas.map((l, idx) => ({
      id: "v" + Date.now() + "-" + idx,
      clienteId,
      patente,
      nombre,
      plan: "",
      precio: l.precio,
      tipo: l.nombre,
      fecha: ahora,
      creadoPor: ui.perfilActual?.nombre || "",
      metodoPago: estadoPago === "pendiente" ? undefined : metodoPago || undefined,
      horaEntrega: horaEntrega || undefined,
      notas: notas || undefined,
      estadoPago,
      montoCobrado: totalListado > 0 ? Math.round((l.precio / totalListado) * montoCobradoTotal) : 0,
      esServicioAdicional: true,
    }));

    const ok = await commit({
      clientes,
      ventas: [...ventasNuevas, ...data.ventas],
      ingresos: ingresosNuevos,
      ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
    });
    if (!ok) {
      setErr(ERROR_GUARDADO);
      return;
    }
    if (patenteRef.current) patenteRef.current.value = "";
    setPatenteBuscada(null);
    setServiciosSeleccionados([]);
    setItemsPersonalizados([]);
    setAjuste(0);
    setTipoDoc("Boleta");
    setEstadoPago(null);
    setMetodoPago(null);
  };

  const hoy = todayStr();
  const hoyList = data.ventas.filter((v) => v.esServicioAdicional && new Date(v.fecha).toDateString() === hoy);

  return (
    <>
      <Topbar
        mode={`Servicios Adicionales · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => patchUi({ view: "login", perfilActual: null, perfilSeleccionadoId: null, loginMode: null })}
        onBack={() => patchUi({ view: "hub" })}
      />
      <div className="content">
        <div className="scan-panel" style={{ textAlign: "left" }}>
          <h2 style={{ textAlign: "center", textTransform: "uppercase" }}>Registrar servicio adicional</h2>

          {patenteBuscada === null ? (
            <>
              <div className="field">
                <label>Patente</label>
                <input
                  ref={patenteRef}
                  style={{ textTransform: "uppercase" }}
                  placeholder="AB1234"
                  maxLength={8}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarPatente();
                  }}
                />
              </div>
              <div className="err">{err}</div>
              <button className="btn" onClick={buscarPatente}>
                Buscar
              </button>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <span className="plate-tag" style={{ fontSize: 18 }}>
                  {patenteBuscada}
                </span>
                {clienteExistente ? (
                  <span className="status-pill ok">Cliente existente</span>
                ) : (
                  <span className="status-pill warn">Cliente nuevo</span>
                )}
                <button className="btn ghost" style={{ marginTop: 0, marginLeft: "auto" }} onClick={cambiarPatente}>
                  Cambiar patente
                </button>
              </div>

              {categorias.map((cat) => (
                <div key={cat} style={{ marginBottom: 18 }}>
                  <div
                    className="hint"
                    style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}
                  >
                    {cat}
                  </div>
                  <div className="service-grid">
                    {SERVICIOS_ADICIONALES.filter((s) => s.categoria === cat).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`service-btn${serviciosSeleccionados.includes(s.id) ? " selected" : ""}`}
                        onClick={() => toggleServicio(s.id, s.categoria)}
                      >
                        <div className="nombre">{s.nombre}</div>
                        <div className="precio">{fmtCLP(precioServicioAdicional(data.precios, s))}</div>
                      </button>
                    ))}
                  </div>
                  {cat === CATEGORIA_DETAILING && hayDetailingSeleccionado && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      {AJUSTES.map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={ajuste === a ? "btn" : "btn ghost"}
                          style={{ marginTop: 0 }}
                          onClick={() => setAjuste(ajuste === a ? 0 : a)}
                        >
                          + {fmtCLP(a)}
                        </button>
                      ))}
                    </div>
                  )}
                  {cat === CATEGORIA_ADICIONALES && (
                    <div style={{ marginTop: 14 }}>
                      <div
                        className="hint"
                        style={{ textAlign: "left", marginBottom: 8, textTransform: "uppercase", fontWeight: 700 }}
                      >
                        Monto adicional escrito
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <input
                          ref={detallePersonalizadoRef}
                          placeholder="Ej: Limpieza solo 1 butaca copiloto"
                          style={{
                            flex: "2 1 220px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--white)",
                            padding: "10px 12px",
                            borderRadius: 8,
                            fontSize: 14,
                          }}
                        />
                        <input
                          ref={montoPersonalizadoRef}
                          type="number"
                          min={0}
                          placeholder="Monto"
                          style={{
                            flex: "1 1 120px",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--white)",
                            padding: "10px 12px",
                            borderRadius: 8,
                            fontSize: 14,
                          }}
                        />
                        <button type="button" className="btn ghost" style={{ marginTop: 0 }} onClick={agregarPersonalizado}>
                          Agregar
                        </button>
                      </div>
                      {itemsPersonalizados.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          {itemsPersonalizados.map((i) => (
                            <div
                              key={i.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "6px 0",
                              }}
                            >
                              <span>
                                {i.nombre} — {fmtCLP(i.precio)}
                              </span>
                              <button type="button" className="icon-btn" onClick={() => quitarPersonalizado(i.id)}>
                                Quitar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {lineas.length > 0 && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    marginBottom: 18,
                    fontSize: 14,
                  }}
                >
                  {lineas.map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{l.nombre}</span>
                      <span>{fmtCLP(l.precio)}</span>
                    </div>
                  ))}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: "1px solid var(--border)",
                      fontWeight: 700,
                    }}
                  >
                    <span>Total</span>
                    <span style={{ color: "var(--gold)" }}>{fmtCLP(totalListado)}</span>
                  </div>
                </div>
              )}

              <div key={patenteBuscada}>
                <div className="field">
                  <label>Nombre</label>
                  <input ref={nombreRef} defaultValue={clienteExistente?.nombre || ""} placeholder="Nombre completo" />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input ref={telefonoRef} defaultValue={clienteExistente?.telefono || "+569"} />
                </div>
                <div className="field">
                  <label>Correo electrónico</label>
                  <input
                    ref={emailRef}
                    type="email"
                    defaultValue={clienteExistente?.email || ""}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div className="field">
                  <label>Vehículo (Marca y Modelo)</label>
                  <input ref={vehiculoRef} defaultValue={clienteExistente?.vehiculo || ""} placeholder="Ej: Toyota Yaris" />
                </div>
                <div className="field">
                  <label>Tipo de documento</label>
                  <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as "Boleta" | "Factura")}>
                    <option value="Boleta">Boleta</option>
                    <option value="Factura">Factura</option>
                  </select>
                </div>
                {tipoDoc === "Factura" && (
                  <div>
                    <div className="field">
                      <label>RUT</label>
                      <input
                        ref={rutRef}
                        defaultValue={clienteExistente?.rut || ""}
                        placeholder="12.345.678-9"
                        onBlur={onRutBlur}
                      />
                    </div>
                    <div className="field">
                      <label>Razón Social</label>
                      <input ref={razonSocialRef} defaultValue={clienteExistente?.razonSocial || ""} />
                    </div>
                    <div className="field">
                      <label>Dirección</label>
                      <input ref={direccionRef} defaultValue={clienteExistente?.direccion || ""} />
                    </div>
                    <div className="field">
                      <label>Giro</label>
                      <input ref={giroRef} defaultValue={clienteExistente?.giro || ""} />
                    </div>
                  </div>
                )}
                <div className="field">
                  <label>Hora de entrega</label>
                  <input ref={horaEntregaRef} type="time" />
                </div>
                <div className="field">
                  <label>Notas / Observaciones</label>
                  <textarea ref={notasRef} rows={3} placeholder="Observaciones de quien recibe el vehículo..." />
                </div>
              </div>

              <div className="field">
                <label>Estado de pago</label>
                <div className="estado-pago-grid">
                  <button
                    type="button"
                    className={`estado-pago-btn ok${estadoPago === "pagado" ? " selected" : ""}`}
                    onClick={() => {
                      setEstadoPago("pagado");
                      setErr("");
                    }}
                  >
                    Pagado 100%
                  </button>
                  <button
                    type="button"
                    className={`estado-pago-btn warn${estadoPago === "abono50" ? " selected" : ""}`}
                    onClick={() => {
                      setEstadoPago("abono50");
                      setErr("");
                    }}
                  >
                    Abono 50%
                  </button>
                  <button
                    type="button"
                    className={`estado-pago-btn bad${estadoPago === "pendiente" ? " selected" : ""}`}
                    onClick={() => {
                      setEstadoPago("pendiente");
                      setMetodoPago(null);
                      setErr("");
                    }}
                  >
                    Por pagar
                  </button>
                </div>
                {estadoPago && estadoPago !== "pendiente" && (
                  <div
                    style={{
                      marginTop: -4,
                      marginBottom: 8,
                      fontSize: 13,
                      color: "var(--gray)",
                    }}
                  >
                    Se cobra ahora: <strong style={{ color: "var(--gold)" }}>{fmtCLP(montoCobradoTotal)}</strong>
                    {estadoPago === "abono50" ? ` de ${fmtCLP(totalListado)}` : ""}
                  </div>
                )}
              </div>

              {estadoPago && estadoPago !== "pendiente" && (
                <div className="field">
                  <label>Forma de pago</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className={metodoPago === "efectivo" ? "btn" : "btn ghost"}
                      style={{ flex: 1, marginTop: 0 }}
                      onClick={() => {
                        setMetodoPago("efectivo");
                        setErr("");
                      }}
                    >
                      Efectivo
                    </button>
                    <button
                      type="button"
                      className={metodoPago === "tarjeta" ? "btn" : "btn ghost"}
                      style={{ flex: 1, marginTop: 0 }}
                      onClick={() => {
                        setMetodoPago("tarjeta");
                        setErr("");
                      }}
                    >
                      Tarjeta
                    </button>
                    <button
                      type="button"
                      className={metodoPago === "transferencia" ? "btn" : "btn ghost"}
                      style={{ flex: 1, marginTop: 0 }}
                      onClick={() => {
                        setMetodoPago("transferencia");
                        setErr("");
                      }}
                    >
                      Transferencia bancaria
                    </button>
                  </div>
                  {metodoPago === "transferencia" && <DatosTransferencia />}
                </div>
              )}

              <div className="err">{err}</div>
              <button className="btn" onClick={registrar}>
                Registrar servicio
              </button>
            </>
          )}
        </div>

        <div className="today-log">
          <h3>Servicios registrados hoy</h3>
          {hoyList.length === 0 ? (
            <div className="empty">Aún no hay servicios registrados hoy</div>
          ) : (
            hoyList.map((v) => (
              <div className="log-row" key={v.id} title={v.notas || undefined}>
                <span className="plate">{v.patente}</span>
                <span>
                  {v.nombre} — {v.tipo}
                </span>
                {v.estadoPago && (
                  <span
                    className={`status-pill ${v.estadoPago === "pagado" ? "ok" : v.estadoPago === "abono50" ? "warn" : "bad"}`}
                  >
                    {v.estadoPago === "pagado" ? "Pagado" : v.estadoPago === "abono50" ? "Abono 50%" : "Por pagar"}
                  </span>
                )}
                {v.horaEntrega && <span>Entrega {v.horaEntrega}</span>}
                <span>{fmtCLP(v.precio)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
