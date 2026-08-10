import { memo } from "react";
import { fmtFecha, fmtHora, tipoIngreso } from "@/lib/helpers";
import type { Ingreso } from "@/types";

// Fila memoizada por la misma razón que ClienteRow (ver
// @/components/tabs/clientes/ClienteRow): `filtered` cambia de referencia en
// cada tecla del buscador, pero los objetos Ingreso que ya pasaban el filtro
// siguen siendo los mismos — sin memo, React repintaba hasta 4000+ filas por
// cada tecla aunque casi ninguna hubiera cambiado.
export const IngresoRow = memo(function IngresoRow({
  ingreso: i,
  puedeBorrar,
  onBorrar,
}: {
  ingreso: Ingreso;
  puedeBorrar: boolean;
  onBorrar: (i: Ingreso) => void;
}) {
  const tipo = tipoIngreso(i);
  return (
    <tr>
      <td>{fmtFecha(i.fecha)}</td>
      <td>{fmtHora(i.fecha)}</td>
      <td className="plate-tag">{i.patente}</td>
      <td>{i.nombre}</td>
      <td>{i.creadoPor || "-"}</td>
      <td>
        <span className={`status-pill ${tipo.cls}`}>{tipo.label}</span>
      </td>
      {puedeBorrar && (
        <td>
          <button className="icon-btn" onClick={() => onBorrar(i)}>
            Eliminar
          </button>
        </td>
      )}
    </tr>
  );
});
