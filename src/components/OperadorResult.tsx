"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { registrarIngreso, registrarIngresoDetailing, renovarPlan } from "@/lib/actions";
import { puedeIngresarTunelDetailing } from "@/lib/agenda";
import {
  CATEGORIA_DETAILING,
  PLANES,
  RUT_FORMATO_MSG,
  esNombreVacio,
  estadoReingresoPlan,
  fmtCLP,
  formatRut,
  isValidRut,
  mensajeBloqueoReingreso,
  montoDescuento,
  normPlate,
  planStatus,
  precioLavadoUnico,
  precioNormal,
  precioPreferencial,
  precioUpgradePlan,
  resolverDescuento,
  uid,
  vencimientoAnclado,
  vencimientoPorDefectoISO,
  ventaUpgradeElegible,
  yaIngresoHoy,
} from "@/lib/helpers";
import type { Cliente, Cupon, Empresa, Ingreso, PagoInfo, Venta } from "@/types";

export default function OperadorResult({ clearPlate }: { clearPlate: () => void }) {
  const { ui } = useApp();
  const r = ui.operResult;
  if (!r) return null;
  if (r.found) return <FoundResult cliente={r.cliente} clearPlate={clearPlate} />;
  return <NotFoundResult plate={r.plate} clearPlate={clearPlate} />;
}

const ERROR_GUARDADO = "No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";

