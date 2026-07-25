"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { TEXTOS_BOT_WHATSAPP_DEFAULT } from "@/lib/helpers";
import type { TextosBotWhatsapp } from "@/types";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import ConfigSection from "@/components/tabs/config/ConfigSection";
import SaveBar from "@/components/tabs/config/SaveBar";

const CAMPOS: { key: keyof TextosBotWhatsapp; label: string; hint?: string }[] = [
  { key: "menuPrincipal", label: "Menú principal (saludo)" },
  { key: "textoContratarPlan", label: "Opción 2 — Quiero contratar el plan" },
  { key: "horarioUbicacion", label: "Opción 3 — Horario y ubicación" },
  { key: "contactoHumano", label: "Opción 4 — Hablar con una persona" },
  { key: "mensajeNoEntendido", label: "Mensaje cuando no se entiende lo escrito" },
  { key: "patenteNoEncontrada", label: "Cuando la patente consultada no existe" },
  {
    key: "textoDescuentoInstrucciones",
    label: "Opción 5 — Instrucciones del descuento de primera vez",
    hint: "Variables disponibles: {{monto}}, {{dias}}",
  },
  { key: "textoDescuentoYaCliente", label: "Descuento — cuando la patente ya es cliente" },
  { key: "textoDescuentoPatenteInvalida", label: "Descuento — cuando la patente escrita no es válida" },
  {
    key: "textoDescuentoConfirmacion",
    label: "Descuento — confirmación con el código generado",
    hint: "Variables disponibles: {{codigo}}, {{monto}}, {{fecha}}",
  },
];

export default function WebSettingsWhatsappBotTab() {
  const { data, commit } = useApp();
  const [valores, setValores] = useState<TextosBotWhatsapp>(() => data.config.textosBotWhatsapp);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

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
        <div key={c.key} className="flex flex-col gap-1.5">
          <Label htmlFor={c.key}>{c.label}</Label>
          {c.hint && <div className="text-xs text-muted-foreground">{c.hint}</div>}
          <Textarea id={c.key} rows={4} value={valores[c.key]} onChange={(e) => setCampo(c.key, e.target.value)} />
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
