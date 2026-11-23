import { formatoPatente, normPlate } from "@/lib/helpers";

// Patente dibujada como la placa chilena (fondo blanco, letras negras,
// separada AB·CD·12) en todo lo que ve el cliente: portal, /pagar y la app,
// que carga el mismo portal. El panel interno sigue con .plate-tag, que pinta
// el estado del plan con el color de la patente.
export default function Patente({ patente, grande = false }: { patente: string; grande?: boolean }) {
  return (
    <span className={grande ? "patente-cl grande" : "patente-cl"} aria-label={`Patente ${normPlate(patente)}`}>
      {formatoPatente(patente)}
    </span>
  );
}
