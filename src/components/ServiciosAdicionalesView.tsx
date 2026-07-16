"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import Topbar from "@/components/Topbar";
import DatosTransferencia from "@/components/DatosTransferencia";
import PriceInput from "@/components/PriceInput";
import { ESTADOS_CITA, esEstadoFinal, esRetrocesoInvalido, validarDisponibilidad } from "@/lib/agenda";
import {
  CATEGORIA_DETAILING,
  PATENTE_FORMATO_MSG,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  findClient,
  fmtCLP,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  normPlate,
  precioServicio,
  sumarDias,
  todayYMD,
  uid,
  ymd,
} from "@/lib/helpers";
import type { Cita, Cliente, Empresa, Venta } from "@/types";

const ERROR_GUARDADO = "No se pudo guardar el servicio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";
const CATEGORIA_ADICIONALES = "Servicios Adicionales";
const AJUSTES = [5000, 10000] as const;
// Duración a usar en la agenda cuando lo vendido no incluye ningún servicio
// del catálogo con duración propia (p. ej. solo un ítem personalizado).
const DURACION_DEFAULT_MINUTOS = 15;

// "abono50" quedó como nombre histórico del estado, pero ya no implica
// exactamente 50%: es cualquier abono parcial, siempre que cumpla el mínimo
// del 50% del total (ver montoAbonoMinimo). Se conserva el nombre porque así
// se guarda en ventas.estadoPago y no tiene equivalente cruzado con Cierre.
type EstadoPago = "pagado" | "abono50";
type Linea = { id: string; nombre: string; precio: number };
type ItemPersonalizado = { id: string; nombre: string; precio: number };

