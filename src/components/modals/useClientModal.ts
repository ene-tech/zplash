"use client";

import { useState, type RefObject } from "react";
import { useApp } from "@/context/AppContext";
import { PLANES, esAdministracionOGerencia, esExentoFormatoCliente, fmtFecha, fmtTelefono, formatRut, isValidRut, precioContratacion, precioLavadoUnico, sigueVigenteHoy, cicloPlanDesde } from "@/lib/helpers";
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
  heredadoRef: RefObject<HTMLInputElement | null>;
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
  const { nombreRef, patenteRef, telefonoRef, emailRef, vehiculoRef, razonSocialRef, rutRef, direccionRef, giroRef, vencRef, heredadoRef } = refs;

  // El precio heredado es plata: bajarlo le regala descuento permanente al
  // cliente en cada renovación (ver precioConHeredado). Solo lo edita quien
  // administra, mismo criterio que esExentoFormatoCliente.
  const puedeEditarHeredado = contexto !== "operador" && esAdministracionOGerencia(ui.perfilActual?.nombre);

  const [tipoDoc, setTipoDoc] = useState<"Boleta" | "Factura">(cli.tipoDocumento === "Factura" ? "Factura" : "Boleta");
  // Determina si el cliente tiene plan o no. Para clientes existentes se basa en
  // si ya tenía vencimiento; sin esto, el formulario de admin no tenía forma de
  // representar "sin plan" y cualquier edición le asignaba un vencimiento.
  const [tipoCliente, setTipoCliente] = useState(cli.vencimiento ? "plan" : "unico");
  const [planSeleccionado, setPlanSeleccionado] = useState(cli.plan || PLANES[0]);
  const [origenSeleccionado, setOrigenSeleccionado] = useState<"LOCAL" | "WEB">(cli.origen === "WEB" ? "WEB" : "LOCAL");
  const [err, setErr] = useState("");
  // Ver el guard en guardar(): quitarle el plan a alguien que lo tiene
  // vigente y pagado pide un segundo Guardar.
  const [bajaPlanConfirmada, setBajaPlanConfirmada] = useState(false);

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
    // Contratar desde el punto de venta arranca un ciclo nuevo, así que el
    // vencimiento va con su contratación (ver cicloPlanDesde): sin ella
    // periodoPlan deduce la ventana de pases del vencimiento y puede quedar
    // corrida un mes entero. En el admin el vencimiento lo tipea una persona a
    // mano y no hay ciclo que anclar, por eso ahí queda undefined.
    let fechaContratacion: string | undefined;
    if (contexto === "operador") {
      plan = tipoCliente === "plan" ? PLANES[0] : "";
      if (tipoCliente === "plan") {
        ({ vencimiento, fechaContratacion } = cicloPlanDesde());
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

    // Guardar la ficha en "lavado único" borra plan y vencimiento. Cuando el
    // cliente tiene un plan vigente que YA PAGÓ eso casi nunca es la
    // intención: es el formulario abierto para corregir otra cosa (auditoría
    // del 31-ago-2026 — dos clientes con Plan X5 al día hasta septiembre
    // quedaron sin plan así, y la ficha no volvía a reconocerles el mes
    // pagado). Se avisa y se pide un segundo Guardar; darlo de baja a
    // propósito sigue siendo posible.
    if (!plan && cli.plan && sigueVigenteHoy(cli.vencimiento) && !bajaPlanConfirmada) {
      setBajaPlanConfirmada(true);
      setErr(`${cli.nombre || "Este cliente"} tiene ${cli.plan} vigente hasta el ${fmtFecha(cli.vencimiento!)}. Guardar como "Lavado único" se lo quita. Presiona Guardar de nuevo para confirmar.`);
      return;
    }

    // Guardar la ficha tampoco debería vencerle el plan a alguien que lo tiene
    // al día. Caso real (CKLW93, 1-sep-2026): la ficha se guardó con el
    // vencimiento en "hoy" siete minutos después de que la clienta pagara
    // $21.990 en el mesón, y el plan quedó vencido el mismo día que lo compró.
    // Se compara contra la copia FRESCA de data.clientes y no contra `cli`, que
    // es la que el modal capturó al abrirse y puede venir atrasada — que es
    // justamente como el campo de fecha llegó a mostrar hoy.
    const actual = data.clientes.find((x) => x.id === cli.id);
    if (vencimiento && actual && sigueVigenteHoy(actual.vencimiento) && !sigueVigenteHoy(vencimiento) && !bajaPlanConfirmada) {
      setBajaPlanConfirmada(true);
      setErr(
        `${cli.nombre || "Este cliente"} tiene el plan vigente hasta el ${fmtFecha(actual.vencimiento!)}. ` +
          `Guardar con vencimiento ${fmtFecha(vencimiento)} se lo deja vencido. Presiona Guardar de nuevo para confirmar.`
      );
      return;
    }

    const origen: "WEB" | "LOCAL" = contexto === "operador" ? "LOCAL" : origenSeleccionado;

    // Sin el campo en pantalla (operador, perfil sin permiso, o cliente sin
    // plan) no se manda: guardarClienteModal deja el que ya tenía.
    const heredado = puedeEditarHeredado && heredadoRef.current ? { precioPlanHeredado: Number(heredadoRef.current.value) || null } : {};

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
        fechaContratacion,
        origen,
        ...heredado,
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
    puedeEditarHeredado,
    err,
    cerrar,
    onRutBlur,
    onTelefonoBlur,
    guardar,
  };
}
