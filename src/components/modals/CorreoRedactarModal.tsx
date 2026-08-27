"use client";

import { useRef, useState } from "react";
import { useAppData } from "@/context/AppContext";
import { fmtFecha, fmtHora } from "@/lib/helpers";
import type { CorreoDetalle } from "@/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import EditorCorreo, { type EditorCorreoHandle } from "@/components/correo/EditorCorreo";
import { Paperclip, Plus, X } from "lucide-react";

const LIMITE_ADJUNTOS_BYTES = 4 * 1024 * 1024; // margen bajo el límite real de payload de Vercel (~4.5MB)

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Citado en la respuesta: se arma desde original.texto (ya extraído por
// mailparser en obtenerCorreo), nunca desde original.html — reinyectar HTML
// ajeno tal cual dentro del editor arriesga romper el parseo de ProseMirror
// si el correo original trae markup exótico (tablas/estilos de newsletters).
function contenidoInicial(original: CorreoDetalle | undefined, firma: string): string {
  const partes = ["<p></p>"];
  if (firma) partes.push(firma);
  if (original) {
    const encabezado = `El ${fmtFecha(original.fecha)} a las ${fmtHora(original.fecha)}, ${escapeHtml(original.de)} &lt;${escapeHtml(original.deEmail)}&gt; escribió:`;
    const citado = escapeHtml(original.texto || "").split("\n").join("<br>");
    partes.push(`<p>${encabezado}</p><blockquote>${citado}</blockquote>`);
  }
  return partes.join("");
}

export default function CorreoRedactarModal({ original }: { original?: CorreoDetalle }) {
  const { data, patchUi } = useAppData();
  const editorRef = useRef<EditorCorreoHandle>(null);
  const [para, setPara] = useState(original?.deEmail || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [mostrarCc, setMostrarCc] = useState(false);
  const [mostrarBcc, setMostrarBcc] = useState(false);
  const [asunto, setAsunto] = useState(original ? (original.asunto.toLowerCase().startsWith("re:") ? original.asunto : `Re: ${original.asunto}`) : "");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");

  const cerrar = () => patchUi({ modal: null });

  const agregarArchivos = (lista: FileList | null) => {
    if (!lista) return;
    setArchivos((prev) => [...prev, ...Array.from(lista)]);
  };

  const quitarArchivo = (i: number) => setArchivos((prev) => prev.filter((_, idx) => idx !== i));

  const enviar = async () => {
    const destinatarios = para.split(",").map((d) => d.trim()).filter(Boolean);
    const html = editorRef.current?.getHTML() || "";
    if (!destinatarios.length || !asunto.trim() || !html || html === "<p></p>") {
      setErr("Completa destinatario, asunto y mensaje");
      return;
    }
    const pesoTotal = archivos.reduce((acc, a) => acc + a.size, 0);
    if (pesoTotal > LIMITE_ADJUNTOS_BYTES) {
      setErr(`Los adjuntos pesan ${fmtTamano(pesoTotal)} en total — el máximo es ${fmtTamano(LIMITE_ADJUNTOS_BYTES)}`);
      return;
    }

    setEnviando(true);
    setErr("");

    const fd = new FormData();
    destinatarios.forEach((d) => fd.append("para", d));
    cc.split(",").map((d) => d.trim()).filter(Boolean).forEach((d) => fd.append("cc", d));
    bcc.split(",").map((d) => d.trim()).filter(Boolean).forEach((d) => fd.append("bcc", d));
    fd.append("asunto", asunto.trim());
    fd.append("html", html);
    if (original?.messageId) fd.append("inReplyTo", original.messageId);
    const referencias = original ? [...original.references, ...(original.messageId ? [original.messageId] : [])] : [];
    referencias.forEach((r) => fd.append("references", r));
    archivos.forEach((a) => fd.append("adjuntos", a));

    try {
      const res = await fetch("/api/correo/enviar", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setErr(json.error || "No se pudo enviar el correo");
        setEnviando(false);
        return;
      }
      cerrar();
    } catch {
      setErr("No se pudo enviar el correo. Verifica tu conexión.");
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{original ? "Responder correo" : "Redactar correo"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="correo-para">Para</Label>
              <div className="flex gap-2 text-xs">
                {!mostrarCc && (
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMostrarCc(true)}>
                    + CC
                  </button>
                )}
                {!mostrarBcc && (
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setMostrarBcc(true)}>
                    + CCO
                  </button>
                )}
              </div>
            </div>
            <Input id="correo-para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="destinatario@correo.com, otro@correo.com" />
          </div>
          {mostrarCc && (
            <div className="grid gap-1.5">
              <Label htmlFor="correo-cc">CC</Label>
              <Input id="correo-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@correo.com" />
            </div>
          )}
          {mostrarBcc && (
            <div className="grid gap-1.5">
              <Label htmlFor="correo-bcc">CCO (copia oculta)</Label>
              <Input id="correo-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="oculto@correo.com" />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="correo-asunto">Asunto</Label>
            <Input id="correo-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Mensaje</Label>
            <EditorCorreo ref={editorRef} contenidoInicial={contenidoInicial(original, data.config.firmaCorreo)} />
          </div>

          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {archivos.map((a, i) => (
                <span key={`${a.name}-${i}`} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
                  <Paperclip size={12} />
                  {a.name} ({fmtTamano(a.size)})
                  <button type="button" onClick={() => quitarArchivo(i)} className="text-muted-foreground hover:text-destructive">
                    <X size={12} />
                  </button>
                </span>
              ))}
              <label className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                <Plus size={12} />
                Adjuntar archivo
                <input type="file" multiple className="hidden" onChange={(e) => agregarArchivos(e.target.files)} />
              </label>
            </div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
