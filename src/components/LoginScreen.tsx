"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { ordenarPerfiles } from "@/lib/helpers";
import type { PerfilPublico } from "@/types";

export default function LoginScreen() {
  const { data, ui, patchUi } = useApp();

  if (ui.loginMode === "pin") {
    return <PerfilPinForm />;
  }

  return (
    <div className="login-screen">
      <div className="brand">
        <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" />
        <div className="sub">¿Quién eres?</div>
      </div>
      <div className="role-grid">
        {ordenarPerfiles(data.perfiles).map((p) => (
          <button
            key={p.id}
            className="role-btn"
            style={{ width: 150, padding: "22px 16px" }}
            onClick={() => patchUi({ loginMode: "pin", perfilSeleccionadoId: p.id, loginErr: "" })}
          >
            <div className="icon">{p.icono || (p.modulos.includes("permisos") ? "👑" : "👤")}</div>
            <div className="label">{p.nombre}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PerfilPinForm() {
  const { data, ui, patchUi } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [verificando, setVerificando] = useState(false);
  const perfil = data.perfiles.find((p) => p.id === ui.perfilSeleccionadoId);

  const submit = async () => {
    const val = inputRef.current?.value || "";
    if (!perfil || !val || verificando) return;
    setVerificando(true);
    try {
      const res = await fetch("/api/perfiles/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: perfil.id, clave: val }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        const perfilActual: PerfilPublico = { id: perfil.id, nombre: json.nombre, modulos: json.modulos };
        // Si se entró desde la push de "piden hablar con una persona"
        // (/admin?conversacion=<id>, que AppContext deja en
        // conversacionWhatsappSeleccionada), el login lleva derecho a ese
        // hilo en vez de al hub — son 24h de ventana de Meta para contestar,
        // y hoy el promedio de respuesta es de 68 horas. Se respeta igual el
        // permiso de módulo: un perfil sin "mensajes" entra al hub como
        // siempre, aunque le pasen el link.
        const irAMensajes = !!ui.conversacionWhatsappSeleccionada && perfilActual.modulos.includes("mensajes");
        patchUi({ perfilActual, loginMode: null, loginErr: "", view: irAMensajes ? "mensajes" : "hub" });
      } else {
        patchUi({ loginErr: json.error || "Contraseña incorrecta" });
      }
    } catch {
      patchUi({ loginErr: "No se pudo verificar (sin conexión). Intenta de nuevo." });
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="brand">
        <Image src="/logo.png" alt="ZPlash" width={200} height={76} className="brand-logo" />
        <div className="sub">Hola, {perfil ? perfil.nombre : ""}</div>
      </div>
      <div className="pin-box">
        <input
          ref={inputRef}
          type="password"
          maxLength={12}
          placeholder="Contraseña"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <div className="err">{ui.loginErr || ""}</div>
        <button className="btn" onClick={submit} disabled={verificando}>
          {verificando ? "Verificando..." : "Ingresar"}
        </button>
        <button className="btn ghost" onClick={() => patchUi({ loginMode: null, perfilSeleccionadoId: null, loginErr: "" })}>
          Volver
        </button>
      </div>
    </div>
  );
}
