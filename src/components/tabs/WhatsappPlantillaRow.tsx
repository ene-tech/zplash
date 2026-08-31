"use client";

import { useEffect, useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { convertirVariablesMeta, slugMetaTemplate } from "@/lib/helpers/whatsapp";
import { EmojiBar, VariableBar, insertarEnCursor } from "@/components/ui/mensaje-toolbar";
import type { PlantillaWhatsapp } from "@/types";
import { BadgeAprobadoMeta } from "./BadgeAprobadoMeta";

const VARIABLES_DISPONIBLES = [
  "nombre",
  "patente",
  "plan",
  "monto",
  "fechaVencimiento",
  "fechaVencimientoOferta",
  "montoOferta",
  "montoDescuento",
  "montoAPagar",
  "diasValidez",
];

function BotonCopiar({ texto, deshabilitado }: { texto: string; deshabilitado?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <button type="button" className="icon-btn" onClick={copiar} disabled={deshabilitado || !texto}>
      {copiado ? "¡Copiado!" : "Copiar"}
    </button>
  );
}

export function PlantillaRow({ plantilla, puedeBorrar }: { plantilla: PlantillaWhatsapp; puedeBorrar: boolean }) {
  const { data, commit } = useAppData();
  const mensajeRef = useRef<HTMLTextAreaElement>(null);
  const [mensaje, setMensaje] = useState(plantilla.mensaje);
  const [metaNombre, setMetaNombre] = useState(plantilla.metaNombre || "");
  const [metaIdioma, setMetaIdioma] = useState(plantilla.metaIdioma || "es");
  const [metaVariables, setMetaVariables] = useState((plantilla.metaVariables || []).join(", "));
  const [metaAprobado, setMetaAprobado] = useState(plantilla.metaAprobado);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const nombreSugeridoMeta = slugMetaTemplate(metaNombre || plantilla.nombre);
  const { texto: cuerpoMeta, variables: variablesMeta } = convertirVariablesMeta(mensaje);
  // Meta exige el orden posicional pero enviarSegunPlantilla (@/lib/whatsapp/reglas)
  // matchea estas variables contra `variables` case-insensitive, así que acá se
  // guardan siempre en minúsculas — mismo formato separado por coma que espera guardar().
  const metaVariablesAuto = variablesMeta.map((v) => v.toLowerCase()).join(", ");

  // Autorellena metaVariables a partir de las variables detectadas en el mensaje
  // cada vez que este cambia, siempre que el campo no se haya editado a mano y
  // se haya alejado del valor autogenerado anterior (así no pisa una edición
  // manual del admin, ej. si el orden real en Meta quedó distinto).
  const ultimoAutoRef = useRef(metaVariablesAuto);
  useEffect(() => {
    if (metaVariables === ultimoAutoRef.current) setMetaVariables(metaVariablesAuto);
    ultimoAutoRef.current = metaVariablesAuto;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaVariablesAuto]);

  const hayCambios =
    mensaje !== plantilla.mensaje ||
    metaNombre !== (plantilla.metaNombre || "") ||
    metaIdioma !== (plantilla.metaIdioma || "es") ||
    metaVariables !== (plantilla.metaVariables || []).join(", ") ||
    metaAprobado !== plantilla.metaAprobado;

  const guardar = async () => {
    setGuardando(true);
    const variables = metaVariables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const ok = await commit({
      plantillasWhatsapp: data.plantillasWhatsapp.map((p) =>
        p.id === plantilla.id
          ? {
              ...p,
              mensaje,
              metaNombre: metaNombre.trim() || undefined,
              metaIdioma: metaIdioma.trim() || undefined,
              metaVariables: variables.length ? variables : undefined,
              metaAprobado,
            }
          : p
      ),
    });
    setGuardando(false);
    setMsg({ texto: ok ? "Guardado" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const toggleActivo = () => {
    commit({ plantillasWhatsapp: data.plantillasWhatsapp.map((p) => (p.id === plantilla.id ? { ...p, activo: !p.activo } : p)) });
  };

  const borrar = () => {
    commit({ plantillasWhatsapp: data.plantillasWhatsapp.filter((p) => p.id !== plantilla.id) });
  };

  return (
    <div
      className="vehicle-card"
      style={{
        opacity: plantilla.activo ? 1 : 0.6,
        marginBottom: 12,
        background: "var(--bg-card)",
        border: "2px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontWeight: 700 }}>{plantilla.nombre}</div>
        <BadgeAprobadoMeta aprobado={plantilla.metaAprobado} />
      </div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Mensaje</label>
        <EmojiBar onSeleccionar={(emoji) => insertarEnCursor(mensajeRef.current, mensaje, emoji, setMensaje)} />
        <VariableBar
          variables={VARIABLES_DISPONIBLES}
          onSeleccionar={(placeholder) => insertarEnCursor(mensajeRef.current, mensaje, placeholder, setMensaje)}
        />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 11.5, margin: "2px 0 6px" }}>
          <code>{"{{montoDescuento}}"}</code> es lo que se descuenta; <code>{"{{montoAPagar}}"}</code> es el precio final
          que queda por pagar — no son lo mismo, elige el que corresponda al texto (ej. &quot;con $2.000 de descuento&quot;
          vs &quot;te queda en $7.990&quot;). Ambas se llenan solo si la acción de la regla/envío es &quot;Generar
          descuento&quot; con un precio base indicado.
        </div>
        <textarea
          ref={mensajeRef}
          rows={12}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder="Mensaje de WhatsApp"
        />
      </div>
      <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, margin: "0 0 8px" }}>
        Para conectar esta situación a un envío automático (Reglas WhatsApp), indica el template ya aprobado en Meta
        Business Manager:
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
          <label>Nombre del template en Meta</label>
          <input value={metaNombre} onChange={(e) => setMetaNombre(e.target.value)} placeholder="Ej: oferta_retorno" />
        </div>
        <div className="field" style={{ width: 100, margin: 0 }}>
          <label>Idioma</label>
          <input value={metaIdioma} onChange={(e) => setMetaIdioma(e.target.value)} placeholder="es" />
        </div>
      </div>
      <div className="field" style={{ margin: "0 0 8px" }}>
        <label>Variables del template, en orden (separadas por coma)</label>
        <input
          value={metaVariables}
          onChange={(e) => setMetaVariables(e.target.value)}
          placeholder={VARIABLES_DISPONIBLES.join(", ")}
        />
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 11.5, marginTop: 4 }}>
          Se autorellena en minúsculas a partir de las variables <code>{"{{...}}"}</code> del mensaje. Puedes editarlo
          a mano si el orden real en Meta quedó distinto.
        </div>
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Copiar para Meta Business Manager</div>
        <div className="hint" style={{ textAlign: "left", color: "var(--gray)", fontSize: 12, marginBottom: 10 }}>
          Meta exige el nombre del template en minúsculas, sin tildes ni espacios, y las variables numeradas
          (<code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>...). Estos campos se generan solos a partir de lo que
          escribiste arriba: cópialos tal cual y pégalos en el formulario de creación de template en Meta.
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 10, flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 1, minWidth: 160, margin: 0 }}>
            <label>Nombre del template (formato Meta)</label>
            <input readOnly value={nombreSugeridoMeta} />
          </div>
          <BotonCopiar texto={nombreSugeridoMeta} />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMetaNombre(nombreSugeridoMeta)}
            disabled={!nombreSugeridoMeta || metaNombre === nombreSugeridoMeta}
          >
            Usar acá arriba
          </button>
        </div>

        <div className="field" style={{ margin: "0 0 10px" }}>
          <label>Cuerpo del mensaje (variables numeradas)</label>
          <textarea readOnly rows={10} value={cuerpoMeta} style={{ marginBottom: 6 }} />
          <BotonCopiar texto={cuerpoMeta} />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 11.5, color: "var(--gray)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Orden de variables
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="hint" style={{ margin: 0, textAlign: "left" }}>
              {variablesMeta.length
                ? variablesMeta.map((v, i) => `{{${i + 1}}} = ${v}`).join("  ·  ")
                : "Este mensaje no tiene variables {{...}}"}
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setMetaVariables(metaVariablesAuto);
                ultimoAutoRef.current = metaVariablesAuto;
              }}
              disabled={!variablesMeta.length || metaVariables === metaVariablesAuto}
            >
              Usar este orden abajo
            </button>
          </div>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 400, marginBottom: 8 }}>
        <input type="checkbox" checked={metaAprobado} onChange={(e) => setMetaAprobado(e.target.checked)} />
        Confirmo que este template ya está Aprobado en Meta Business Manager
      </label>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn" style={{ marginTop: 0 }} onClick={guardar} disabled={guardando || !hayCambios}>
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button className="icon-btn" onClick={toggleActivo}>
          {plantilla.activo ? "Desactivar" : "Reactivar"}
        </button>
        {puedeBorrar && (
          <button className="icon-btn" onClick={borrar}>
            Borrar
          </button>
        )}
        {msg && <span className="err" style={{ margin: 0, color: msg.ok ? "var(--green)" : undefined }}>{msg.texto}</span>}
      </div>
    </div>
  );
}
