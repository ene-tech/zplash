"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { fmtTelefono, formatTelefono, isValidEmail, isValidTelefono, puedeCorregirContacto, TELEFONO_FORMATO_MSG, type FallasContacto } from "@/lib/helpers";
import { revisarContactoCliente } from "@/lib/serverActions";
import type { Cliente } from "@/types";
import { ERROR_GUARDADO_INGRESO } from "./useOperadorFoundResult";

const ETIQUETA: Record<keyof FallasContacto, string> = { nombre: "Nombre", telefono: "Celular", email: "Correo" };

// "A este cliente no le llegan los mensajes": al escanear la patente, Jeny,
// Administración y Gerencia ven qué dato falló (ver fallasContactoCliente) y lo
// corrigen ahí mismo. El resto de los perfiles no lo ve. Si la consulta falla,
// no se muestra nada: es una ayuda, no puede trabar el ingreso.
export default function AvisoContactoCliente({ cliente, onActualizado }: { cliente: Cliente; onActualizado: (c: Cliente) => void }) {
  const { data, ui, commit } = useApp();
  const habilitado = puedeCorregirContacto(ui.perfilActual?.modulos || [], ui.perfilActual?.nombre);
  const [fallas, setFallas] = useState<FallasContacto | null>(null);
  const [valores, setValores] = useState<Record<keyof FallasContacto, string>>({ nombre: "", telefono: "", email: "" });
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!habilitado) return;
    let cancelado = false;
    revisarContactoCliente(cliente.id)
      .then((f) => {
        if (cancelado) return;
        setFallas(f);
        setValores({
          nombre: f?.nombre ? "" : cliente.nombre,
          telefono: f?.telefono ? cliente.telefono || "+569" : cliente.telefono || "",
          email: cliente.email || "",
        });
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [habilitado, cliente.id, cliente.nombre, cliente.telefono, cliente.email]);

  const campos = fallas ? (Object.keys(fallas) as (keyof FallasContacto)[]).filter((k) => fallas[k]) : [];
  if (!habilitado || !campos.length) return null;

  const guardar = async () => {
    setErr("");
    const cambios: Partial<Cliente> = {};
    for (const campo of campos) {
      const val = valores[campo].trim();
      if (!val || val === "+569") continue;
      if (campo === "nombre") cambios.nombre = val.toUpperCase();
      if (campo === "telefono") {
        const tel = formatTelefono(val);
        if (!isValidTelefono(tel)) return setErr(TELEFONO_FORMATO_MSG);
        if (tel !== cliente.telefono) cambios.telefono = tel;
      }
      if (campo === "email") {
        if (!isValidEmail(val)) return setErr("Ingresa un correo válido");
        if (val !== cliente.email) cambios.email = val;
      }
    }
    if (!Object.keys(cambios).length) return setErr("Escribe el dato nuevo antes de guardar.");
    setGuardando(true);
    const updated = { ...cliente, ...cambios };
    const ok = await commit({ clientes: data.clientes.map((x) => (x.id === cliente.id ? updated : x)) });
    setGuardando(false);
    if (!ok) return setErr(ERROR_GUARDADO_INGRESO);
    onActualizado(updated);
  };

  return (
    <div className="result-card" style={{ marginBottom: 10, borderColor: "var(--gold)" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Actualiza los datos de contacto</div>
      <div className="hint" style={{ textAlign: "left", marginBottom: 10 }}>
        Pídeselos al cliente: así le llegan sus códigos y avisos.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {campos.map((campo) => (
          <label key={campo} style={{ display: "grid", gap: 4, fontSize: 13 }}>
            <span>
              <b>{ETIQUETA[campo]}</b> · {fallas![campo]}
              {campo === "telefono" && cliente.telefono ? ` (${fmtTelefono(cliente.telefono)})` : ""}
              {campo === "email" && cliente.email ? ` (${cliente.email})` : ""}
            </span>
            <input
              value={valores[campo]}
              onChange={(e) => setValores((v) => ({ ...v, [campo]: e.target.value }))}
              type={campo === "email" ? "email" : campo === "telefono" ? "tel" : "text"}
              placeholder={campo === "email" ? "correo@ejemplo.com" : campo === "telefono" ? "+569 1111 1111" : "Nombre del cliente"}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--white)", padding: "8px 10px", borderRadius: 8, fontSize: 15 }}
            />
          </label>
        ))}
      </div>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <button className="btn" style={{ marginTop: 10 }} onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar datos"}
      </button>
    </div>
  );
}
