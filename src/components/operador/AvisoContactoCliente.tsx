"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { esNombreVacio, fmtTelefono, formatTelefono, isValidEmail, isValidTelefono, puedeCorregirContacto, TELEFONO_FORMATO_MSG, type FallasContacto } from "@/lib/helpers";
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
  // La respuesta queda guardada junto a la ficha que se consultó: si cambia el
  // cliente escaneado (o sus datos, al guardar), la anterior deja de valer al
  // tiro y no se muestra ni se guarda mientras llega la nueva.
  const firma = `${cliente.id}|${cliente.nombre}|${cliente.telefono}|${cliente.email}`;
  const [revision, setRevision] = useState<{ firma: string; fallas: FallasContacto | null } | null>(null);
  const fallas = revision?.firma === firma ? revision.fallas : null;
  const [valores, setValores] = useState<Record<keyof FallasContacto, string>>({ nombre: "", telefono: "", email: "" });
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!habilitado) return;
    let cancelado = false;
    revisarContactoCliente(cliente.id)
      .then((f) => {
        if (cancelado) return;
        setRevision({ firma, fallas: f });
        setErr("");
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
  }, [habilitado, firma, cliente.id, cliente.nombre, cliente.telefono, cliente.email]);

  // Lo vacío o inválido ya lo pide la ficha de abajo con su propio input
  // (nombre vacío, sin celular válido, sin correo): acá solo lo que la ficha
  // no muestra, el dato que tiene valor pero no le llega, y el "Invitado".
  const yaLoPideLaFicha: Record<keyof FallasContacto, boolean> = {
    nombre: esNombreVacio(cliente.nombre),
    telefono: !cliente.telefono || !isValidTelefono(cliente.telefono),
    email: !cliente.email,
  };
  const campos = fallas ? (Object.keys(fallas) as (keyof FallasContacto)[]).filter((k) => fallas[k] && !yaLoPideLaFicha[k]) : [];
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
    // Sobre la fila de hoy, no sobre la copia del escaneo: si en el intertanto
    // cambió otro campo (un cobro que movió el vencimiento), no se pisa.
    const actual = data.clientes.find((x) => x.id === cliente.id) ?? cliente;
    const updated = { ...actual, ...cambios };
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
