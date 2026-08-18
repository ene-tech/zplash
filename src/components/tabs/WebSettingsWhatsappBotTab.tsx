"use client";

import { useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { CONFIG_DEFAULT, TEXTOS_BOT_WHATSAPP_DEFAULT } from "@/lib/helpers";
import type { TextosBotWhatsapp } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmojiBar, VariableBar, insertarEnCursor } from "@/components/ui/mensaje-toolbar";
import { MessageCircle } from "lucide-react";
import ConfigSection from "@/components/tabs/config/ConfigSection";
import SaveBar from "@/components/tabs/config/SaveBar";

type Campo = { key: keyof TextosBotWhatsapp; label: string; hint?: string; variables?: string[] };

// Cada grupo es una opción/mensaje "cabeza" seguida de los mensajes que son
// continuación de ese mismo flujo (pasos siguientes, reintentos, errores,
// confirmación). Se renderizan en una misma fila: la cabeza a la izquierda y
// sus continuaciones a la derecha.
const GRUPOS: Campo[][] = [
  [{ key: "menuPrincipal", label: "Menú principal (saludo)" }],
  [
    {
      key: "textoPreciosPedirTamano",
      label: "Opción 1 — Pregunta el tamaño del vehículo (paso 1)",
      hint: "Antes de cotizar, el bot pregunta el tamaño del auto igual que la web. Solo el encabezado: las 4 opciones (S/M/L/XL con ejemplos) se generan solas.",
    },
    { key: "textoPreciosTamanoInvalido", label: "Opción 1 — repregunta si el tamaño no se entiende (paso 1)" },
    {
      key: "textoPreciosIntro",
      label: "Opción 1 — Precios y servicios (encabezado, paso 2)",
      hint: "Solo el encabezado del mensaje. La lista de precios y servicios que sigue siempre se genera desde los mismos valores que muestra la web, no se puede escribir a mano acá.",
    },
  ],
  [{ key: "textoContratarPlan", label: "Opción 2 — Quiero contratar el plan" }],
  [{ key: "horarioUbicacion", label: "Opción 3 — Horario y ubicación" }],
  [{ key: "contactoHumano", label: "Opción 4 — Hablar con una persona" }],
  [{ key: "mensajeNoEntendido", label: "Mensaje cuando no se entiende lo escrito" }],
  [{ key: "patenteNoEncontrada", label: "Cuando la patente consultada no existe" }],
  [
    {
      key: "textoDescuentoInstrucciones",
      label: "Opción 5 — Bienvenida e inicio del registro (paso 1: pide el nombre)",
      hint: "Variables disponibles: {{monto}}, {{dias}}. Es el primer mensaje del flujo: da la bienvenida y ya invita a responder con el nombre.",
      variables: ["monto", "dias"],
    },
    { key: "textoDescuentoPedirNombre", label: "Descuento — repregunta si el nombre viene vacío (paso 1)" },
    { key: "textoDescuentoPedirPatente", label: "Descuento — pide la patente (paso 2)" },
    { key: "textoDescuentoPatenteInvalida", label: "Descuento — cuando la patente escrita no es válida (paso 2)" },
    { key: "textoDescuentoPedirMail", label: "Descuento — pide el correo (paso 3)" },
    { key: "textoDescuentoMailInvalido", label: "Descuento — cuando el correo escrito no es válido (paso 3)" },
    { key: "textoDescuentoYaCliente", label: "Descuento — cuando el número o la patente ya es cliente" },
    {
      key: "textoDescuentoConfirmacion",
      label: "Descuento — confirmación con el código generado (fin del flujo)",
      hint: "Variables disponibles: {{codigo}}, {{monto}}, {{fecha}}",
      variables: ["codigo", "monto", "fecha"],
    },
  ],
  [
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
    {
      key: "patenteEstadoCambioInvitacion",
      label: "Consulta de patente — invitación a cambiar de patente (fin del mensaje)",
      hint: "Se agrega siempre al final de una consulta de patente exitosa, invitando a escribir 'cambio de patente'.",
    },
  ],
  [
    {
      key: "textoCambioPatenteSinCliente",
      label: "Cambio de patente — cuando se escribe sin haber consultado antes una patente",
    },
    { key: "textoCambioPatentePedirNueva", label: "Cambio de patente — pide la patente nueva" },
    { key: "textoCambioPatenteInvalida", label: "Cambio de patente — cuando la patente escrita no es válida" },
    { key: "textoCambioPatenteEsLaMisma", label: "Cambio de patente — cuando la patente nueva es igual a la actual" },
    { key: "textoCambioPatenteYaExiste", label: "Cambio de patente — cuando la patente nueva ya es de otro cliente" },
    {
      key: "textoCambioPatenteConfirmacion",
      label: "Cambio de patente — confirmación (fin del flujo)",
      hint: "Variables disponibles: {{patente}}. El cambio queda pendiente y se aplica recién cuando el plan renueve al próximo período, igual que la solicitud de cambio de patente desde el módulo Clientes.",
      variables: ["patente"],
    },
  ],
];

