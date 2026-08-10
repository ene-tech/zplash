"use client";

import { forwardRef, useImperativeHandle } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
} from "lucide-react";

const TAMANOS_FUENTE = [
  { label: "Normal", value: "" },
  { label: "Pequeño", value: "12px" },
  { label: "Grande", value: "20px" },
  { label: "Muy grande", value: "28px" },
];

export interface EditorCorreoHandle {
  getHTML: () => string;
}

function ToolbarButton({ activo, title, onClick, children }: { activo?: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant={activo ? "secondary" : "ghost"} size="icon-sm" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const agregarEnlace = () => {
    const url = window.prompt("URL del enlace (deja vacío para quitarlo)");
    if (url === null) return;
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 p-1">
      <ToolbarButton title="Negrita" activo={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton title="Cursiva" activo={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton title="Subrayado" activo={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline size={14} />
      </ToolbarButton>
      <ToolbarButton title="Tachado" activo={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough size={14} />
      </ToolbarButton>

      <select
        className="h-7 rounded-md border border-input bg-transparent px-1 text-xs"
        title="Tamaño de letra"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) editor.chain().focus().setFontSize(e.target.value).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
      >
        {TAMANOS_FUENTE.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <input
        type="color"
        title="Color de texto"
        className="h-7 w-7 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
      />
      <ToolbarButton title="Resaltar" activo={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()}>
        <Highlighter size={14} />
      </ToolbarButton>

      <ToolbarButton title="Alinear izquierda" activo={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft size={14} />
      </ToolbarButton>
      <ToolbarButton title="Centrar" activo={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter size={14} />
      </ToolbarButton>
      <ToolbarButton title="Alinear derecha" activo={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight size={14} />
      </ToolbarButton>
      <ToolbarButton title="Justificar" activo={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}>
        <AlignJustify size={14} />
      </ToolbarButton>

      <ToolbarButton title="Lista" activo={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton title="Lista numerada" activo={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={14} />
      </ToolbarButton>
      <ToolbarButton title="Cita" activo={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={14} />
      </ToolbarButton>
      <ToolbarButton title="Enlace" activo={editor.isActive("link")} onClick={agregarEnlace}>
        <LinkIcon size={14} />
      </ToolbarButton>
      <ToolbarButton title="Insertar tabla" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon size={14} />
      </ToolbarButton>

      <ToolbarButton title="Deshacer" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={14} />
      </ToolbarButton>
      <ToolbarButton title="Rehacer" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={14} />
      </ToolbarButton>
    </div>
  );
}

// Editor de texto enriquecido para el compositor de correo (CorreoRedactarModal)
// — expone getHTML() vía ref en vez de un `value` controlado: Tiptap
// recomienda leer el contenido al momento de enviar en vez de sincronizar
// estado externo en cada tecla (evita renders en cascada del editor).
const EditorCorreo = forwardRef<EditorCorreoHandle, { contenidoInicial: string; placeholder?: string }>(function EditorCorreo(
  { contenidoInicial, placeholder },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyleKit.configure({ backgroundColor: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: false } }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: placeholder || "Escribe tu mensaje..." }),
    ],
    content: contenidoInicial,
    immediatelyRender: false,
    editorProps: { attributes: { class: "editor-correo" } },
  });

  useImperativeHandle(ref, () => ({ getHTML: () => editor?.getHTML() || "" }), [editor]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-input">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
});

export default EditorCorreo;
