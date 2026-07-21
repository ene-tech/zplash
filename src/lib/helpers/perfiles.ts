import type { Modulo, PerfilPublico } from "@/types";

export const MODULOS_ADMIN: Modulo[] = [
  "clientes",
  "suscripciones",
  "ingresos",
  "cierre",
  "empresa",
  "empresas_facturacion",
  "perfiles",
  "stats",
  "config",
  "agenda",
];
// "web_settings" queda fuera de MODULOS_ADMIN a propósito: ese array es lo
// que reciben por defecto los perfiles admin "genéricos" (ver Evelyn en
// PERFILES_DEFAULT), y los precios de venta web deben quedar reservados a
// Gerencia por defecto. Sigue siendo un módulo asignable como cualquier
// otro (aparece en el checklist de PerfilesTab vía TODOS_LOS_MODULOS), solo
// que nadie más lo recibe de fábrica.
export const TODOS_LOS_MODULOS: Modulo[] = [
  "operador",
  "servicios",
  ...MODULOS_ADMIN,
  "contabilidad",
  "permisos",
  "web_settings",
  "inventario",
];

export const MODULO_LABELS: Record<Modulo, string> = {
  operador: "Operador (validar patente / ingreso)",
  servicios: "Servicios Adicionales",
  clientes: "Clientes",
  suscripciones: "Suscripciones",
  ingresos: "Historial de Ingresos",
  cierre: "Cierre de Caja",
  empresa: "B2B/Tickets/Dsctos",
  empresas_facturacion: "Empresas (Facturación)",
  perfiles: "Perfiles",
  stats: "Estadísticas",
  config: "Configuración",
  contabilidad: "Contabilidad",
  permisos: "Permisos (asignar módulos)",
  agenda: "Agenda",
  web_settings: "Web Settings (precios de venta web)",
  inventario: "Inventario",
};

/** Identidades por defecto para un entorno nuevo sin filas en `perfiles`
 * (sin contraseña real: eso ahora solo vive en el servidor una vez creado
 * el perfil). Gerencia es el único con "permisos": puede asignar módulos y
 * resetear la clave de cualquiera. */
export const PERFILES_DEFAULT: PerfilPublico[] = [
  { id: "p1", nombre: "Christian", modulos: ["operador", "servicios"] },
  { id: "p2", nombre: "Verónica", modulos: ["operador", "servicios"] },
  { id: "p3", nombre: "Patricio", modulos: ["operador", "servicios"] },
  { id: "p4", nombre: "Emilio", modulos: ["operador", "servicios"] },
  { id: "p5", nombre: "Evelyn", modulos: ["operador", "servicios", ...MODULOS_ADMIN] },
  { id: "p6", nombre: "Jota", modulos: ["operador", "servicios"] },
  { id: "p7", nombre: "Gerencia", modulos: TODOS_LOS_MODULOS },
];

/** Un perfil queda exento del bloqueo horario del módulo Operador (ver
 * dentroDeHorarioOperador) si tiene acceso a Configuración, o si es el
 * perfil "Administración" — que puede no tener módulos de administrador
 * asignados (solo Operador) y aun así necesita poder registrar ingresos
 * fuera de horario. No hay un campo de "rol" aparte, así que se matchea por
 * nombre exacto de perfil. */
export function esExentoHorarioOperador(modulos: Modulo[], nombre?: string): boolean {
  return modulos.includes("config") || nombre === "Administración";
}

/** El perfil "Gerencia" puede guardar un cliente sin que los campos cumplan
 * el formato esperado (patente, teléfono, RUT, email de factura): siempre
 * puede dar a "Guardar" (ver ClientModal y el backstop en upsertClientes).
 * Nombre y patente no vacíos siguen siendo obligatorios porque son columnas
 * NOT NULL de "clientes" (patente además UNIQUE) — sin eso el guardado
 * fallaría igual a nivel de base de datos. Se matchea por nombre exacto de
 * perfil, mismo criterio que esExentoHorarioOperador. */
export function esExentoFormatoCliente(nombre?: string): boolean {
  return nombre === "Gerencia";
}

/** Solo el perfil "Gerencia" puede borrar una categoría de producto o de
 * insumo (ver CategoriasProductoTab/CategoriasInsumoTab y el backstop en
 * deleteCategoriasProducto/deleteCategoriasInsumo en @/lib/db) — el resto de
 * los perfiles con acceso a Inventario solo puede desactivarlas. Se matchea
 * por nombre exacto de perfil, mismo criterio que esExentoFormatoCliente. */
export function puedeBorrarCategoriaInventario(nombre?: string): boolean {
  return nombre === "Gerencia";
}

/** "Administración" y "Gerencia" pueden dar ingreso a un cliente desde el
 * módulo Operador aunque el teléfono o el email no estén completos/válidos
 * (ver registroIncompleto en OperadorResult): el resto de los perfiles
 * necesita esos datos completos antes de poder registrar el lavado. Nombre
 * no vacío sigue siendo obligatorio porque es columna NOT NULL de
 * "clientes". Mismo criterio de perfiles que esExentoHorarioOperador. */
export function esExentoValidacionRegistroOperador(modulos: Modulo[], nombre?: string): boolean {
  return esExentoHorarioOperador(modulos, nombre);
}

/** "Administración" y "Gerencia" pueden dar ingreso a un vehículo desde el
 * módulo Operador aunque el cliente ya haya pasado por el túnel hace menos
 * de 24:30 horas (estado "bloqueado" de estadoReingresoPlan, ver
 * ingresos.ts): el resto de los perfiles solo puede hacerlo pagando un
 * lavado único (botón "Comprar lavado ... e ingresar de todas formas" en
 * OperadorResult). Mismo criterio de perfiles que esExentoHorarioOperador. */
export function esExentoBloqueoReingreso(modulos: Modulo[], nombre?: string): boolean {
  return esExentoHorarioOperador(modulos, nombre);
}

// Orden de la pantalla de login y de la pestaña Perfiles: los operadores van
// primero (alfabético), y los perfiles de gestión quedan fijos al final en
// este orden — "Administración" y luego "Gerencia" — sin importar dónde caigan
// alfabéticamente.
const ORDEN_ESPECIAL_PERFIL: Record<string, number> = {
  Administración: 1,
  Gerencia: 2,
};

export function ordenarPerfiles(perfiles: PerfilPublico[]): PerfilPublico[] {
  return [...perfiles].sort((a, b) => {
    const pa = ORDEN_ESPECIAL_PERFIL[a.nombre] || 0;
    const pb = ORDEN_ESPECIAL_PERFIL[b.nombre] || 0;
    if (pa !== pb) return pa - pb;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}