export default function WebSettingsWhatsappBotTab() {
  const { data, commit } = useApp();
  const [valores, setValores] = useState<TextosBotWhatsapp>(() => data.config.textosBotWhatsapp);
  const [descuentoValor, setDescuentoValor] = useState(() => String(data.config.descuentoPrimeraVezValor));
  const [descuentoDias, setDescuentoDias] = useState(() => String(data.config.descuentoPrimeraVezDiasValidez));
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const textareaRefs = useRef<Partial<Record<keyof TextosBotWhatsapp, HTMLTextAreaElement | null>>>({});

  const setCampo = (key: keyof TextosBotWhatsapp, value: string) => setValores((v) => ({ ...v, [key]: value }));

  const guardar = async () => {
    const descuentoPrimeraVezValor = Math.max(0, Math.round(Number(descuentoValor) || 0));
    const descuentoPrimeraVezDiasValidez = Math.max(1, Math.round(Number(descuentoDias) || 0));
    setGuardando(true);
    const ok = await commit({
      config: { ...data.config, textosBotWhatsapp: valores, descuentoPrimeraVezValor, descuentoPrimeraVezDiasValidez },
    });
    setGuardando(false);
    setDescuentoValor(String(descuentoPrimeraVezValor));
    setDescuentoDias(String(descuentoPrimeraVezDiasValidez));
    setMsg({ texto: ok ? "Menú del bot actualizado correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  const restablecer = () => {
    setValores(TEXTOS_BOT_WHATSAPP_DEFAULT);
    setDescuentoValor(String(CONFIG_DEFAULT.descuentoPrimeraVezValor));
    setDescuentoDias(String(CONFIG_DEFAULT.descuentoPrimeraVezDiasValidez));
    setMsg(null);
  };

  return (
    <ConfigSection
      title="Menú del bot de WhatsApp"
      icon={MessageCircle}
      description="Texto que responde automáticamente el bot de WhatsApp. Los números/palabras clave que disparan cada opción (1, 2, 3... o la patente) no se pueden cambiar acá, solo el texto de la respuesta."
    >
      {GRUPOS.map((grupo) => (
        <div key={grupo[0].key} className="flex flex-wrap items-start gap-4">
          {grupo.map((c) => (
            <div key={c.key} className="flex-1 basis-[320px] min-w-[280px] rounded-lg border border-border bg-card p-4 flex flex-col gap-1.5">
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
              {c.key === "textoDescuentoInstrucciones" && (
                <div className="mt-1 flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="descuentoValor">Monto del descuento (CLP)</Label>
                    <Input
                      id="descuentoValor"
                      type="number"
                      min={0}
                      step={1}
                      className="w-32"
                      value={descuentoValor}
                      onChange={(e) => setDescuentoValor(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="descuentoDias">Días de validez del cupón</Label>
                    <Input
                      id="descuentoDias"
                      type="number"
                      min={1}
                      step={1}
                      className="w-32"
                      value={descuentoDias}
                      onChange={(e) => setDescuentoDias(e.target.value)}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground basis-full">
                    Se usan tanto en el texto de arriba ({"{{monto}}"}/{"{{dias}}"}) como en el cupón real que se genera al terminar el registro.
                  </div>
                </div>
              )}
            </div>
          ))}
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
