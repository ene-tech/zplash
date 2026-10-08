"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface OpcionSelect {
  value: string;
  label: string;
  /** Si viene, las opciones se agrupan bajo este título (en el orden en que aparecen). */
  grupo?: string;
}

// El Select de la app no maneja bien "" como valor: "sin elegir" va con un centinela.
const VACIO = "__vacio__";

/** El Select estándar de la app (mismo patrón que los filtros de Clientes:
 * `items` para que el valor elegido muestre su etiqueta y no el id), con un
 * "Elegir…" opcional y grupos. */
export default function SelectFab({
  id,
  value,
  onChange,
  opciones,
  placeholder,
  className = "w-full",
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  opciones: OpcionSelect[];
  /** Texto para "sin elegir"; si no viene, no se ofrece esa opción. */
  placeholder?: string;
  className?: string;
}) {
  const items: Record<string, string> = {};
  if (placeholder) items[VACIO] = placeholder;
  for (const o of opciones) items[o.value] = o.label;

  const grupos: { titulo?: string; opciones: OpcionSelect[] }[] = [];
  for (const o of opciones) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === o.grupo) ultimo.opciones.push(o);
    else grupos.push({ titulo: o.grupo, opciones: [o] });
  }

  return (
    <Select items={items} value={value || (placeholder ? VACIO : value)} onValueChange={(v) => onChange(!v || v === VACIO ? "" : v)}>
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {placeholder && <SelectItem value={VACIO}>{placeholder}</SelectItem>}
        {grupos.map((g, i) =>
          g.titulo ? (
            <SelectGroup key={i}>
              <SelectLabel>{g.titulo}</SelectLabel>
              {g.opciones.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            g.opciones.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))
          )
        )}
      </SelectContent>
    </Select>
  );
}
