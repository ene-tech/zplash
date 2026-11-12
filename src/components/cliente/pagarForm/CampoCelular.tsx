"use client";

import { isValidTelefono, TELEFONO_FORMATO_MSG, telefonoTipeado } from "@/lib/helpers";

// Arranca en "+569" para que el cliente escriba solo los 8 dígitos, igual que
// el formulario del mesón (ver OperadorNotFoundResult).
export const CELULAR_INICIAL = "+569";

/** Mismo criterio que telefonoDeCompra en el servidor: obligatorio y celular
 * chileno. Devuelve el mensaje de error, o "" si está bien. */
export function errorCelular(valor: string): string {
  const tipeado = telefonoTipeado(valor);
  if (!tipeado) return "Ingresa tu celular: lo usamos para reconocerte si nos escribes por WhatsApp.";
  return isValidTelefono(tipeado) ? "" : TELEFONO_FORMATO_MSG;
}

// Celular obligatorio de las compras web: sin él, el cliente que después
// escribe por WhatsApp no queda asociado a su auto (el bot busca la ficha por
// clientes.telefono).
export function CampoCelular({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ marginTop: 14 }}>
      <label>Celular (WhatsApp) *</label>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+569 1234 5678"
      />
    </div>
  );
}
