"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES, PRECIO_LAVADO_UNICO, normPlate, precioNormal, todayYMD, vencimientoPorDefectoISO } from "@/lib/helpers";
import type { Cliente, PagoInfo, Venta } from "@/types";

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
  const [tipoDoc, setTipoDoc] = useState(cli.tipoDocumento === "Factura" ? "Factura" : "Boleta");
  const [tipoCliente, setTipoCliente] = useState("plan");
  const [err, setErr] = useState("");

  const guardar = () => {
    const nombre = nombreRef.current?.value.trim() || "";
    const patente = normPlate(patenteRef.current?.value || "");
    if (!nombre || !patente) {
      setErr("Nombre y patente son obligatorios");
      return;
    }
    const dup = data.clientes.find((x) => normPlate(x.patente) === patente && x.id !== cli.id);
    if (dup) {
      setErr("Ya existe un cliente con esa patente");
      return;
    }
    const telefono = telefonoRef.current?.value.trim() || "";
    const email = emailRef.current?.value.trim() || "";
    const vehiculo = vehiculoRef.current?.value.trim() || "";
    const tipoDocumento = tipoDoc;
    const razonSocial = tipoDocumento === "Factura" ? razonSocialRef.current?.value.trim() || "" : "";
    const rut = tipoDocumento === "Factura" ? rutRef.current?.value.trim() || "" : "";
    const direccion = tipoDocumento === "Factura" ? direccionRef.current?.value.trim() || "" : "";
    const giro = tipoDocumento === "Factura" ? giroRef.current?.value.trim() || "" : "";

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

    const vencimientoAnterior = cli.vencimiento || null;
    const origen: "WEB" | "LOCAL" =
      contexto === "operador" ? "LOCAL" : origenRef.current?.value === "WEB" ? "WEB" : "LOCAL";

    const persistir = async (pago?: PagoInfo) => {
      let clientes: Cliente[];
      let ventas = data.ventas;

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
        if (vencimiento && vencimiento !== vencimientoAnterior) {
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: actualizado.id,
            patente: actualizado.patente,
            nombre: actualizado.nombre,
            plan: actualizado.plan || "",
            precio: precioNormal(data.precios, plan),
            tipo: "Renovación manual",
            fecha: new Date().toISOString(),
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
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
        };
        clientes = [...data.clientes, nuevo];
        if (vencimiento) {
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: nuevo.plan || "",
            precio: precioNormal(data.precios, plan),
            tipo: "Plan nuevo",
            fecha: new Date().toISOString(),
            operador: ui.operadorActual || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        } else if (contexto === "operador") {
          // Tipo "unico" (sin plan): igual se cobra un lavado único.
          const venta: Venta = {
            id: "v" + Date.now(),
            clienteId: nuevo.id,
            patente: nuevo.patente,
            nombre: nuevo.nombre,
            plan: "",
            precio: PRECIO_LAVADO_UNICO,
            tipo: "Lavado único",
            fecha: new Date().toISOString(),
            operador: ui.operadorActual || "",
            metodoPago: pago?.metodo,
            voucher: pago?.voucher,
          };
          ventas = [venta, ...ventas];
        }
      }

      await commit({ clientes, ventas });
      patchUi({ modal: null });
    };

    if (contexto === "operador") {
      const monto = vencimiento ? precioNormal(data.precios, plan) : PRECIO_LAVADO_UNICO;
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
        <input ref={telefonoRef} defaultValue={cli.telefono || "+569"} />
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
          <label>Tipo de cliente</label>
          <select ref={tipoClienteRef} value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value)}>
            <option value="plan">Con Plan Ilimitado Mensual</option>
            <option value="unico">Lavado único (sin plan)</option>
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
        <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
          <option value="Boleta">Boleta</option>
          <option value="Factura">Factura</option>
        </select>
      </div>
      {tipoDoc === "Factura" && (
        <div>
          <div className="field">
            <label>Razón Social</label>
            <input ref={razonSocialRef} defaultValue={cli.razonSocial || ""} />
          </div>
          <div className="field">
            <label>RUT</label>
            <input ref={rutRef} defaultValue={cli.rut || ""} placeholder="12.345.678-9" />
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
