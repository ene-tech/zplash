import { uid } from "@/lib/helpers";
import type { AccionFiltroCorreo, CampoFiltroCorreo, OperadorFiltroCorreo, ReglaFiltroCorreo } from "@/types";

export const CAMPOS: { value: CampoFiltroCorreo; label: string }[] = [
  { value: "de", label: "Remitente (De)" },
  { value: "para", label: "Destinatario (Para)" },
  { value: "asunto", label: "Asunto" },
];

export const OPERADORES: { value: OperadorFiltroCorreo; label: string }[] = [
  { value: "contiene", label: "contiene" },
  { value: "no_contiene", label: "no contiene" },
];

export const ACCIONES: { value: AccionFiltroCorreo; label: string }[] = [
  { value: "mover", label: "Mover a carpeta" },
  { value: "eliminar", label: "Mover a Papelera" },
  { value: "marcar_leido", label: "Marcar como leído" },
];

export function reglaVacia(): ReglaFiltroCorreo {
  return {
    id: uid(),
    nombre: "",
    activa: true,
    combinador: "todas",
    condiciones: [{ campo: "de", operador: "contiene", valor: "" }],
    accion: "mover",
    detenerEvaluacion: true,
  };
}

export function resumenRegla(r: ReglaFiltroCorreo): string {
  const nexo = r.combinador === "todas" ? " Y " : " O ";
  const cond = r.condiciones
    .map((c) => `${CAMPOS.find((x) => x.value === c.campo)?.label} ${c.operador === "contiene" ? "contiene" : "no contiene"} "${c.valor}"`)
    .join(nexo);
  const accion = r.accion === "mover" ? `mover a "${r.carpetaDestino || "?"}"` : r.accion === "eliminar" ? "mover a Papelera" : "marcar leído";
  return `Si ${cond || "(sin condiciones)"} → ${accion}`;
}
