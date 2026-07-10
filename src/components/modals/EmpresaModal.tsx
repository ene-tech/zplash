"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { RUT_FORMATO_MSG, formatRut, isValidRut, uid } from "@/lib/helpers";
import type { Empresa } from "@/types";

export default function EmpresaModal({ data: e }: { data: Empresa | null }) {
  const { data, commit, patchUi, ui } = useApp();
  const emp = e || ({} as Partial<Empresa>);

  const razonSocialRef = useRef<HTMLInputElement>(null);
  const rutRef = useRef<HTMLInputElement>(null);
  const giroRef = useRef<HTMLInputElement>(null);
  const direccionRef = useRef<HTMLInputElement>(null);
  const telefonoRef = useRef<HTMLInputElement>(null);
  const contactoRef = useRef<HTMLSelectElement>(null);
  const [err, setErr] = useState("");

  const clientesOrdenados = [...data.clientes].sort((a, b) => a.nombre.localeCompare(b.nombre));

  const guardar = async () => {
    const razonSocial = razonSocialRef.current?.value.trim() || "";
    const rutRaw = rutRef.current?.value.trim() || "";
    if (!razonSocial || !rutRaw) {
      setErr("Razón Social y RUT son obligatorios");
      return;
    }
    if (!isValidRut(rutRaw)) {
      setErr(RUT_FORMATO_MSG);
      return;
    }
    const rut = formatRut(rutRaw);
    const dup = data.empresas.find((x) => x.rut === rut && x.id !== emp.id);
    if (dup) {
      setErr("Ya existe una empresa registrada con ese RUT");
      return;
    }

    const giro = giroRef.current?.value.trim() || "";
    const direccion = direccionRef.current?.value.trim() || "";
    const telefono = telefonoRef.current?.value.trim() || "";
    const contactoClienteId = contactoRef.current?.value || "";
    const contactoNombre = contactoClienteId
      ? data.clientes.find((c) => c.id === contactoClienteId)?.nombre || ""
      : "";

    let empresas: Empresa[];
    if (e) {
      const actualizado: Empresa = {
        ...(e as Empresa),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId,
        contactoNombre,
      };
      empresas = data.empresas.map((x) => (x.id === e.id ? actualizado : x));
    } else {
      const nuevo: Empresa = {
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId,
        contactoNombre,
        creadoEn: new Date().toISOString(),
        creadoPor: ui.perfilActual?.nombre || "Administrador",
      };
      empresas = [...data.empresas, nuevo];
    }

    const ok = await commit({ empresas });
    if (!ok) {
      setErr("No se pudo guardar el cambio (sin conexión con el almacenamiento). Verifica tu conexión e inténtalo de nuevo.");
      return;
    }
    patchUi({ modal: null });
  };

  return (
    <div className="modal">
      <h3>{e ? "Editar empresa" : "Nueva empresa"}</h3>
      <div className="field">
        <label>Razón Social</label>
        <input ref={razonSocialRef} defaultValue={emp.razonSocial || ""} />
      </div>
      <div className="field">
        <label>RUT</label>
        <input ref={rutRef} defaultValue={emp.rut || ""} placeholder="12.345.678-9" />
      </div>
      <div className="field">
        <label>Giro</label>
        <input ref={giroRef} defaultValue={emp.giro || ""} />
      </div>
      <div className="field">
        <label>Dirección</label>
        <input ref={direccionRef} defaultValue={emp.direccion || ""} />
      </div>
      <div className="field">
        <label>Teléfono</label>
        <input ref={telefonoRef} defaultValue={emp.telefono || ""} />
      </div>
      <div className="field">
        <label>Persona de contacto</label>
        <select ref={contactoRef} defaultValue={emp.contactoClienteId || ""}>
          <option value="">Sin contacto asignado</option>
          {clientesOrdenados.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
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
