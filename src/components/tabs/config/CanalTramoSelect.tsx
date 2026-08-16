"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CanalTramoPromo } from "@/types";

// Mismas etiquetas que el filtro de origen de Clientes (ver ORIGENES en
// ClientesTab), y por el mismo motivo el mapa se le pasa como `items` al
// Select: sin él Base UI no resuelve la etiqueta del valor elegido y el
// trigger muestra el value crudo ("AMBOS" en vez de "Web y Local").
const CANALES: Record<string, string> = {
  AMBOS: "Web y Local",
  WEB: "Solo Web",
  LOCAL: "Solo Local",
};

/**
 * Canal habilitado en un tramo de promoción (ver CanalTramoPromo y
 * canalTramo en @/lib/helpers/precios) — compartido por las dos escalas de
 * precio de Configuración: renovación anticipada (PlanesSection) y
 * reactivación de plan vencido (ReactivacionSection).
 */
export default function CanalTramoSelect({
  value,
  onChange,
}: {
  value: CanalTramoPromo | undefined;
  onChange: (canal: CanalTramoPromo) => void;
}) {
  return (
    <Select items={CANALES} value={value ?? "AMBOS"} onValueChange={(v) => v && onChange(v as CanalTramoPromo)}>
      <SelectTrigger className="w-[140px] shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(CANALES).map(([valor, etiqueta]) => (
          <SelectItem key={valor} value={valor}>
            {etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
