"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { Mail } from "lucide-react";
import EditorCorreo, { type EditorCorreoHandle } from "@/components/correo/EditorCorreo";
import ConfigSection from "./ConfigSection";
import SaveBar from "./SaveBar";

// Firma que CorreoRedactarModal antepone al cuerpo de un correo nuevo o
// respuesta (ver contenidoInicial ahí) — vive en ConfigGlobal.firmaCorreo,
// mismo mecanismo de guardado que el resto de esta pestaña (commit({config})).
export default function CorreoFirmaSection() {
  const { data, commit } = useAppData();
  const editorRef = useRef<EditorCorreoHandle>(null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);

  const guardar = async () => {
    const firmaCorreo = editorRef.current?.getHTML() || "";
    setGuardando(true);
    const ok = await commit({ config: { ...data.config, firmaCorreo } });
    setGuardando(false);
    setMsg({ texto: ok ? "Firma guardada correctamente" : "No se pudo guardar (sin conexión). Intenta de nuevo.", ok });
  };

  return (
    <ConfigSection
      title="Firma de correo"
      icon={Mail}
      description="Se agrega automáticamente al redactar o responder un correo desde el módulo Correo."
    >
      <EditorCorreo ref={editorRef} contenidoInicial={data.config.firmaCorreo || "<p></p>"} placeholder="Escribe la firma..." />
      <SaveBar saving={guardando} msg={msg} onSave={guardar} label="Guardar firma" />
    </ConfigSection>
  );
}