export default function ServiciosAdicionalesView() {
  const { data, ui, commit, patchUi, logout } = useApp();
  const patenteRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const notasRef = useRef<HTMLTextAreaElement>(null);
  const detallePersonalizadoRef = useRef<HTMLInputElement>(null);
  const [montoPersonalizadoTexto, setMontoPersonalizadoTexto] = useState("");
  const [montoAbonoTexto, setMontoAbonoTexto] = useState("");

  const [patenteBuscada, setPatenteBuscada] = useState<string | null>(null);
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<string[]>([]);
  const [itemsPersonalizados, setItemsPersonalizados] = useState<ItemPersonalizado[]>([]);
  const [ajuste, setAjuste] = useState<0 | 5000 | 10000>(0);
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [estadoPago, setEstadoPago] = useState<EstadoPago | null>(null);
  const [metodoPago, setMetodoPago] = useState<"efectivo" | "tarjeta" | "transferencia" | null>(null);
  const [fechaCita, setFechaCita] = useState(todayYMD());
  const [horaCita, setHoraCita] = useState("");
  const [fechaEntregaCampo, setFechaEntregaCampo] = useState("");
  const [horaEntregaCampo, setHoraEntregaCampo] = useState("");
  const [fechaLog, setFechaLog] = useState(todayYMD());
  const [err, setErr] = useState("");

  const clienteExistente = patenteBuscada ? findClient(data.clientes, patenteBuscada) || null : null;
  const catalogo = data.servicios.filter((s) => s.activo);
  const categorias = Array.from(new Set(catalogo.map((s) => s.categoria || "")));

  const hayDetailingSeleccionado = serviciosSeleccionados.some(
    (id) => catalogo.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );

  const primerDetailingIdx = serviciosSeleccionados.findIndex(
    (id) => catalogo.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING
  );
  const lineasCatalogo: Linea[] = serviciosSeleccionados.map((id, idx) => {
    const s = catalogo.find((x) => x.id === id)!;
    const precio = precioServicio(data.precios, s.id) + (idx === primerDetailingIdx && ajuste > 0 ? ajuste : 0);
    return { id: s.id, nombre: s.nombre, precio };
  });
  const lineasPersonalizadas: Linea[] = itemsPersonalizados.map((i) => ({ id: i.id, nombre: i.nombre, precio: i.precio }));
  const lineas: Linea[] = [...lineasCatalogo, ...lineasPersonalizadas];
  const totalListado = lineas.reduce((s, l) => s + l.precio, 0);
  // Mínimo exigido para registrar el servicio con abono: 50% del total,
  // redondeado hacia arriba para no permitir que un total impar quede por
  // debajo de la mitad real (ej. total 1999 → mínimo 1000, no 999).
  const montoAbonoMinimo = Math.ceil(totalListado / 2);
  const montoAbono = Number(montoAbonoTexto || "0");
  const montoCobradoTotal = estadoPago === "pagado" ? totalListado : estadoPago === "abono50" ? montoAbono : 0;

  // La Agenda queda alimentada por este mismo registro: la duración de la
  // cita es la suma de las duraciones del catálogo elegido (equivalente a
  // "procedimientos" en ConsultaPro), con un mínimo por si solo se
  // vendieron ítems personalizados (sin duración propia).
  const duracionCatalogoTotal = serviciosSeleccionados.reduce(
    (sum, id) => sum + (catalogo.find((s) => s.id === id)?.duracionMinutos || 0),
    0
  );
  const duracionCita = lineas.length > 0 ? duracionCatalogoTotal || DURACION_DEFAULT_MINUTOS : 0;
  const horarioConfigurado = data.horariosAgenda.length > 0;
  const citasDelDiaCita = data.citas.filter((c) => c.fechaHora.slice(0, 10) === fechaCita);

  // Dentro de "Lavado Completo Detailing" solo se puede tener 1 tamaño
  // seleccionado a la vez (radio): elegir otro reemplaza al anterior. Las
  // demás categorías (Adicionales) siguen siendo multi-selección normal.
  const toggleServicio = (id: string, categoria: string) => {
    setServiciosSeleccionados((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (categoria === CATEGORIA_DETAILING) {
        return [...prev.filter((x) => catalogo.find((s) => s.id === x)?.categoria !== CATEGORIA_DETAILING), id];
      }
      return [...prev, id];
    });
    setErr("");
  };

  const agregarPersonalizado = () => {
    const nombre = detallePersonalizadoRef.current?.value.trim() || "";
    const monto = Number(montoPersonalizadoTexto || "0");
    if (!nombre || !monto || monto <= 0) {
      setErr("Ingresa un detalle y un monto válido para el servicio personalizado");
      return;
    }
    setErr("");
    setItemsPersonalizados((prev) => [...prev, { id: "custom-" + Date.now(), nombre, precio: monto }]);
    if (detallePersonalizadoRef.current) detallePersonalizadoRef.current.value = "";
    setMontoPersonalizadoTexto("");
  };

  const quitarPersonalizado = (id: string) => {
    setItemsPersonalizados((prev) => prev.filter((i) => i.id !== id));
  };

  // Al retirar el vehículo (último paso del circuito) se cobra cualquier
  // saldo pendiente de las ventas ligadas a esa cita antes de aplicar el
  // cambio de status: si ya estaba todo pagado, se aplica directo.
  const cambiarStatusCita = (citaId: string, estado: Cita["estado"]) => {
    if (estado === "retirado") {
      const ventasCita = data.ventas.filter((v) => v.citaId === citaId);
      const totalPrecio = ventasCita.reduce((s, v) => s + v.precio, 0);
      const totalCobrado = ventasCita.reduce((s, v) => s + (v.montoCobrado ?? 0), 0);
      const saldo = totalPrecio - totalCobrado;
      if (saldo > 0) {
        patchUi({
          modal: {
            type: "pago",
            monto: saldo,
            descripcion: `Saldo pendiente — ${ventasCita[0]?.patente || ""}`,
            onConfirm: (pago) => {
              commit({
                ventas: data.ventas.map((v) =>
                  v.citaId === citaId ? { ...v, estadoPago: "pagado", montoCobrado: v.precio, metodoPago: pago.metodo } : v
                ),
                citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)),
              });
            },
          },
        });
        return;
      }
    }
    commit({ citas: data.citas.map((c) => (c.id === citaId ? { ...c, estado } : c)) });
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
    setMontoAbonoTexto("");
    setMetodoPago(null);
    setFechaCita(todayYMD());
    setHoraCita("");
    setFechaEntregaCampo("");
    setHoraEntregaCampo("");
  };

  const cambiarPatente = () => {
    setPatenteBuscada(null);
    setServiciosSeleccionados([]);
    setItemsPersonalizados([]);
    setAjuste(0);
    setEstadoPago(null);
    setMontoAbonoTexto("");
    setMetodoPago(null);
    setFechaCita(todayYMD());
    setHoraCita("");
    setFechaEntregaCampo("");
    setHoraEntregaCampo("");
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
    const telefonoValor = telefonoRef.current?.value.trim() || "";
    if (!telefonoValor) {
      setErr("El teléfono es obligatorio");
      return;
    }
    if (!isValidTelefono(telefonoValor)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    const emailValor = emailRef.current?.value.trim() || "";
    if (!emailValor) {
      setErr("El correo electrónico es obligatorio");
      return;
    }
    if (!isValidEmail(emailValor)) {
      setErr("El correo electrónico no es válido");
      return;
    }
    const vehiculoValor = vehiculoRef.current?.value.trim() || "";
    if (!vehiculoValor) {
      setErr("El vehículo es obligatorio");
      return;
    }
    if (!estadoPago) {
      setErr("Indica si el servicio está pagado 100% o con abono");
      return;
    }
    if (estadoPago === "abono50") {
      if (!montoAbono || montoAbono < montoAbonoMinimo) {
        setErr(`El abono debe ser como mínimo ${fmtCLP(montoAbonoMinimo)} (50% del total)`);
        return;
      }
      if (montoAbono > totalListado) {
        setErr("El abono no puede superar el total del servicio");
        return;
      }
    }
    if (!metodoPago) {
      setErr("Selecciona efectivo, tarjeta o transferencia");
      return;
    }
    if (horarioConfigurado && !horaCita) {
      setErr("Selecciona una hora de inicio para el servicio");
      return;
    }
    if (horaCita && horarioConfigurado) {
      const motivo = validarDisponibilidad(
        fechaCita,
        horaCita,
        duracionCita,
        data.horariosAgenda,
        data.bloqueosAgenda,
        citasDelDiaCita
      );
      if (motivo) {
        setErr(motivo);
        return;
      }
    }

    const telefono = formatTelefono(telefonoValor);
    const email = emailValor;
    const vehiculo = vehiculoValor;
    const razonSocial = tipoDoc === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDoc === "Factura" ? rutRef.current?.value.trim() || "" : "";
    if (tipoDoc === "Factura" && !isValidRut(rutRaw)) {
      setErr(RUT_FORMATO_MSG);
      return;
    }
    const rut = tipoDoc === "Factura" ? formatRut(rutRaw) : "";
    const direccion = tipoDoc === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDoc === "Factura" ? giroRef.current?.value.trim() || "" : "";
    const horaEntrega = horaEntregaCampo || "";
    const fechaEntrega = horaEntregaCampo ? fechaEntregaCampo || fechaCita : "";
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

    // Un lavado completo/detailing implica que el vehículo va a pasar por el
    // túnel, pero el registro en Historial de Ingresos (glosa "Limpieza
    // Completa") NO se crea acá: recién se genera cuando el operador registra
    // la patente en el módulo Operador al llegar el vehículo (ver
    // registrarIngresoDetailing en lib/actions.ts) — este alta solo deja la
    // Venta y la Cita agendadas.

    // La Agenda queda fusionada con la venta: el registro deja reservada su
    // hora en `citas`, con los servicios del catálogo elegidos ligados vía
    // cita_servicios (ver upsertCitas en dataAccess.ts) — equivalente a
    // cita_procedimientos en ConsultaPro, no un nombre concatenado en texto.
    // citaId se comparte con las ventas para poder mostrar/editar el Status
    // (circuito interno del vehículo) desde el log de Servicios registrados.
    // Se crea siempre, aunque no se haya elegido "Fecha y hora de Inicio"
    // (sin horario de atención configurado ese campo es opcional y casi
    // nunca se llena): todo vehículo que pasa por acá debe quedar trackeable
    // en el circuito, se haya agendado con hora o no.
    const citaId = uid();

    // Un vehículo = un registro: aunque se hayan elegido varios servicios,
    // se guarda UNA sola Venta con el precio total y el detalle de
    // servicios listado en `tipo` (cantidadItems guarda cuántos se
    // combinaron, para no perder esa métrica en Cierre de Caja).
    const ventaNueva: Venta = {
      id: "v" + Date.now(),
      clienteId,
      patente,
      nombre,
      plan: "",
      precio: totalListado,
      tipo: lineas.map((l) => l.nombre).join(", "),
      fecha: ahora,
      creadoPor: ui.perfilActual?.nombre || "",
      metodoPago: metodoPago || undefined,
      horaEntrega: horaEntrega || undefined,
      fechaEntrega: fechaEntrega || undefined,
      citaId,
      cantidadItems: lineas.length,
      notas: notas || undefined,
      estadoPago,
      montoCobrado: montoCobradoTotal,
      esServicioAdicional: true,
    };

    const citaNueva: Cita = {
      id: citaId,
      clienteId,
      servicioIds: serviciosSeleccionados,
      patente,
      nombre,
      telefono: telefono || undefined,
      fechaHora: horaCita ? `${fechaCita}T${horaCita}:00` : ahora,
      duracionMinutos: duracionCita,
      estado: "agendado",
      notas: notas || undefined,
      origen: "interno",
      creadoPor: ui.perfilActual?.nombre || "",
      creadoEn: ahora,
    };

    const ok = await commit({
      clientes,
      ventas: [ventaNueva, ...data.ventas],
      ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
      citas: [citaNueva, ...data.citas],
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
    setMontoAbonoTexto("");
    setMetodoPago(null);
    setFechaCita(todayYMD());
    setHoraCita("");
    setFechaEntregaCampo("");
    setHoraEntregaCampo("");
  };

  const logList = data.ventas.filter((v) => v.esServicioAdicional && ymd(new Date(v.fecha)) === fechaLog);

  // Solo Gerencia (módulo "permisos", mismo criterio que PerfilesTab) puede
  // borrar un servicio ya registrado: es destructivo y además elimina el
  // pago Transbank asociado, si tuvo uno (ver deleteVentas en dataAccess.ts).
  const puedeEliminarServicios = ui.perfilActual?.modulos.includes("permisos") || false;

  const eliminarServicio = (v: Venta) => {
    patchUi({
      modal: {
        type: "confirm",
        mensaje: `¿Eliminar el servicio de ${v.patente} (${v.nombre})? Esta acción no se puede deshacer y también elimina el pago asociado, si existe.`,
        onConfirm: () => {
          commit({ ventas: data.ventas.filter((x) => x.id !== v.id) });
        },
      },
    });
  };

  return (
    <>
      <Topbar
        mode={`Servicios Adicionales · ${ui.perfilActual?.nombre || ""}`}
        onLogout={() => logout({ loginMode: null })}
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
                    {catalogo.filter((s) => s.categoria === cat).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`service-btn${serviciosSeleccionados.includes(s.id) ? " selected" : ""}`}
                        onClick={() => toggleServicio(s.id, s.categoria || "")}
                      >
                        <div className="nombre">{s.nombre}</div>
                        <div className="precio">{fmtCLP(precioServicio(data.precios, s.id))}</div>
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
                        <PriceInput
                          value={montoPersonalizadoTexto}
                          onChange={setMontoPersonalizadoTexto}
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
                  <label>Teléfono *</label>
                  <input ref={telefonoRef} required defaultValue={clienteExistente?.telefono || "+569"} />
                </div>
                <div className="field">
                  <label>Correo electrónico *</label>
                  <input
                    ref={emailRef}
                    type="email"
                    required
                    defaultValue={clienteExistente?.email || ""}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
                <div className="field">
                  <label>Vehículo (Marca y Modelo) *</label>
                  <input
                    ref={vehiculoRef}
                    required
                    defaultValue={clienteExistente?.vehiculo || ""}
                    placeholder="Ej: Toyota Yaris"
                  />
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
                {lineas.length > 0 && (
                  <div className="field">
                    <label>Fecha y hora de Inicio{horarioConfigurado ? " *" : ""}</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        type="date"
                        min={todayYMD()}
                        value={fechaCita}
                        onChange={(e) => setFechaCita(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input type="time" value={horaCita} onChange={(e) => setHoraCita(e.target.value)} style={{ flex: 1 }} />
                    </div>
                    <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                      {horarioConfigurado
                        ? `Duración estimada: ${duracionCita} min. Se agenda en la Agenda del negocio.`
                        : "Configura el horario de atención en Administrador de ingresos → Agenda para validar disponibilidad automáticamente."}
                    </div>
                  </div>
                )}
                {lineas.length > 0 && (
                  <div className="field">
                    <label>Fecha y hora de Entrega</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        type="date"
                        min={fechaCita}
                        value={fechaEntregaCampo || fechaCita}
                        onChange={(e) => setFechaEntregaCampo(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <input
                        type="time"
                        value={horaEntregaCampo}
                        onChange={(e) => setHoraEntregaCampo(e.target.value)}
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                      Cuándo estará listo el vehículo para el cliente. No reserva hora en la Agenda.
                    </div>
                  </div>
                )}
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
                      if (!montoAbonoTexto) setMontoAbonoTexto(String(montoAbonoMinimo));
                      setErr("");
                    }}
                  >
                    Abono (mín. 50%)
                  </button>
                </div>
                {estadoPago === "abono50" && (
                  <div style={{ marginBottom: 8 }}>
                    <PriceInput
                      value={montoAbonoTexto}
                      onChange={setMontoAbonoTexto}
                      placeholder="Monto abonado"
                      style={{
                        width: "100%",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        color: "var(--white)",
                        padding: "10px 12px",
                        borderRadius: 8,
                        fontSize: 14,
                      }}
                    />
                    <div className="hint" style={{ textAlign: "left", marginTop: 6 }}>
                      Mínimo exigido: {fmtCLP(montoAbonoMinimo)} (50% de {fmtCLP(totalListado)})
                    </div>
                  </div>
                )}
                {estadoPago && (
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

              {estadoPago && (
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
          <h3>Servicios registrados{fechaLog === todayYMD() ? " hoy" : ` el ${fechaLog}`}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(sumarDias(fechaLog, -1))}>
              ← Día anterior
            </button>
            <input type="date" value={fechaLog} onChange={(e) => setFechaLog(e.target.value)} style={{ flex: "0 0 auto" }} />
            <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(sumarDias(fechaLog, 1))}>
              Día siguiente →
            </button>
            {fechaLog !== todayYMD() && (
              <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => setFechaLog(todayYMD())}>
                Volver a hoy
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Patente</th>
                  <th>Servicio</th>
                  <th>Pago</th>
                  <th>Entrega</th>
                  <th>Status</th>
                  <th>Precio</th>
                  {puedeEliminarServicios && <th></th>}
                </tr>
              </thead>
              <tbody>
                {logList.length === 0 ? (
                  <tr>
                    <td colSpan={puedeEliminarServicios ? 7 : 6}>
                      <div className="empty">Sin servicios registrados ese día</div>
                    </td>
                  </tr>
                ) : (
                  logList.map((v) => (
                    <tr key={v.id} title={v.notas || undefined}>
                      <td>
                        <span className="plate-tag">{v.patente}</span>
                      </td>
                      <td>
                        {v.nombre} — {v.tipo}
                      </td>
                      <td>
                        {v.estadoPago && (
                          <span
                            className={`status-pill ${v.estadoPago === "pagado" ? "ok" : v.estadoPago === "abono50" ? "warn" : "bad"}`}
                          >
                            {v.estadoPago === "pagado"
                              ? "Pagado"
                              : v.estadoPago === "abono50"
                              ? `Abono ${fmtCLP(v.montoCobrado ?? 0)}`
                              : "Por pagar"}
                          </span>
                        )}
                      </td>
                      <td>
                        {v.horaEntrega
                          ? `${v.fechaEntrega && v.fechaEntrega !== todayYMD() ? `${v.fechaEntrega} ` : ""}${v.horaEntrega}`
                          : "—"}
                      </td>
                      <td>
                        {v.citaId ? (
                          <StatusCell
                            estadoActual={data.citas.find((c) => c.id === v.citaId)?.estado || "agendado"}
                            onCambiar={(estado) => cambiarStatusCita(v.citaId!, estado)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{fmtCLP(v.precio)}</td>
                      {puedeEliminarServicios && (
                        <td className="row-actions">
                          <button className="icon-btn" onClick={() => eliminarServicio(v)}>
                            Eliminar
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// Selector + botón "Cambiar" en vez de aplicar al vuelo con onChange: así el
// cambio de status (incluido el cobro de saldo al pasar a "Retirado") solo
// ocurre cuando el usuario confirma, no con un clic accidental en el select.
function StatusCell({
  estadoActual,
  onCambiar,
}: {
  estadoActual: Cita["estado"];
  onCambiar: (estado: Cita["estado"]) => void;
}) {
  const [seleccion, setSeleccion] = useState<Cita["estado"]>(estadoActual);
  const bloqueado = esEstadoFinal(estadoActual);

  useEffect(() => {
    setSeleccion(estadoActual);
  }, [estadoActual]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value as Cita["estado"])}
        disabled={bloqueado}
        style={{ fontSize: 13 }}
      >
        {ESTADOS_CITA.map((e) => (
          <option key={e.valor} value={e.valor} disabled={esRetrocesoInvalido(estadoActual, e.valor)}>
            {e.label}
          </option>
        ))}
      </select>
      {!bloqueado && (
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "4px 10px", fontSize: 12 }}
          disabled={seleccion === estadoActual}
          onClick={() => onCambiar(seleccion)}
        >
          Cambiar
        </button>
      )}
    </div>
  );
}
