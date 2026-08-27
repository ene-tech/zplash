"use client";

import type { RefObject } from "react";
import { useAppData } from "@/context/AppContext";
import { esNombreVacio, formatTelefono, fmtTelefono, isValidEmail, isValidTelefono, TELEFONO_FORMATO_MSG } from "@/lib/helpers";
import type { Cliente } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

type FichaRefs = {
  nombreRef: RefObject<HTMLInputElement | null>;
  vehiculoRef: RefObject<HTMLInputElement | null>;
  telefonoRef: RefObject<HTMLInputElement | null>;
  emailRef: RefObject<HTMLInputElement | null>;
};

// Guardado individual de cada campo de la ficha (nombre, vehículo, teléfono,
// correo) que el operador puede completar directamente desde el resultado
// "cliente encontrado", sin pasar por el módulo Clientes.
export function useFichaClienteActions(c: Cliente, refs: FichaRefs, setGuardarErr: (msg: string) => void, updateResult: (updated: Cliente) => void) {
  const { data, commit } = useAppData();
  const { nombreRef, vehiculoRef, telefonoRef, emailRef } = refs;

  // Teléfono/Correo/Vehículo se guardan cada uno con su propio botón, pero
  // el Server Action rechaza el upsert completo si el nombre queda vacío
  // (columna NOT NULL, ver comentario en upsertClientes en @/lib/serverActions) — sin
  // esto, guardar cualquiera de esos campos mientras el nombre sigue sin
  // completar fallaba en silencio con un mensaje de "sin conexión" engañoso.
  // Acá se toma el nombre ya guardado o, si el operador ya lo tipeó pero no
  // ha tocado su botón "Guardar", el valor pendiente en el input.
  const nombreParaGuardar = (): string | null => {
    if (!esNombreVacio(c.nombre)) return c.nombre;
    const val = nombreRef.current?.value.trim();
    return val ? val.toUpperCase() : null;
  };

  const guardarNombre = async () => {
    const val = nombreRef.current?.value.trim();
    if (!val) {
      setGuardarErr("Escribe el nombre antes de tocar Guardar.");
      return;
    }
    const updated = { ...c, nombre: val.toUpperCase() };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const guardarVehiculo = async () => {
    const val = vehiculoRef.current?.value.trim();
    if (!val) {
      setGuardarErr("Escribe el vehículo antes de tocar Guardar.");
      return;
    }
    const nombre = nombreParaGuardar();
    if (!nombre) {
      setGuardarErr("Ingresa el nombre del cliente antes de guardar.");
      return;
    }
    const updated = { ...c, nombre, vehiculo: val };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) {
      setGuardarErr(ERROR_GUARDADO_INGRESO);
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
    if (!raw) {
      setGuardarErr("Escribe el teléfono antes de tocar Guardar.");
      return;
    }
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
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  const guardarEmail = async () => {
    const val = emailRef.current?.value.trim();
    if (!val) {
      setGuardarErr("Escribe el correo antes de tocar Guardar.");
      return;
    }
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
      setGuardarErr(ERROR_GUARDADO_INGRESO);
      return;
    }
    setGuardarErr("");
    updateResult(updated);
  };

  type ResultadoFicha = { ok: true; cliente: Cliente } | { ok: false; error: string };

  // Junta en un solo guardado los campos que el operador dejó tipeados en los
  // inputs de la ficha pero sin tocar su botón "Guardar" individual: se usa
  // desde useOperadorFoundResult (conFichaCompleta) para que un registro
  // incompleto no obligue a guardar cada campo por separado antes de poder
  // dar ingreso o vender un plan — basta con completar los datos y tocar
  // directamente la acción deseada (ingreso, plan, etc.).
  const resolverFichaPendiente = async (exentoValidacion: boolean): Promise<ResultadoFicha> => {
    let nombre = c.nombre;
    if (esNombreVacio(nombre)) {
      const val = nombreRef.current?.value.trim();
      if (!val) return { ok: false, error: "Ingresa el nombre del cliente antes de continuar." };
      nombre = val.toUpperCase();
    }

    let telefono = c.telefono;
    let email = c.email;
    if (!exentoValidacion) {
      if (!telefono || !isValidTelefono(telefono)) {
        const raw = telefonoRef.current?.value.trim();
        if (!raw) return { ok: false, error: "Ingresa el teléfono del cliente antes de continuar." };
        telefono = formatTelefono(raw);
        if (!isValidTelefono(telefono)) return { ok: false, error: TELEFONO_FORMATO_MSG };
      }
      if (!email) {
        const val = emailRef.current?.value.trim();
        if (!val) return { ok: false, error: "Ingresa el correo del cliente antes de continuar." };
        if (!isValidEmail(val)) return { ok: false, error: "Ingresa un email válido" };
        email = val;
      }
    }

    let vehiculo = c.vehiculo;
    if (!vehiculo) {
      const val = vehiculoRef.current?.value.trim();
      if (val) vehiculo = val;
    }

    const updated: Cliente = { ...c, nombre, telefono, email, vehiculo };
    const sinCambios = updated.nombre === c.nombre && updated.telefono === c.telefono && updated.email === c.email && updated.vehiculo === c.vehiculo;
    if (sinCambios) return { ok: true, cliente: c };

    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === c.id ? updated : x)) });
    if (!ok) return { ok: false, error: ERROR_GUARDADO_INGRESO };
    updateResult(updated);
    return { ok: true, cliente: updated };
  };

  return { guardarNombre, guardarVehiculo, guardarTelefono, guardarEmail, onTelefonoBlur, resolverFichaPendiente };
}
