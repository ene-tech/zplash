"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { registrarIngreso } from "@/lib/actions";
import {
  PLANES,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  esExentoValidacionRegistroOperador,
  fmtCLP,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidRut,
  isValidTelefono,
  montoDescuento,
  normPlate,
  precioLavadoUnico,
  precioNormal,
  resolverDescuento,
  uid,
} from "@/lib/helpers";
import type { Cliente, Cupon, Empresa, Ingreso, PagoInfo, Venta } from "@/types";

const ERROR_GUARDADO = "No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.";

export default function OperadorNotFoundResult({ plate, clearPlate }: { plate: string; clearPlate: () => void }) {
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
  const onTelefonoBlur = () => {
    const raw = qTelefonoRef.current?.value.trim() || "";
    if (!raw || !qTelefonoRef.current) return;
    qTelefonoRef.current.value = fmtTelefono(raw);
  };

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

  const exentoValidacion = esExentoValidacionRegistroOperador(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);

  const quickAdd = () => {
    const nombre = (qNombreRef.current?.value.trim() || "").toUpperCase();
    const telefonoRaw = qTelefonoRef.current?.value.trim() || "";
    const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
    const email = qEmailRef.current?.value.trim() || "";
    const vehiculo = qVehiculoRef.current?.value.trim() || "";
    if (!nombre || (!exentoValidacion && (!telefonoRaw || !email))) {
      setErr("Completa Nombre, Teléfono y Correo electrónico para registrar al cliente");
      return;
    }
    if (!exentoValidacion && !isValidTelefono(telefono)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    if (!exentoValidacion && !isValidEmail(email)) {
      setErr("Ingresa un email válido");
      return;
    }
    const tipoCliente = tipoLavado;
    const plan = PLANES[0];
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? qRazonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDocumento === "Factura" ? qRutRef.current?.value.trim() || "" : "";
    const direccion = tipoDocumento === "Factura" ? qDireccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? qGiroRef.current?.value.trim() || "" : "";
    if (tipoDocumento === "Factura") {
      if (!email || !isValidEmail(email)) {
        setErr("Ingresa un email válido para la factura");
        return;
      }
      if (!razonSocial || !direccion || !giro) {
        setErr("Completa Razón Social, Dirección y Giro para la factura");
        return;
      }
      if (!isValidRut(rutRaw)) {
        setErr(RUT_FORMATO_MSG);
        return;
      }
    }
    const rut = tipoDocumento === "Factura" ? formatRut(rutRaw) : "";
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
      // No queda "sin registro" de verdad: se crea una ficha de Cliente
      // identificada como "Invitado" para esa patente, así el próximo
      // ingreso la encuentra por findClient() y queda historial de
      // visitas/frecuencia de ese vehículo aunque nunca haya dado sus datos.
      const invitado: Cliente = {
        id: uid(),
        nombre: "Invitado",
        patente,
        plan: "",
        vencimiento: null,
        origen: "LOCAL",
        visitas: 1,
        ultimaVisita: ahora,
        creadoEn: ahora,
        creadoPor: ui.perfilActual?.nombre || "",
      };
      const ingreso: Ingreso = {
        id: "i" + Date.now(),
        clienteId: invitado.id,
        patente,
        nombre: invitado.nombre,
        fecha: ahora,
        planEstadoAlIngreso: "bad",
        creadoPor: ui.perfilActual?.nombre || "",
      };
      const venta: Venta = {
        id: "v" + Date.now(),
        clienteId: invitado.id,
        patente,
        nombre: invitado.nombre,
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
        clientes: [...data.clientes, invitado],
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
          style={{ marginTop: 0, flex: "1 1 160px" }}
          onClick={() => setTipoLavado("plan")}
        >
          Renovar / Contratar plan
        </button>
        <button
          className={tipoLavado === "unico" ? "btn" : "btn secondary"}
          style={{ marginTop: 0, flex: "1 1 160px" }}
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
        O registra un cliente rápido para dejarlo ingresado ahora mismo. Los campos con * son obligatorios.
      </div>
      <div className="quick-form">
        <div>
          <label>Nombre *</label>
          <input ref={qNombreRef} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label>Teléfono *</label>
          <input ref={qTelefonoRef} defaultValue="+569" placeholder="+569 -1111 1111" onBlur={onTelefonoBlur} />
        </div>
        <div>
          <label>Correo electrónico *</label>
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
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button className="btn" style={{ marginTop: 0, flex: "2 1 200px" }} onClick={quickAdd}>
          Registrar y dar ingreso
        </button>
        <button className="btn ghost" style={{ marginTop: 0, flex: "1 1 120px" }} onClick={() => patchUi({ operResult: null })}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
