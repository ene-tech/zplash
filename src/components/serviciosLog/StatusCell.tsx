"use client";

import { useState } from "react";
import { ESTADOS_CITA, esEstadoFinal, esRetrocesoInvalido } from "@/lib/agenda";
import type { Cita } from "@/types";

// Selector + botón "Cambiar" en vez de aplicar al vuelo con onChange: así el
// cambio de status (incluido el cobro de saldo al pasar a "Retirado") solo
// ocurre cuando el usuario confirma, no con un clic accidental en el select.
export function StatusCell({
  estadoActual,
  onCambiar,
}: {
  estadoActual: Cita["estado"];
  onCambiar: (estado: Cita["estado"]) => void;
}) {
  // No hay un useEffect que resincronice `seleccion` con `estadoActual`: el
  // padre remonta este componente (ver el `key` en el llamador) cada vez que
  // el estado real de la cita cambia por fuera de este control, así que el
  // valor inicial de useState ya queda al día solo.
  const [seleccion, setSeleccion] = useState<Cita["estado"]>(estadoActual);
  const bloqueado = esEstadoFinal(estadoActual);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value as Cita["estado"])}
        disabled={bloqueado}
        style={{ fontSize: 13 }}
      >
        {ESTADOS_CITA.map((e) => (
          <option key={e.valor} value={e.valor} disabled={esRetrocesoInvalido(estadoActual, e.valor)}>
            {e.label}
          </option>
        ))}
      </select>
      {!bloqueado && (
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 0, padding: "4px 10px", fontSize: 12 }}
          disabled={seleccion === estadoActual}
          onClick={() => onCambiar(seleccion)}
        >
          Cambiar
        </button>
      )}
    </div>
  );
}