function FoundResult({ cliente, clearPlate }: { cliente: Cliente; clearPlate: () => void }) {
  const { data, ui, commit, patchUi } = useApp();
  const nombreRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const [guardarErr, setGuardarErr] = useState("");

  const c = cliente;
  const st = planStatus(c);
  const pNormal = precioNormal(data.precios, c.plan || "");
  const pPromo = precioPreferencial(data.precios, c.plan || "");
  const showOffer = st.cls === "warn" && pNormal > 0 && c.origen !== "WEB";
  const ahorro = pNormal - pPromo;
  const planVigente = st.cls !== "bad";
  const estadoIngreso = estadoReingresoPlan(data.ingresos, c.id);

  const esWebVencido = c.origen === "WEB" && st.cls === "bad";
  const ventasCliente = data.ventas
    .filter((v) => v.clienteId === c.id)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  const precioOfertaWeb = ventasCliente.length ? ventasCliente[0].precio : pNormal;

  // Promoción: si al cliente se le acaba de cobrar un lavado único (hace
  // menos de 1 hora, ver ventaUpgradeElegible) y sigue sin plan vigente, se le
  // puede ofrecer quedar con el Plan Ilimitado Mensual pagando solo el
  // adicional — ver upgradeAPlan más abajo.
  const ventaUpgrade = !planVigente ? ventaUpgradeElegible(data.ventas, c.id) : undefined;
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
    return cita.servicioIds.some((id) => data.servicios.find((s) => s.id === id)?.categoria === CATEGORIA_DETAILING);
  });

  const updateResult = (updated: Cliente) => patchUi({ operResult: { found: true, cliente: updated } });

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
    const updated = { ...c, vehiculo: val };
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
      const patch = renovarPlan(data, c, ui.perfilActual?.nombre, pago);
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
  // "Contratación de plan".
  const upgradeAPlan = () => {
    if (!ventaUpgrade) return;
    const plan = PLANES[0];
    pedirPago(precioUpgrade, `Upgrade a ${plan} para ${c.nombre} (adicional al lavado ya pagado)`, async (pago) => {
      const updated = { ...c, plan, vencimiento: vencimientoPorDefectoISO() };
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
          <button className="btn secondary" onClick={registrarDetailing}>
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
      {esWebVencido && (
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
            {c.nombre} pagó un lavado único hace menos de 1 hora. Ofrécele quedar con el {PLANES[0]} este primer mes
            pagando solo el adicional.
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
        <div className="info-grid">
          <div>
            <div className="k">Patente</div>
            <div className="v">{c.patente}</div>
          </div>
          <div>
            <div className="k">Vehículo (Marca y Modelo)</div>
            {c.vehiculo ? (
              <div className="v">{c.vehiculo}</div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <input
                  ref={vehiculoRef}
                  placeholder="Ej: Toyota Yaris"
                  style={{
                    flex: 1,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    color: "var(--white)",
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
                <button className="icon-btn" style={{ whiteSpace: "nowrap" }} onClick={guardarVehiculo}>
                  Guardar
                </button>
              </div>
            )}
          </div>
          <div>
            <div className="k">Plan</div>
            <div className="v">{c.plan || "-"}</div>
          </div>
          <div>
            <div className="k">Vence</div>
            <div className="v">{c.vencimiento ? new Date(c.vencimiento).toLocaleDateString("es-CL") : "-"}</div>
          </div>
          <div>
            <div className="k">Visitas totales</div>
            <div className="v">{c.visitas || 0}</div>
          </div>
          <div>
            <div className="k">Teléfono</div>
            <div className="v">{c.telefono || "-"}</div>
          </div>
        </div>
        {planVigente && estadoIngreso === "bloqueado" ? (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              {mensajeBloqueoReingreso(data.ingresos, c.id)}
            </div>
            <button className="btn secondary" style={{ marginTop: 8 }} onClick={cobrarLavadoUnico}>
              Comprar lavado por {fmtCLP(precioLavadoUnico(data.precios))} e ingresar de todas formas
            </button>
          </>
        ) : planVigente ? (
          <button className="btn" style={{ marginTop: 16 }} onClick={registrar}>
            Registrar ingreso
          </button>
        ) : (
          <>
            <div className="hint" style={{ textAlign: "left", color: "var(--gray)", marginTop: 16 }}>
              Este cliente no tiene un plan vigente. Elige el tipo de lavado:
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" style={{ marginTop: 0 }} onClick={contratarPlan}>
                Renovar / Contratar plan
              </button>
              <button className="btn secondary" style={{ marginTop: 0 }} onClick={registrarPagado}>
                Lavado Full Túnel ({fmtCLP(precioLavadoUnico(data.precios))})
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function NotFoundResult({ plate, clearPlate }: { plate: string; clearPlate: () => void }) {
  const { data, ui, commit, patchUi } = useApp();
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">("Boleta");
  const [tipoLavado, setTipoLavado] = useState<"plan" | "unico">("plan");
  const [err, setErr] = useState("");
  const qNombreRef = useRef<HTMLInputElement>(null);
  const qTelefonoRef = useRef<HTMLInputElement>(null);
  const qEmailRef = useRef<HTMLInputElement>(null);
  const qVehiculoRef = useRef<HTMLInputElement>(null);
  const qRazonSocialRef = useRef<HTMLInputElement>(null);
  const qRutRef = useRef<HTMLInputElement>(null);
  const qDireccionRef = useRef<HTMLInputElement>(null);
  const qGiroRef = useRef<HTMLInputElement>(null);
  const qCuponRef = useRef<HTMLInputElement>(null);

  const pedirPago = (monto: number, descripcion: string, onConfirm: (pago: PagoInfo) => void) => {
    patchUi({ modal: { type: "pago", monto, descripcion, onConfirm } });
  };

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos (Razón Social, Dirección,
  // Giro) en vez de tipearlos de nuevo. Si no existe, quickAdd() la crea al
  // guardar, con este cliente nuevo como persona de contacto.
  const onRutBlur = () => {
    const rutRaw = qRutRef.current?.value.trim() || "";
    if (!isValidRut(rutRaw)) return;
    const rutFormateado = formatRut(rutRaw);
    if (qRutRef.current) qRutRef.current.value = rutFormateado;
    const empresa = data.empresas.find((e) => formatRut(e.rut) === rutFormateado);
    if (!empresa) return;
    if (qRazonSocialRef.current) qRazonSocialRef.current.value = empresa.razonSocial;
    if (qDireccionRef.current) qDireccionRef.current.value = empresa.direccion || "";
    if (qGiroRef.current) qGiroRef.current.value = empresa.giro || "";
  };

  const quickAdd = () => {
    const nombre = (qNombreRef.current?.value.trim() || "Cliente sin nombre").toUpperCase();
    const telefono = qTelefonoRef.current?.value.trim() || "";
    const email = qEmailRef.current?.value.trim() || "";
    const vehiculo = qVehiculoRef.current?.value.trim() || "";
    const tipoCliente = tipoLavado;
    const plan = PLANES[0];
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? qRazonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDocumento === "Factura" ? qRutRef.current?.value.trim() || "" : "";
    if (tipoDocumento === "Factura" && !isValidRut(rutRaw)) {
      setErr(RUT_FORMATO_MSG);
      return;
    }
    const rut = tipoDocumento === "Factura" ? formatRut(rutRaw) : "";
    const direccion = tipoDocumento === "Factura" ? qDireccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? qGiroRef.current?.value.trim() || "" : "";
    let vencimiento: string | null = null;
    if (tipoCliente === "plan") {
      const venc = new Date();
      venc.setDate(venc.getDate() + 30);
      vencimiento = venc.toISOString();
    }
    const nuevo: Cliente = {
      id: uid(),
      nombre,
      telefono,
      email,
      vehiculo,
      patente: normPlate(plate),
      plan: tipoCliente === "plan" ? plan : "",
      tipoDocumento,
      razonSocial,
      rut,
      direccion,
      giro,
      vencimiento,
      origen: "LOCAL",
      visitas: 0,
      creadoEn: new Date().toISOString(),
      creadoPor: ui.perfilActual?.nombre || "",
    };
    const precioBase = tipoCliente === "plan" ? precioNormal(data.precios, plan) : precioLavadoUnico(data.precios);
    let precio = precioBase;
    let cuponAplicado: Cupon | undefined;
    if (tipoCliente === "unico") {
      const codigoCupon = qCuponRef.current?.value.trim() || "";
      if (codigoCupon) {
        const resultado = resolverDescuento(codigoCupon, nuevo.patente, data.cupones);
        if (!resultado.ok) {
          setErr(resultado.msg);
          return;
        }
        cuponAplicado = resultado.cupon;
        precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
      }
    }
    const tipoVenta = tipoCliente === "plan" ? "Plan nuevo" : "Lavado único";
    const descripcion =
      tipoCliente === "plan" ? `Contratación de plan para ${nombre}` : `Lavado único para ${nombre}`;

    // Si es Factura y el RUT no pertenece a ninguna empresa ya registrada, se
    // crea una nueva en Empresas con este cliente como persona de contacto.
    let nuevaEmpresa: Empresa | undefined;
    if (tipoDocumento === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
      nuevaEmpresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: nuevo.id,
        contactoNombre: nuevo.nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "",
      };
    }

    pedirPago(precio, descripcion, async (pago) => {
      const ahora = new Date().toISOString();
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: nuevo.id,
        patente: nuevo.patente,
        nombre: nuevo.nombre,
        plan: nuevo.plan || "",
        precio,
        tipo: tipoVenta,
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        viaCupon: !!cuponAplicado,
        cuponCodigo: cuponAplicado?.codigo,
      };
      const tempData = { ...data, clientes: [...data.clientes, nuevo], ventas: [venta, ...data.ventas] };
      const ingresoPatch = registrarIngreso(tempData, nuevo, ui.perfilActual?.nombre);
      const ok = await commit({
        clientes: ingresoPatch.clientes,
        ventas: tempData.ventas,
        ingresos: ingresoPatch.ingresos,
        ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}),
        ...(cuponAplicado
          ? {
              cupones: data.cupones.map((x) =>
                x.id === cuponAplicado!.id
                  ? { ...cuponAplicado!, usado: true, patenteUso: nuevo.patente, fechaUso: ahora, operadorUso: ui.perfilActual?.nombre || "" }
                  : x
              ),
            }
          : {}),
      });
      if (!ok) {
        setErr(ERROR_GUARDADO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    });
  };

  const ingresarSinRegistro = () => {
    const patente = normPlate(plate);
    const precioBase = precioLavadoUnico(data.precios);
    let precio = precioBase;
    let cuponAplicado: Cupon | undefined;
    const codigoCupon = qCuponRef.current?.value.trim() || "";
    if (codigoCupon) {
      const resultado = resolverDescuento(codigoCupon, patente, data.cupones);
      if (!resultado.ok) {
        setErr(resultado.msg);
        return;
      }
      cuponAplicado = resultado.cupon;
      precio = Math.max(0, precioBase - montoDescuento(resultado.cupon, precioBase));
    }
    pedirPago(precio, `Lavado único sin registro (${patente})`, async (pago) => {
      const ahora = new Date().toISOString();
      const ingreso: Ingreso = {
        id: "i" + Date.now(),
        clienteId: "",
        patente,
        nombre: "Sin registro",
        fecha: ahora,
        planEstadoAlIngreso: "bad",
        creadoPor: ui.perfilActual?.nombre || "",
      };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: "",
        patente,
        nombre: "Sin registro",
        plan: "",
        precio,
        tipo: "Lavado único",
        fecha: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
        metodoPago: pago.metodo,
        voucher: pago.voucher,
        viaCupon: !!cuponAplicado,
        cuponCodigo: cuponAplicado?.codigo,
      };
      const ok = await commit({
        ingresos: [ingreso, ...data.ingresos],
        ventas: [venta, ...data.ventas],
        ...(cuponAplicado
          ? {
              cupones: data.cupones.map((x) =>
                x.id === cuponAplicado!.id
                  ? { ...cuponAplicado!, usado: true, patenteUso: patente, fechaUso: ahora, operadorUso: ui.perfilActual?.nombre || "" }
                  : x
              ),
            }
          : {}),
      });
      if (!ok) {
        setErr(ERROR_GUARDADO);
        return;
      }
      clearPlate();
      patchUi({ operResult: null });
    });
  };

  return (
    <div className="result-card notfound">
      <div className="result-head">
        <h3>Patente no registrada</h3>
        <span className="status-pill bad">{plate.toUpperCase()}</span>
      </div>
      {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
        Este vehículo no tiene un plan activo. Elige el tipo de lavado:
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          className={tipoLavado === "plan" ? "btn" : "btn secondary"}
          style={{ marginTop: 0 }}
          onClick={() => setTipoLavado("plan")}
        >
          Renovar / Contratar plan
        </button>
        <button
          className={tipoLavado === "unico" ? "btn" : "btn secondary"}
          style={{ marginTop: 0 }}
          onClick={() => setTipoLavado("unico")}
        >
          Lavado Full Túnel ({fmtCLP(precioLavadoUnico(data.precios))})
        </button>
      </div>
      <div className="quick-form" style={{ marginBottom: 14, marginTop: 0 }}>
        <div>
          <label>Código de descuento (opcional)</label>
          <input ref={qCuponRef} placeholder="Ej: AB12CD" style={{ textTransform: "uppercase" }} />
        </div>
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13 }}>
        ¿Solo un lavado, sin ficha de cliente? Cóbralo directo sin registrar nada.
      </div>
      <button className="btn ghost" style={{ marginBottom: 4 }} onClick={ingresarSinRegistro}>
        Ingresar sin registro — Lavado único ({fmtCLP(precioLavadoUnico(data.precios))})
      </button>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 13, marginTop: 14 }}>
        O registra un cliente rápido para dejarlo ingresado ahora mismo.
      </div>
      <div className="quick-form">
        <div>
          <label>Nombre</label>
          <input ref={qNombreRef} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label>Teléfono</label>
          <input ref={qTelefonoRef} defaultValue="+569" placeholder="+56 9 ..." />
        </div>
        <div>
          <label>Correo electrónico</label>
          <input ref={qEmailRef} type="email" placeholder="correo@ejemplo.com" />
        </div>
        <div>
          <label>Vehículo (Marca y Modelo)</label>
          <input ref={qVehiculoRef} placeholder="Ej: Toyota Yaris" />
        </div>
        <div>
          <label>Tipo de documento</label>
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as "Boleta" | "Factura")}>
            <option value="Boleta">Boleta</option>
            <option value="Factura">Factura</option>
          </select>
        </div>
        {tipoDoc === "Factura" && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label>RUT</label>
              <input ref={qRutRef} placeholder="12.345.678-9" onBlur={onRutBlur} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Razón Social</label>
              <input ref={qRazonSocialRef} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Dirección</label>
              <input ref={qDireccionRef} />
            </div>
            <div>
              <label>Giro</label>
              <input ref={qGiroRef} />
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn" onClick={quickAdd}>
          Registrar y dar ingreso
        </button>
        <button className="btn ghost" onClick={() => patchUi({ operResult: null })}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
