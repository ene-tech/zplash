"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

// Mismo color para la misma etiqueta en todos los chats, sin guardarlo: se
// saca del texto.
const COLORES = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
];

export function colorEtiqueta(etiqueta: string): string {
  let h = 0;
  for (const ch of etiqueta.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

export function ChipEtiqueta({ etiqueta, onQuitar }: { etiqueta: string; onQuitar?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${colorEtiqueta(etiqueta)}`}>
      {etiqueta}
      {onQuitar && (
        <button
          type="button"
          onClick={onQuitar}
          className="-mr-1 rounded-full p-0.5 opacity-70 hover:opacity-100"
          aria-label={`Quitar etiqueta ${etiqueta}`}
          title="Quitar (tema resuelto)"
        >
          <X size={11} />
        </button>
      )}
    </span>
  );
}

// Etiquetas del chat abierto: agregar (con sugerencias de las que ya se usan
// en otros chats, para no escribir "reembolso" y "Reembolso") y quitar.
export function EtiquetasChat({
  etiquetas,
  sugerencias,
  onCambiar,
}: {
  etiquetas: string[];
  sugerencias: string[];
  onCambiar: (etiquetas: string[]) => void;
}) {
  const [agregando, setAgregando] = useState(false);
  const [texto, setTexto] = useState("");

  const agregar = () => {
    const nueva = texto.trim();
    setTexto("");
    setAgregando(false);
    if (!nueva) return;
    // Si ya existe con otra mayúscula, se usa la que ya está.
    const existente = sugerencias.find((s) => s.toLowerCase() === nueva.toLowerCase()) ?? nueva;
    if (etiquetas.some((e) => e.toLowerCase() === existente.toLowerCase())) return;
    onCambiar([...etiquetas, existente]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {etiquetas.map((e) => (
        <ChipEtiqueta key={e} etiqueta={e} onQuitar={() => onCambiar(etiquetas.filter((x) => x !== e))} />
      ))}
      {agregando ? (
        <>
          <input
            autoFocus
            list="etiquetas-chat-sugerencias"
            value={texto}
            maxLength={30}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={agregar}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              } else if (e.key === "Escape") {
                setTexto("");
                setAgregando(false);
              }
            }}
            placeholder="Ej: reembolso"
            className="h-6 w-32 rounded-full border border-border bg-background px-2 text-[11px] outline-none focus:border-ring"
          />
          <datalist id="etiquetas-chat-sugerencias">
            {sugerencias
              .filter((s) => !etiquetas.includes(s))
              .map((s) => (
                <option key={s} value={s} />
              ))}
          </datalist>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <Plus size={11} />
          Etiqueta
        </button>
      )}
    </div>
  );
}
