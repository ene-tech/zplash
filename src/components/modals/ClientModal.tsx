"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import {
  PATENTE_FORMATO_MSG,
  PLANES,
  RUT_FORMATO_MSG,
  TELEFONO_FORMATO_MSG,
  esExentoFormatoCliente,
  fmtTelefono,
  formatRut,
  formatTelefono,
  isValidEmail,
  isValidPatente,
  isValidRut,
  isValidTelefono,
  normPlate,
  precioLavadoUnico,
  precioNormal,
  todayYMD,
  uid,
  vencimientoPorDefectoISO,
} from "@/lib/helpers";
import type { Cliente, Empresa, PagoInfo, Venta } from "@/types";

export default function ClientModal({ data: c, contexto }: { data: Cliente | null; contexto?: "operador" | "admin" }) {
  const { data, commit, patchUi, ui } = useApp();
  const cli = c || ({} as Partial<Cliente>);

  const nombreRef = useRef<HTMLInputElement>(null);
  const patenteRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const vehiculoRef = useRef<HTMLInputElement>(null);
  const tipoClienteRef = useRef<HTMLSelectElement>(null);
  const planRef = useRef<HTMLSelectElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const vencRef = useRef<HTMLInputElement>(null);
  const origenRef = useRef<HTMLSelectElement>(null);
  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">(cli.tipoDocumento === "Factura" ? "Factura" : "Boleta");
  const [tipoCliente, setTipoCliente] = useState("plan");
  const [err, setErr] = useState("");

  // El RUT manda: al salir del campo se busca en la ficha de Empresas; si ya
  // existe una con ese RUT se traen sus datos en vez de tipearlos de nuevo.
  // Si no existe, guardar() la crea con este cliente como contacto.
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

  const onTelefonoBlur = () => {
    const raw = telefonoRef.current?.value.trim() || "";
    if (!raw || !telefonoRef.current) return;
    telefonoRef.current.value = fmtTelefono(raw);
  };

  const guardar = () => {
    const exentoFormato = esExentoFormatoCliente(ui.perfilActual?.nombre);
    const nombre = (nombreRef.current?.value.trim() || "").toUpperCase();
    const patente = normPlate(patenteRef.current?.value || "");
    if (!nombre || !patente) {
      setErr("Nombre y patente son obligatorios");
      return;
    }
    if (!exentoFormato && !isValidPatente(patente)) {
      setErr(PATENTE_FORMATO_MSG);
      return;
    }
    const dup = data.clientes.find((x) => normPlate(x.patente) === patente && x.id !== cli.id);
    if (dup) {
      setErr("Ya existe un cliente con esa patente");
      return;
    }
    const telefonoRaw = telefonoRef.current?.value.trim() || "";
    const telefono = telefonoRaw ? formatTelefono(telefonoRaw) : "";
    if (!exentoFormato && telefono && !isValidTelefono(telefono)) {
      setErr(TELEFONO_FORMATO_MSG);
      return;
    }
    const email = emailRef.current?.value.trim() || "";
    const vehiculo = vehiculoRef.current?.value.trim() || "";
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rutRaw = tipoDocumento === "Factura" ? rutRef.current?.value.trim() || "" : "";
    const direccion = tipoDocumento === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? giroRef.current?.value.trim() || "" : "";
    if (tipoDocumento === "Factura" && !exentoFormato) {
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

    let plan: string;
    let vencimiento: string | null;
    if (contexto === "operador") {
      const tc = tipoClienteRef.current?.value || "plan";
      plan = tc === "plan" ? PLANES[0] : "";
      if (tc === "plan") {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        vencimiento = d.toISOString();
      } else {
        vencimiento = null;
      }
    } else {
      plan = planRef.current?.value || PLANES[0];
      const vencVal = vencRef.current?.value;
      vencimiento = vencVal ? new Date(vencVal).toISOString() : null;
    }

    const origen: "WEB" | "LOCAL" =
      contexto === "operador" ? "LOCAL" : origenRef.current?.value === "WEB" ? "WEB" : "LOCAL";

    const persistir = async (pago?: PagoInfo) => {
      let clientes: Cliente[];
      let ventas = data.ventas;
      let nuevaEmpresa: Empresa | undefined;

      if (c) {
        const actualizado: Cliente = {
          ...(c as Cliente),
          nombre,
          patente,
          telefono,
          email,
          vehiculo,
          plan,
          tipoDocumento,
          razonSocial,
          rut,
          direccion,
          giro,
          vencimiento,
          origen,
        };
        clientes = data.clientes.map((x) => (x.id === c.id ? actualizado : x));
        if (tipoDocumento === "Factura" && rut && !data.empresas.some((e) => formatRut(e.rut) === rut)) {
          nuevaEmpresa = {
            id: uid(),
            razonSocial,
            rut,
            giro,
            direccion,
            telefono,
            contactoClienteId: actualizado.id,
            contactoNombre: actualizado.nombre,
            creadoEn: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || (contexto === "operador" ? "" : "Administrador"),
          };
        }
      } else {
        const nuevo: Cliente = {
          id: "c" + Date.now() + Math.floor(Math.random() * 1000),
          nombre,
          patente,
          telefono,
          email,
          vehiculo,
          plan,
          tipoDocumento,
          razonSocial,
          rut,
          direccion,
          giro,
          vencimiento,
          origen,
          visitas: 0,
          creadoEn: new Date().toISOString(),
          creadoPor: contexto === "operador" ? ui.perfilActual?.nombre || "" : "Administrador",
        };
        clientes = [...data.clientes, nuevo];
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
            creadoPor: ui.perfilActual?.nombre || (contexto === "operador" ? "" : "Administrador"),
          };
        }
        if (vencimiento && contexto === "operador") {
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: nuevo.plan || "",
            precio: precioNormal(data.precios, plan),
            tipo: "Plan nuevo",
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        } else if (!vencimiento && contexto === "operador") {
          // Tipo "unico" (sin plan): igual se cobra un lavado único.
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: "",
            precio: precioLavadoUnico(data.precios),
            tipo: "Lavado único",
            fecha: new Date().toISOString(),
            creadoPor: ui.perfilActual?.nombre || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        }
      }

      const ok = await commit({ clientes, ventas, ...(nuevaEmpresa ? { empresas: [...data.empresas, nuevaEmpresa] } : {}) });
      if (!ok) {
        setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
        return;
      }
      patchUi({ modal: null });
    };

    // Solo el operador (punto de venta) cobra: editar un cliente existente
    // desde el admin es un cambio en su ficha, nunca pide medio de pago ni
    // genera una venta/movimiento en el cierre de caja. Lo mismo aplica a un
    // cliente nuevo creado desde el admin.
    if (contexto === "operador") {
      const monto = vencimiento ? precioNormal(data.precios, plan) : precioLavadoUnico(data.precios);
      const descripcion = vencimiento ? `Contratación de plan para ${nombre}` : `Lavado único para ${nombre}`;
      patchUi({ modal: { type: "pago", monto, descripcion, onConfirm: (pago) => persistir(pago) } });
    } else {
      persistir();
    }
  };

  return (
    <div className="modal">
      <h3>{c ? "Editar cliente" : "Nuevo cliente"}</h3>
      <div className="field">
        <label>Nombre</label>
        <input ref={nombreRef} defaultValue={cli.nombre || ""} />
      </div>
      <div className="field">
        <label>Patente</label>
        <input ref={patenteRef} defaultValue={cli.patente || ""} style={{ textTransform: "uppercase" }} />
      </div>
      <div className="field">
        <label>Teléfono</label>
        <input ref={telefonoRef} defaultValue={cli.telefono ? fmtTelefono(cli.telefono) : "+569"} onBlur={onTelefonoBlur} />
      </div>
      <div className="field">
        <label>Correo electrónico</label>
        <input ref={emailRef} type="email" defaultValue={cli.email || ""} placeholder="correo@ejemplo.com" />
      </div>
      <div className="field">
        <label>Vehículo (Marca y Modelo)</label>
        <input ref={vehiculoRef} defaultValue={cli.vehiculo || ""} placeholder="Ej: Toyota Yaris" />
      </div>
      {contexto === "operador" ? (
        <div className="field">
          <label>Tipo de lavado</label>
          <select ref={tipoClienteRef} value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value)}>
            <option value="plan">Con Plan Ilimitado Mensual</option>
            <option value="unico">Lavado Full Túnel (sin plan)</option>
          </select>
        </div>
      ) : (
        <div className="field">
          <label>Plan</label>
          <select ref={planRef} defaultValue={cli.plan || PLANES[0]}>
            {PLANES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      {contexto !== "operador" && (
        <div className="field">
          <label>Origen</label>
          <select ref={origenRef} defaultValue={cli.origen || "LOCAL"}>
            <option value="LOCAL">Local</option>
            <option value="WEB">Web</option>
          </select>
        </div>
      )}
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
            <input ref={rutRef} defaultValue={cli.rut || ""} placeholder="12.345.678-9" onBlur={onRutBlur} />
          </div>
          <div className="field">
            <label>Razón Social</label>
            <input ref={razonSocialRef} defaultValue={cli.razonSocial || ""} />
          </div>
          <div className="field">
            <label>Dirección</label>
            <input ref={direccionRef} defaultValue={cli.direccion || ""} />
          </div>
          <div className="field">
            <label>Giro</label>
            <input ref={giroRef} defaultValue={cli.giro || ""} />
          </div>
        </div>
      )}
      {contexto === "operador" ? (
        tipoCliente === "plan" && (
          <div className="field">
            <label>Vigencia del plan</label>
            <div
              style={{
                padding: "10px 12px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--gold)",
                fontSize: 13.5,
              }}
            >
              1 mes desde hoy — vence el {new Date(vencimientoPorDefectoISO()).toLocaleDateString("es-CL")}
            </div>
          </div>
        )
      ) : (
        <div className="field">
          <label>Vencimiento del plan</label>
          <input ref={vencRef} type="date" defaultValue={cli.vencimiento ? cli.vencimiento.substring(0, 10) : todayYMD()} />
        </div>
      )}
      <div className="err">{err}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={() => patchUi({ modal: null })}>
          Cancelar
        </button>
        <button className="btn" onClick={guardar}>
          Guardar
        </button>
      </div>
    </div>
  );
}
