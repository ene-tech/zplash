"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES, esExentoFormatoCliente, fmtTelefono, formatRut, isValidRut, precioContratacion, precioLavadoUnico } from "@/lib/helpers";
import { guardarClienteModal } from "@/lib/logic";
import type { Cliente, PagoInfo } from "@/types";
import { validarClienteModal } from "./validarClienteModal";

type ClientModalRefs = {
  nombreRef: RefObject<HTMLInputElement | null>;
  patenteRef: RefObject<HTMLInputElement | null>;
  telefonoRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
  vehiculoRef: RefObject<HTMLInputElement | null>;
  razonSocialRef: RefObject<HTMLInputElement | null>;
  rutRef: RefObject<HTMLInputElement | null>;
  direccionRef: RefObject<HTMLInputElement | null>;
  giroRef: RefObject<HTMLInputElement | null>;
  vencRef: RefObject<HTMLInputElement | null>;
};

// Lógica del modal de alta/edición de cliente: valida y arma el guardado
// (con o sin cobro, según el contexto operador/admin), da de alta la Empresa
// asociada si el RUT de Factura es nuevo, y en alta desde el operador genera
// además la Venta e Ingreso correspondientes.
export function useClientModal(
  c: Cliente | null,
  contexto: "operador" | "admin" | undefined,
  refs: ClientModalRefs
) {
  const { data, commit, patchUi, ui } = useApp();
  const cli = c || ({} as Partial<Cliente>);
  const { nombreRef, patenteRef, telefonoRef, emailRef, vehiculoRef, razonSocialRef, rutRef, direccionRef, giroRef, vencRef } = refs;

  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">(cli.tipoDocumento === "Factura" ? "Factura" : "Boleta");
  // Determina si el cliente tiene plan o no. Para clientes existentes se basa en
  // si ya tenía vencimiento; sin esto, el formulario de admin no tenía forma de
  // representar "sin plan" y cualquier edición le asignaba un vencimiento.
  const [tipoCliente, setTipoCliente] = useState(cli.vencimiento ? "plan" : "unico");
  const [planSeleccionado, setPlanSeleccionado] = useState(cli.plan || PLANES[0]);
  const [origenSeleccionado, setOrigenSeleccionado] = useState<"LOCAL" | "WEB">(cli.origen === "WEB" ? "WEB" : "LOCAL");
  const [err, setErr] = useState("");

  const cerrar = () => patchUi({ modal: null });

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
    const tipoDocumento = tipoDoc;
    const resultado = validarClienteModal({
      nombreRaw: nombreRef.current?.value || "",
      patenteRaw: patenteRef.current?.value || "",
      telefonoRaw: telefonoRef.current?.value || "",
      vehiculoRaw: vehiculoRef.current?.value || "",
      emailRaw: emailRef.current?.value || "",
      tipoDocumento,
      razonSocialRaw: razonSocialRef.current?.value || "",
      rutRaw: rutRef.current?.value || "",
      direccionRaw: direccionRef.current?.value || "",
      giroRaw: giroRef.current?.value || "",
      exentoFormato,
      clientes: data.clientes,
      clienteIdActual: cli.id,
    });
    if (!resultado.ok) {
      setErr(resultado.error);
      return;
    }
    const { nombre, patente, telefono, email, vehiculo, razonSocial, rut, direccion, giro } = resultado;

    let plan: string;
    let vencimiento: string | null;
    if (contexto === "operador") {
      plan = tipoCliente === "plan" ? PLANES[0] : "";
      if (tipoCliente === "plan") {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        vencimiento = d.toISOString();
      } else {
        vencimiento = null;
      }
    } else if (tipoCliente === "plan") {
      plan = planSeleccionado;
      const vencVal = vencRef.current?.value;
      vencimiento = vencVal ? new Date(vencVal).toISOString() : null;
    } else {
      plan = "";
      vencimiento = null;
    }

    const origen: "WEB" | "LOCAL" = contexto === "operador" ? "LOCAL" : origenSeleccionado;

    const persistir = async (pago?: PagoInfo) => {
      const patch = guardarClienteModal(data, {
        clienteExistente: c,
        contexto,
        perfilNombre: ui.perfilActual?.nombre,
        nombre,
        patente,
        telefono,
        email,
        vehiculo,
        tipoDocumento,
        razonSocial,
        rut,
        direccion,
        giro,
        plan,
        vencimiento,
        origen,
        pago,
      });
      const ok = await commit(patch);
      if (!ok) {
        setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
        return;
      }
      cerrar();
    };

    // Solo el operador (punto de venta) cobra: editar un cliente existente
    // desde el admin es un cambio en su ficha, nunca pide medio de pago ni
    // genera una venta/movimiento en el cierre de caja. Lo mismo aplica a un
    // cliente nuevo creado desde el admin.
    if (contexto === "operador") {
      // Mismo precio que registra guardarClienteModal en la Venta "Plan
      // nuevo": el de 1ra contratación si el cliente nunca tuvo plan.
      const monto = vencimiento ? precioContratacion(data.precios, plan, c) : precioLavadoUnico(data.precios);
      const descripcion = vencimiento ? `Contratación de plan para ${nombre}` : `Lavado único para ${nombre}`;
      patchUi({ modal: { type: "pago", monto, descripcion, onConfirm: (pago) => persistir(pago) } });
    } else {
      persistir();
    }
  };

  return {
    cli,
    tipoDoc,
    setTipoDoc,
    tipoCliente,
    setTipoCliente,
    planSeleccionado,
    setPlanSeleccionado,
    origenSeleccionado,
    setOrigenSeleccionado,
    err,
    cerrar,
    onRutBlur,
    onTelefonoBlur,
    guardar,
  };
}
