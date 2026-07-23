"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { registrarIngreso, registrarIngresoDetailing, renovarPlan } from "@/lib/actions";
import { puedeIngresarTunelDetailing } from "@/lib/agenda";
import {
  CATEGORIA_DETAILING,
  PLANES,
  TELEFONO_FORMATO_MSG,
  diasVencido,
  esExentoBloqueoReingreso,
  esExentoValidacionRegistroOperador,
  esNombreVacio,
  estadoReingresoPlan,
  fmtCLP,
  fmtHorasVentanaUpgradePlan,
  fmtTelefono,
  formatTelefono,
  isValidEmail,
  isValidTelefono,
  mensajeBloqueoReingreso,
  planStatus,
  plateEstadoCls,
  precioLavadoUnico,
  precioNormal,
  precioReactivacionVencido,
  precioRenovacionLocal,
  precioUpgradePlan,
  vencimientoAnclado,
  vencimientoPorDefectoISO,
  ventaUpgradeElegible,
  visitasUltimoPeriodoVencido,
  yaIngresoHoy,
} from "@/lib/helpers";
import type { Cliente, PagoInfo, Venta } from "@/types";
import { DetailList, DetailRow } from "@/components/DetailList";

const ERROR_GUARDADO = "No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";

export default function OperadorFoundResult({ cliente, clearPlate }: { cliente: Cliente; clearPlate: () => void }) {
  const { data, ui, commit, patchUi } = useApp();
  const nombreRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [guardarErr, setGuardarErr] = useState("");

  const c = cliente;
  const exentoValidacion = esExentoValidacionRegistroOperador(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const registroIncompleto =
    esNombreVacio(c.nombre) || (!exentoValidacion && (!c.telefono || !isValidTelefono(c.telefono) || !c.email));
  const st = planStatus(c);
  const pNormal = precioNormal(data.precios, c.plan || "");
  const pPromo = precioRenovacionLocal(data.config, data.precios, c.plan || "", c.visitas || 0);
  const showOffer = st.cls === "warn" && pNormal > 0 && c.origen !== "WEB";
  const ahorro = pNormal - pPromo;
  const planVigente = st.cls !== "bad";
  // "Administración" y "Gerencia" pueden forzar el ingreso aunque el
  // reingreso esté bloqueado (cliente pasó hace menos de 24:30 horas): se
  // trata como "garantia" para que quede la misma confirmación y quede
  // registrado sin cobrar de nuevo (ver esExentoBloqueoReingreso).
  const exentoBloqueoReingreso = esExentoBloqueoReingreso(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const estadoIngresoBruto = estadoReingresoPlan(data.ingresos, c.id);
  const estadoIngreso = estadoIngresoBruto === "bloqueado" && exentoBloqueoReingreso ? "garantia" : estadoIngresoBruto;

  const esWebVencido = c.origen === "WEB" && st.cls === "bad";
  const ventasCliente = data.ventas
    .filter((v) => v.clienteId === c.id)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const precioOfertaWeb = ventasCliente.length ? ventasCliente[0].precio : pNormal;

  // Promoción: reactivación preferencial para un cliente (Local o Web) con
  // el plan vencido hace poco, escalonada por hace cuánto venció y cuántas
  // veces pasó durante su último período de plan pagado (ver
  // tramosReactivacionVencido/precioReactivacionVencido). undefined =
  // ningún tramo calza, no corresponde ofrecerla — en ese caso un cliente
  // Web sigue viendo su oferta genérica (esWebVencido, más abajo).
  const diasVenc = diasVencido(c);
  const visitasUltPeriodo = visitasUltimoPeriodoVencido(data.ingresos, c);
  const precioReactivacion =
    diasVenc !== null ? precioReactivacionVencido(data.config, c.plan || "", diasVenc, visitasUltPeriodo) : undefined;
  const showReactivacion = precioReactivacion !== undefined;

  // Promoción: si al cliente se le acaba de cobrar un lavado único (dentro de
  // la ventana configurada, ver ventaUpgradeElegible) y sigue sin plan
  // vigente, se le puede ofrecer quedar con el Plan Ilimitado Mensual pagando
  // solo el adicional — ver upgradeAPlan más abajo.
  const horasVentanaUpgrade = data.config.horasVentanaUpgradePlan;
  const ventaUpgrade = !planVigente
    ? ventaUpgradeElegible(data.ventas, c.id, horasVentanaUpgrade)
    : undefined;
  const precioUpgrade = precioUpgradePlan(data.precios);

  // Lavado Completo Detailing vendido en Servicios Adicionales (Venta + Cita
  // ya creadas ahí), a la espera de que el vehículo entre físicamente al
  // túnel: se detecta por la Cita del día que incluya un servicio de esa
  // categoría y ya esté físicamente en el local (Recibido, En Limpieza o
  // Listo para Entrega) — si sigue "Agendado" todavía no ha llegado, y no se
  // le puede dar ingreso al túnel (ver puedeIngresarTunelDetailing en lib/agenda.ts).
  const citaDetailingPendiente = data.citas.find((cita) => {
    if (cita.clienteId !== c.id) return false;
    if (!puedeIngresarTunelDetailing(cita.estado)) return false;
    if (new Date(cita.fechaHora).toDateString() !== new Date().toDateString()) return false;
    // Si ya existe un Ingreso ligado a esta cita, el paso por el túnel ya
    // quedó registrado (ver registrarIngresoDetailing en @/lib/actions): no
    // volver a ofrecer el botón para no invitar a un doble check-in del
    // mismo vehículo.
    if (data.ingresos.some((i) => i.citaId === cita.id)) return false;
    return cita.servicioIds.some((id) => data.servicios.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING);
  });

  const updateResult = (updated: Cliente) => patchUi({ operResult: { found: true, cliente: updated } });

  // Teléfono/Correo/Vehículo se guardan cada uno con su propio botón, pero
  // el Server Action rechaza el upsert completo si el nombre queda vacío
  // (columna NOT NULL, ver comentario en upsertClientes en @/lib/db) — sin
  // esto, guardar cualquiera de esos campos mientras el nombre sigue sin
  // completar fallaba en silencio con un mensaje de "sin conexión" engañoso.
  // Acá se toma el nombre ya guardado o, si el operador ya lo tipeó pero no
  // ha tocado su botón "Guardar", el valor pendiente en el input.
  const nombreParaGuardar = (): string | null => {
    if (!esNombreVacio(c.nombre)) return c.nombre;
    const val = nombreRef.current?.value.trim();
    return val ? val.toUpperCase() : null;
  };

  const pedirPago = (monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
    patchUi({ modal: { type: "pago", monto, descripcion, onConfirm } });
  };

  const hacerRegistro = async (esGarantia: boolean) => {
    const patch = registrarIngreso(data, c, ui.perfilActual?.nombre, esGarantia);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrarDetailing = async () => {
    if (!citaDetailingPendiente) return;
    const patch = registrarIngresoDetailing(data, c, citaDetailingPendiente, ui.perfilActual?.nombre);
    const ok = await commit(patch);
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    clearPlate();
    patchUi({ operResult: null });
  };

  const registrar = () => {
    if (estadoIngreso === "garantia") {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Vehiculo Ingreso hace menos de 24 horas. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true),
        },
      });
      return;
    }
    hacerRegistro(false);
  };

  // Compra un lavado único y da ingreso sin condicionar a plan/garantía —
  // usado tanto desde "Lavado Full Túnel" (plan no vigente) como desde el
  // botón de "comprar de todas formas" cuando el reingreso está bloqueado.
  const cobrarLavadoUnico = () => {
    pedirPago(precioLavadoUnico(data.precios), `Lavado único para ${c.nombre} (${c.patente})`, async (pago) => {
      const patch = registrarIngreso(data, c, ui.perfilActual?.nombre);
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: c.id,
        patente: c.patente,
        nombre: c.nombre,
        plan: c.plan || "",
        precio: precioLavadoUnico(data.precios),
        tipo: "Lavado único",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({ ...patch, ventas: [venta, ...data.ventas] });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    });
  };

  const registrarPagado = () => {
    if (yaIngresoHoy(data.ingresos, c.id)) {
      patchUi({
        modal: {
          type: "confirm",
          mensaje: `Este cliente ya pasó una vez hoy. ¿Desea que pase nuevamente por garantía?`,
          confirmLabel: "Sí, ingresar por garantía",
          danger: false,
          onConfirm: () => hacerRegistro(true),
        },
      });
      return;
    }
    cobrarLavadoUnico();
  };

  const guardarNombre = async () => {
    const val = nombreRef.current?.value.trim();
    if (!val) return;
    const updated = { ...c, nombre: val.toUpperCase() };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const guardarVehiculo = async () => {
    const val = vehiculoRef.current?.value.trim();
    if (!val) return;
    const nombre = nombreParaGuardar();
    if (!nombre) {
      setGuardarErr("Ingresa el nombre del cliente antes de guardar.");
      return;
    }
    const updated = { ...c, nombre, vehiculo: val };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const onTelefonoBlur = () => {
    const raw = telefonoRef.current?.value.trim() || "";
    if (!raw || !telefonoRef.current) return;
    telefonoRef.current.value = fmtTelefono(raw);
  };

  const guardarTelefono = async () => {
    const raw = telefonoRef.current?.value.trim();
    if (!raw) return;
    const telefono = formatTelefono(raw);
    if (!isValidTelefono(telefono)) {
      setGuardarErr(TELEFONO_FORMATO_MSG);
      return;
    }
    const nombre = nombreParaGuardar();
    if (!nombre) {
      setGuardarErr("Ingresa el nombre del cliente antes de guardar.");
      return;
    }
    const updated = { ...c, nombre, telefono };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const guardarEmail = async () => {
    const val = emailRef.current?.value.trim();
    if (!val) return;
    if (!isValidEmail(val)) {
      setGuardarErr("Ingresa un email válido");
      return;
    }
    const nombre = nombreParaGuardar();
    if (!nombre) {
      setGuardarErr("Ingresa el nombre del cliente antes de guardar.");
      return;
    }
    const updated = { ...c, nombre, email: val };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const renovar = () => {
    pedirPago(pPromo, `Renovación temprana del plan de ${c.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, c, ui.perfilActual?.nombre, pPromo, pago);
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === c.id);
      if (updated) updateResult(updated);
    });
  };

  const reactivar = () => {
    if (precioReactivacion === undefined) return;
    pedirPago(precioReactivacion, `Reactivación promocional del plan de ${c.nombre} a precio preferencial`, async (pago) => {
      const patch = renovarPlan(data, c, ui.perfilActual?.nombre, precioReactivacion, pago, "Reactivación promocional");
      const ok = await commit(patch);
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      setGuardarErr("");
      const updated = patch.clientes?.find((x) => x.id === c.id);
      if (updated) updateResult(updated);
    });
  };

  const renovarWeb = () => {
    pedirPago(precioOfertaWeb, `Renovación de plan Web para ${c.nombre} (${c.patente})`, async (pago) => {
      const nuevoVencimiento = vencimientoAnclado(c.fechaContratacion || c.vencimiento);
      const updated: Cliente = { ...c, vencimiento: nuevoVencimiento, ultimaRenovacion: new Date().toISOString() };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: c.id,
        patente: c.patente,
        nombre: c.nombre,
        plan: c.plan || PLANES[0],
        precio: precioOfertaWeb,
        tipo: "Renovación Web (manual)",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
        ventas: [venta, ...data.ventas],
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  const contratarPlan = () => {
    const plan = c.plan || PLANES[0];
    const precio = precioNormal(data.precios, plan);
    pedirPago(precio, `Contratación de plan (${plan}) para ${c.nombre}`, async (pago) => {
      const updated = { ...c, vencimiento: vencimientoPorDefectoISO(), plan };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: c.id,
        patente: c.patente,
        nombre: c.nombre,
        plan,
        precio,
        tipo: "Plan nuevo",
        fecha: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
        ventas: [venta, ...data.ventas],
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  // Convierte el lavado único recién pagado (ventaUpgrade) en la
  // contratación del Plan Ilimitado Mensual: se cobra solo el adicional y se
  // actualiza esa misma venta (en vez de crear una nueva) a "Plan nuevo", que
  // es el tipo que Cierre de Caja y Estadísticas ya reconocen como
  // "Contratación de plan". El vencimiento se ancla a la fecha del lavado
  // original (no al momento del pago del upgrade), para que el cliente no
  // pierda el tiempo transcurrido dentro de la ventana de la promoción (ver
  // ConfigGlobal.horasVentanaUpgradePlan).
  const upgradeAPlan = () => {
    if (!ventaUpgrade) return;
    const plan = PLANES[0];
    pedirPago(precioUpgrade, `Upgrade a ${plan} para ${c.nombre} (adicional al lavado ya pagado)`, async (pago) => {
      const updated = { ...c, plan, vencimiento: vencimientoPorDefectoISO(new Date(ventaUpgrade.fecha)) };
      const ventaActualizada: Venta = {
        ...ventaUpgrade,
        plan,
        precio: ventaUpgrade.precio + precioUpgrade,
        tipo: "Plan nuevo",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
      };
      const ok = await commit({
        clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)),
        ventas: data.ventas.map((v) => (v.id === ventaUpgrade.id ? ventaActualizada : v)),
      });
      if (!ok) {
        setGuardarErr(ERROR_GUARDADO);
        return;
      }
      setGuardarErr("");
      updateResult(updated);
    });
  };

  return (
    <>
      {registroIncompleto && (
        <div className="err" style={{ marginBottom: 10 }}>
          Registro de Cliente Incompleto, corrija la información faltante o inválida para poder dar Ingreso
        </div>
      )}
      {citaDetailingPendiente && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Detailing</span>
            <h4>Lavado Completo Detailing pendiente</h4>
          </div>
          <div className="msg">
            {c.nombre} tiene un Lavado Completo Detailing vendido en Servicios Adicionales. Regístralo para dejarlo
            entrar al túnel — esto no genera una venta nueva, la venta ya está hecha.
          </div>
          <button
            className="btn secondary"
            onClick={registrarDetailing}
            disabled={registroIncompleto}
            title={registroIncompleto ? "Completa el registro del cliente para poder dar ingreso" : undefined}
          >
            Registrar ingreso — Servicio de Detailing
          </button>
        </div>
      )}
      {showOffer && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Oferta</span>
            <h4>
              Plan por vencer en{" "}
              {st.diasRestantes! <= 0 ? "hoy" : st.diasRestantes + " día" + (st.diasRestantes === 1 ? "" : "s")}
            </h4>
          </div>
          <div className="msg">
            Ofrécele a {c.nombre} renovar su {c.plan} ahora mismo a precio preferencial.
          </div>
          <div className="price-row">
            <span className="old">{fmtCLP(pNormal)}</span>
            <span className="new">{fmtCLP(pPromo)}</span>
            <span className="save">Ahorra {fmtCLP(ahorro)}</span>
          </div>
          <button className="btn secondary" onClick={renovar}>
            Renovar plan a precio preferencial
          </button>
        </div>
      )}
      {showReactivacion && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>Plan vencido hace {diasVenc} día{diasVenc === 1 ? "" : "s"}</h4>
          </div>
          <div className="msg">
            Ofrécele a {c.nombre} reactivar su {c.plan} ahora mismo a precio preferencial.
          </div>
          <div className="price-row">
            <span className="new">{fmtCLP(precioReactivacion!)}</span>
          </div>
          <button className="btn secondary" onClick={reactivar}>
            Reactivar plan a precio preferencial ({fmtCLP(precioReactivacion!)})
          </button>
        </div>
      )}
      {esWebVencido && !showReactivacion && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Cliente Web</span>
            <h4>No renovó automáticamente</h4>
          </div>
          <div className="msg">
            El pago automático de {c.nombre} falló y su plan quedó vencido. Puedes renovárselo ahora al mismo valor
            de su último pedido.
          </div>
          <div className="price-row">
            <span className="new">{fmtCLP(precioOfertaWeb)}</span>
          </div>
          <button className="btn secondary" onClick={renovarWeb}>
            Renovar plan Web ({fmtCLP(precioOfertaWeb)})
          </button>
        </div>
      )}
      {ventaUpgrade && (
        <div className="offer-card">
          <div className="offer-head">
            <span className="badge">Promoción</span>
            <h4>¿Lo pasamos a Plan Ilimitado?</h4>
          </div>
          <div className="msg">
            {c.nombre} pagó un lavado único hace menos de {fmtHorasVentanaUpgradePlan(horasVentanaUpgrade)}. Ofrécele
            quedar con el {PLANES[0]} este primer mes pagando solo el adicional.
          </div>
          <div className="price-row">
            <span className="new">+{fmtCLP(precioUpgrade)}</span>
          </div>
          <button className="btn secondary" onClick={upgradeAPlan}>
            Upgrade a {PLANES[0]} (+{fmtCLP(precioUpgrade)})
          </button>
        </div>
      )}
      {guardarErr && <div className="err" style={{ marginBottom: 10 }}>{guardarErr}</div>}
      <div className="result-card found">
        <div className="result-head">
          {!esNombreVacio(c.nombre) ? (
            <h3>{c.nombre}</h3>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, marginRight: 10 }}>
              <input
                ref={nombreRef}
                placeholder="Nombre del cliente"
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  color: "var(--white)",
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 15,
                }}
              />
              <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarNombre}>
                Guardar
              </button>
            </div>
          )}
          <span className={`status-pill ${st.cls}`}>{st.label}</span>
        </div>
        <DetailList className="mt-3">
          <DetailRow label="Patente" value={c.patente} valueClassName={`plate-tag ${plateEstadoCls(c)}`} />
          <DetailRow
            label="Vehículo"
            value={
              c.vehiculo ? (
                c.vehiculo
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={vehiculoRef}
                    placeholder="Ej: Toyota Yaris"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarVehiculo}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
          <DetailRow label="Plan" value={c.plan || "-"} />
          <DetailRow label="Vence" value={c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"} />
          <DetailRow label="Visitas totales" value={c.visitas || 0} />
          <DetailRow
            label="Teléfono"
            value={
              c.telefono && isValidTelefono(c.telefono) ? (
                fmtTelefono(c.telefono)
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={telefonoRef}
                    defaultValue={c.telefono || "+569"}
                    placeholder="+569 -1111 1111"
                    onBlur={onTelefonoBlur}
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarTelefono}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
          <DetailRow
            label="Correo electrónico"
            value={
              c.email ? (
                c.email
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={emailRef}
                    type="email"
                    placeholder="correo@ejemplo.com"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--white)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      width: 140,
                    }}
                  />
                  <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarEmail}>
                    Guardar
                  </button>
                </div>
              )
            }
          />
        </DetailList>
        {planVigente && estadoIngreso === "bloqueado" ? (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              {mensajeBloqueoReingreso(data.ingresos, c.id)}
            </div>
            <button
              className="btn secondary"
              style={{ marginTop: 8 }}
              onClick={cobrarLavadoUnico}
              disabled={registroIncompleto}
              title={registroIncompleto ? "Completa el registro del cliente para poder dar ingreso" : undefined}
            >
              Comprar lavado por {fmtCLP(precioLavadoUnico(data.precios))} e ingresar de todas formas
            </button>
          </>
        ) : planVigente ? (
          <button
            className="btn"
            style={{ marginTop: 16 }}
            onClick={registrar}
            disabled={registroIncompleto}
            title={registroIncompleto ? "Completa el registro del cliente para poder dar ingreso" : undefined}
          >
            Registrar ingreso
          </button>
        ) : (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              Este cliente no tiene un plan vigente. Elige el tipo de lavado:
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" style={{ marginTop: 0, flex: "1 1 160px" }} onClick={contratarPlan}>
                Renovar / Contratar plan
              </button>
              <button
                className="btn secondary"
                style={{ marginTop: 0, flex: "1 1 160px" }}
                onClick={registrarPagado}
                disabled={registroIncompleto}
                title={registroIncompleto ? "Completa el registro del cliente para poder dar ingreso" : undefined}
              >
                Lavado Full Túnel ({fmtCLP(precioLavadoUnico(data.precios))})
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
