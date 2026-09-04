"use server";

import * as dataAccess from "@/lib/dataAccess";
import { tieneModulo } from "@/lib/session";
import type { LibroComentario } from "@/types";

// Lectura del libro de reclamos/sugerencias/felicitaciones para el panel: la
// vista Libro del menú de inicio (sin filtro) y la ficha de cliente (filtrado
// por su email). La escritura no pasa por acá: la hace el propio cliente por
// /api/cliente/libro con su sesión OTP. Gateado por "clientes" porque leer el
// libro es leer lo que los clientes dicen — mismo público que gestiona sus
// fichas.
export async function obtenerLibroComentarios(email?: string): Promise<LibroComentario[]> {
  if (!(await tieneModulo("clientes"))) return [];
  return dataAccess.listarComentariosLibro(email);
}
