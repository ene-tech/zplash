"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { TEXTOS_BOT_WHATSAPP_DEFAULT } from "@/lib/helpers";
import { subirImagenBotWhatsapp } from "@/lib/db";
import type { ConfigGlobal, TextosBotWhatsapp } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmojiBar, VariableBar, insertarEnCursor } from "@/components/ui/mensaje-toolbar";
import { MessageCircle } from "lucide-react";
import ConfigSection from "@/components/tabs/config/ConfigSection";
import SaveBar from "@/components/tabs/config/SaveBar";

const IMAGEN_DEFAULT: Record<"precios" | "plan", string> = {
  precios: "/servicios-precios.jpg",
  plan: "/plan-mensual.jpg",
};

function ImagenBotWhatsapp({ clave, campo, label }: { clave: "precios" | "plan"; campo: keyof ConfigGlobal; label: string }) {
  const { data, commit } = useApp();
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const actual = (data.config[campo] as string | undefined) || IMAGEN_DEFAULT[clave];

  const subir = async (file: File) => {
    setSubiendo(true);
    const url = await subirImagenBotWhatsapp(clave, file);
    setSubiendo(false);
    if (!url) {
      setMsg({ texto: "No se pudo subir la imagen. Intenta de nuevo.", ok: false });
      return;
    }
    const ok = await commit({ config: { ...data.config, [campo]: url } });
    setMsg({ texto: ok ? "Imagen actualizada" : "Se subió la imagen pero no se pudo guardar. Intenta de nuevo.", ok });
  };

  const restablecer = async () => {
    const ok = await commit({ config: { ...data.config, [campo]: undefined } });
    setMsg({ texto: ok ? "Se restableció la imagen de fábrica" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3 flex-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={actual} alt={label} style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8 }} />
        <input type="file" accept="image/*" disabled={subiendo} onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) subir(file);
        }} />
        <Button type="button" variant="outline" size="sm" onClick={restablecer} disabled={subiendo || !data.config[campo]}>
          Usar imagen de fábrica
        </Button>
        {subiendo && <span className="text-xs text-muted-foreground">Subiendo...</span>}
        {msg && <span className={`text-xs ${msg.ok ? "text-green-600" : "text-destructive"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}

const CAMPOS: { key: keyof TextosBotWhatsapp; label: string; hint?: string; variables?: string[] }[] = [
  { key: "menuPrincipal", label: "Menú principal (saludo)" },
  {
    key: "textoPreciosIntro",
    label: "Opción 1 — Precios y servicios (encabezado)",
    hint: "Solo el encabezado del mensaje. La lista de precios y servicios que sigue siempre se genera desde los valores reales (pestaña Precios/Servicios), no se puede escribir a mano acá.",
  },
  { key: "textoContratarPlan", label: "Opción 2 — Quiero contratar el plan" },
  { key: "horarioUbicacion", label: "Opción 3 — Horario y ubicación" },
  { key: "contactoHumano", label: "Opción 4 — Hablar con una persona" },
  { key: "mensajeNoEntendido", label: "Mensaje cuando no se entiende lo escrito" },
  { key: "patenteNoEncontrada", label: "Cuando la patente consultada no existe" },
  {
    key: "textoDescuentoInstrucciones",
    label: "Opción 5 — Instrucciones del descuento de primera vez",
    hint: "Variables disponibles: {{monto}}, {{dias}}",
    variables: ["monto", "dias"],
  },
  { key: "textoDescuentoYaCliente", label: "Descuento — cuando la patente ya es cliente" },
  { key: "textoDescuentoPatenteInvalida", label: "Descuento — cuando la patente escrita no es válida" },
  {
    key: "textoDescuentoConfirmacion",
    label: "Descuento — confirmación con el código generado",
    hint: "Variables disponibles: {{codigo}}, {{monto}}, {{fecha}}",
    variables: ["codigo", "monto", "fecha"],
  },
  {
    key: "patenteEstadoEncabezado",
    label: "Consulta de patente — encabezado",
    hint: "Variables disponibles: {{patente}}, {{nombre}}",
    variables: ["patente", "nombre"],
  },
  {
    key: "patenteEstadoPlan",
    label: "Consulta de patente — línea de plan",
    hint: "Variables disponibles: {{plan}}",
    variables: ["plan"],
  },
  {
    key: "patenteEstadoPlanVacio",
    label: "Consulta de patente — texto cuando el cliente no tiene plan",
    hint: "Reemplaza a {{plan}} en la línea anterior cuando el cliente no tiene un plan asignado.",
  },
  {
    key: "patenteEstadoLinea",
    label: "Consulta de patente — línea de estado",
    hint: "Variables disponibles: {{estado}} (Vigente, Por vencer, Vencido o Sin plan; esta etiqueta no se puede editar).",
    variables: ["estado"],
  },
  {
    key: "patenteEstadoVencimiento",
    label: "Consulta de patente — línea de vencimiento",
    hint: "Variables disponibles: {{fecha}}. Solo se muestra si el cliente tiene fecha de vencimiento.",
    variables: ["fecha"],
  },
  {
    key: "patenteEstadoAvisoPorVencer",
    label: "Consulta de patente — aviso cuando el plan está por vencer",
    hint: "Variables disponibles: {{dias}}. Solo se muestra si el plan vence pronto.",
    variables: ["dias"],
  },
  {
    key: "patenteEstadoAvisoVencido",
    label: "Consulta de patente — aviso cuando el plan está vencido o no existe",
    hint: "Solo se muestra si el plan está vencido o el cliente no tiene plan.",
  },
];

export default function WebSettingsWhatsappBotTab() {
  const { data, commit } = useApp();
  const [valores, setValores] = useState<TextosBotWhatsapp>(() => data.config.textosBotWhatsapp);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const textareaRefs = useRef<Partial<Record<keyof TextosBotWhatsapp, HTMLTextAreaElement | null>>>({});

  const setCampo = (key: keyof TextosBotWhatsapp, value: string) => setValores((v) => ({ ...v, [key]: value }));

  const guardar = async () => {
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, textosBotWhatsapp: valores } });
    setGuardando(false);
    setMsg({ texto: ok ? "Menú del bot actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const restablecer = () => {
    setValores(TEXTOS_BOT_WHATSAPP_DEFAULT);
    setMsg(null);
  };

  return (
    <ConfigSection
      title="Menú del bot de WhatsApp"
      icon={MessageCircle}
      description="Texto que responde automáticamente el bot de WhatsApp. Los números/palabras clave que disparan cada opción (1, 2, 3... o la patente) no se pueden cambiar acá, solo el texto de la respuesta."
    >
      {CAMPOS.map((c) => (
        <div key={c.key}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={c.key}>{c.label}</Label>
            {c.hint && <div className="text-xs text-muted-foreground">{c.hint}</div>}
            <EmojiBar
              onSeleccionar={(emoji) =>
                insertarEnCursor(textareaRefs.current[c.key] || null, valores[c.key], emoji, (v) => setCampo(c.key, v))
              }
            />
            <VariableBar
              variables={c.variables || []}
              onSeleccionar={(placeholder) =>
                insertarEnCursor(textareaRefs.current[c.key] || null, valores[c.key], placeholder, (v) => setCampo(c.key, v))
              }
            />
            <Textarea
              id={c.key}
              ref={(el) => {
                textareaRefs.current[c.key] = el;
              }}
              rows={4}
              value={valores[c.key]}
              onChange={(e) => setCampo(c.key, e.target.value)}
            />
          </div>
          {c.key === "textoPreciosIntro" && (
            <div className="mt-3">
              <ImagenBotWhatsapp clave="precios" campo="imagenPreciosWhatsapp" label="Opción 1 — Imagen adjunta" />
            </div>
          )}
          {c.key === "textoContratarPlan" && (
            <div className="mt-3">
              <ImagenBotWhatsapp clave="plan" campo="imagenPlanWhatsapp" label="Opción 2 — Imagen adjunta" />
            </div>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <SaveBar saving={guardando} msg={msg} onSave={guardar} />
        <Button type="button" variant="outline" onClick={restablecer} disabled={guardando}>
          Restablecer a valores por defecto
        </Button>
      </div>
    </ConfigSection>
  );
}
