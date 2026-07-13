import type { Cliente, Cupon, Ingreso, Modulo, PerfilPublico, PlanStatus, Precios } from "@/types";

export const PLANES = ["Plan Ilimitado Mensual"];
export const DIAS_AVISO_VENCIMIENTO = 7;

export const PRECIOS_DEFAULT: Precios = {
  "Plan Ilimitado Mensual": { normal: 21990, promo: 19990 },
};

/** Precio de un lavado único para clientes sin plan vigente (vencido o sin plan). */
export const PRECIO_LAVADO_UNICO = 9990;

/** Clave usada dentro de Precios para guardar el valor editable del lavado único. */
export const LAVADO_UNICO_KEY = "Lavado único";

/** Datos de la cuenta bancaria de la empresa, mostrados al cliente cuando el operador elige "Transferencia bancaria" como forma de pago. */
export const DATOS_TRANSFERENCIA = [
  { label: "Nombre", valor: "SERVICIOS E INVERSIONES LAS AGUILAS SPA" },
  { label: "RUT", valor: "76.969.928-7" },
  { label: "Cuenta Corriente Banco Santander", valor: "0-000-9448956-3" },
  { label: "Mail", valor: "TB@ZPLASH.CL" },
];

export interface ServicioAdicional {
  id: string;
  categoria: string;
  nombre: string;
  precio: number;
}

export const SERVICIOS_ADICIONALES: ServicioAdicional[] = [
  { id: "detailing-pequeno", categoria: "Lavado Completo Detailing", nombre: "Auto Pequeño", precio: 24990 },
  { id: "detailing-mediano", categoria: "Lavado Completo Detailing", nombre: "Mediano / SUV / Pick-up", precio: 29990 },
  { id: "detailing-xl", categoria: "Lavado Completo Detailing", nombre: "Auto XL", precio: 34990 },
  { id: "tapiz", categoria: "Servicios Adicionales", nombre: "Limpieza de Tapiz (2 Corridas de Asientos)", precio: 39990 },
  { id: "alfombra", categoria: "Servicios Adicionales", nombre: "Limpieza de Alfombra", precio: 19990 },
  { id: "techo", categoria: "Servicios Adicionales", nombre: "Limpieza de Techo", precio: 19990 },
  { id: "motor", categoria: "Servicios Adicionales", nombre: "Lavado de Motor", precio: 29990 },
  { id: "chasis", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis", precio: 39990 },
  { id: "chasis-grafitado", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis + Grafitado", precio: 59990 },
];

export const MODULOS_ADMIN: Modulo[] = [
  "clientes",
  "ingresos",
  "cierre",
  "empresa",
  "empresas_facturacion",
  "perfiles",
  "stats",
  "config",
];
export const TODOS_LOS_MODULOS: Modulo[] = [
  "operador",
  "servicios",
  ...MODULOS_ADMIN,
  "contabilidad",
  "permisos",
];

export const MODULO_LABELS: Record<Modulo, string> = {
  operador: "Operador (validar patente / ingreso)",
  servicios: "Servicios Adicionales",
  clientes: "Clientes",
  ingresos: "Historial de Ingresos",
  cierre: "Cierre de Caja",
  empresa: "B2B/Tickets/Dsctos",
  empresas_facturacion: "Empresas (Facturación)",
  perfiles: "Perfiles",
  stats: "Estadísticas",
  config: "Configuración",
  contabilidad: "Contabilidad",
  permisos: "Permisos (asignar módulos)",
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

/**
 * Estructura del Estado de Resultados (EERR): los 5 grupos de gasto y a qué
 * sección pertenecen (operacional / no operacional) son fijos — vienen del
 * formato de EERR entregado por el usuario y determinan qué suma y qué
 * resta en el reporte. Lo que SÍ es editable son las glosas (categorías)
 * dentro de cada grupo — ver CategoriaGasto en types.ts y la tabla
 * categorias_gasto.
 */
export interface GrupoGastoEERR {
  grupo: string;
  seccion: "operacional" | "no_operacional";
}

export const GRUPOS_GASTO_EERR: GrupoGastoEERR[] = [
  { grupo: "Otros Costos Directos", seccion: "operacional" },
  { grupo: "Gasto de Remuneraciones", seccion: "operacional" },
  { grupo: "Gastos de Administración", seccion: "operacional" },
  { grupo: "Gastos Financieros Bancarios", seccion: "no_operacional" },
  { grupo: "Otros Egresos Fuera de la Explotación", seccion: "no_operacional" },
];

/** Semilla/fallback para cuando la tabla categorias_gasto está vacía o la
 * migración todavía no corrió — mismo patrón que PERFILES_DEFAULT. */
export const CATEGORIAS_GASTO_DEFAULT: { id: string; nombre: string; grupo: string; activa: boolean }[] = [
  { id: "cg-comisiones-por-venta", nombre: "Comisiones por Venta", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-insumos-de-lavado", nombre: "Insumos de Lavado", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-mantencion-maquinarias", nombre: "Mantención de Maquinarias", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-mantencion-instalaciones", nombre: "Mantención de Instalaciones", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-aseo-limpieza", nombre: "Aseo y Limpieza", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-electricidad", nombre: "Gastos de Electricidad", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-agua-potable", nombre: "Gastos de Agua Potable", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-ropa-utiles", nombre: "Ropa y Útiles de Trabajo", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-combustibles", nombre: "Gastos de Combustibles", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-otros-gastos-directos", nombre: "Otros Gastos Directos", grupo: "Otros Costos Directos", activa: true },
  { id: "cg-sueldo-base", nombre: "Sueldo Base", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-gratificacion", nombre: "Gratificación", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-aguinaldos", nombre: "Aguinaldos", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-aporte-patronal", nombre: "Aporte Patronal", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-servicios-terceros", nombre: "Servicios de Terceros", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-vacaciones", nombre: "Vacaciones", grupo: "Gasto de Remuneraciones", activa: true },
  { id: "cg-honorarios-profesionales", nombre: "Honorarios Profesionales", grupo: "Gastos de Administración", activa: true },
  { id: "cg-gastos-notariales", nombre: "Gastos Notariales", grupo: "Gastos de Administración", activa: true },
  { id: "cg-articulos-oficina", nombre: "Gastos y Artículos de Oficina", grupo: "Gastos de Administración", activa: true },
  { id: "cg-publicidad-papeleria", nombre: "Gastos de Publicidad - Papelería", grupo: "Gastos de Administración", activa: true },
  {
    id: "cg-internet-transmision",
    nombre: "Gastos de Internet y Transmisión de Datos",
    grupo: "Gastos de Administración",
    activa: true,
  },
  { id: "cg-fletes-embalajes", nombre: "Fletes y Embalajes", grupo: "Gastos de Administración", activa: true },
  { id: "cg-seguros", nombre: "Seguros", grupo: "Gastos de Administración", activa: true },
  { id: "cg-arriendos", nombre: "Arriendos", grupo: "Gastos de Administración", activa: true },
  { id: "cg-pasajes-peajes", nombre: "Gastos de Pasajes - Peajes", grupo: "Gastos de Administración", activa: true },
  { id: "cg-cafeteria", nombre: "Gastos de Cafetería y Similares", grupo: "Gastos de Administración", activa: true },
  { id: "cg-seguridad", nombre: "Gastos en Seguridad", grupo: "Gastos de Administración", activa: true },
  { id: "cg-gastos-bancarios", nombre: "Gastos Bancarios", grupo: "Gastos Financieros Bancarios", activa: true },
  {
    id: "cg-costo-venta-activos-fijos",
    nombre: "Costo de Venta por Enajenación de Activos Fijos",
    grupo: "Otros Egresos Fuera de la Explotación",
    activa: true,
  },
];

/** Grupo de una categoría de gasto ya cargada; si no calza con ninguna
 * conocida (dato antiguo, o la categoría fue borrada) cae en "Otros Costos
 * Directos" para no perder el monto del EERR. */
export function categoriaAGrupo(categorias: { nombre: string; grupo: string }[], nombre: string): string {
  return categorias.find((c) => c.nombre === nombre)?.grupo || "Otros Costos Directos";
}

/** Clave "YYYY-MM" de una fecha ISO, usada para filtrar movimientos por mes. */
export function mesKey(fecha: string): string {
  const d = new Date(fecha);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function mesActualKey(): string {
  return mesKey(new Date().toISOString());
}

export function fmtCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function precioNormal(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].normal) || 0;
}

export function precioPreferencial(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].promo) || 0;
}

/** Precio vigente del lavado único, editable por el administrador; si no se ha guardado uno, usa el valor por defecto. */
export function precioLavadoUnico(precios: Precios): number {
  return (precios[LAVADO_UNICO_KEY] && precios[LAVADO_UNICO_KEY].normal) || PRECIO_LAVADO_UNICO;
}

/** Precio vigente de un servicio adicional, editable por el administrador; si no se ha guardado uno, usa el precio de catálogo. */
export function precioServicioAdicional(precios: Precios, servicio: ServicioAdicional): number {
  return (precios[servicio.id] && precios[servicio.id].normal) || servicio.precio;
}

export function todayYMD(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function todayStr(): string {
  return new Date().toDateString();
}

function ymd(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Primer día del mes actual, en formato YYYY-MM-DD. */
export function primerDiaMesActualYMD(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Rango { desde, hasta } (YYYY-MM-DD) del mes calendario anterior al actual. */
export function mesPasadoRango(): { desde: string; hasta: string } {
  const d = new Date();
  return {
    desde: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    hasta: ymd(new Date(d.getFullYear(), d.getMonth(), 0)),
  };
}

export function inRange(iso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const start = new Date(desde + "T00:00:00");
  const end = new Date(hasta + "T23:59:59.999");
  return d >= start && d <= end;
}

export function fmtDate(d: string): string {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
  );
}

export function fmtFecha(d: string): string {
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtHora(d: string): string {
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

export function normPlate(p: string | null | undefined): string {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Patente chilena: 6 caracteres, formato antiguo (2 letras + 4 números) o nuevo (4 letras + 2 números).
const PATENTE_REGEX = /^([A-Z]{2}[0-9]{4}|[A-Z]{4}[0-9]{2})$/;

export function isValidPatente(p: string | null | undefined): boolean {
  return PATENTE_REGEX.test(normPlate(p));
}

export const PATENTE_FORMATO_MSG =
  "Patente inválida. Debe tener 6 caracteres: 2 letras + 4 números (ej. AB1234) o 4 letras + 2 números (ej. ABCD12).";

export function limpiarRut(rut: string | null | undefined): string {
  return (rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Normaliza un RUT a formato canónico: separador de miles con puntos y dígito verificador al final tras un guion. */
export function formatRut(rut: string | null | undefined): string {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoConPuntos}-${dv}`;
}

const RUT_REGEX = /^\d{1,3}(\.\d{3})*-[0-9K]$/;

export function isValidRut(rut: string | null | undefined): boolean {
  return RUT_REGEX.test(formatRut(rut));
}

export const RUT_FORMATO_MSG =
  "RUT inválido. Debe llevar separador de miles y el dígito verificador al final separado por un guion (ej. 12.345.678-9).";

/**
 * Estandariza un celular chileno a +569XXXXXXXX detectando las variantes más
 * comunes de carga: ya viene completo (con o sin "+", con espacios/guiones),
 * viene sin el "56" (9XXXXXXXX), o viene solo el número sin "9" ni "56"
 * (XXXXXXXX). Un "0" inicial (costumbre de marcar desde fijo) se descarta
 * antes de evaluar el patrón. Si no calza con ninguno (fijo, otro país,
 * dígitos de más/menos) se devuelve el original intacto para no perder el
 * dato — queda marcado como inválido por isValidTelefono para revisión manual.
 */
export function formatTelefono(tel: string | null | undefined): string {
  const original = (tel || "").trim();
  if (!original) return "";
  const d = original.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 11 && d.startsWith("569")) return "+" + d;
  if (d.length === 9 && d.startsWith("9")) return "+56" + d;
  if (d.length === 8) return "+569" + d;
  return original;
}

const TELEFONO_REGEX = /^\+569\d{8}$/;

export function isValidTelefono(tel: string | null | undefined): boolean {
  if (!tel || !tel.trim()) return true; // el teléfono es opcional
  return TELEFONO_REGEX.test(formatTelefono(tel));
}

export const TELEFONO_FORMATO_MSG =
  "Teléfono inválido. Debe ser un celular chileno: +569 seguido de 8 dígitos (ej. +56912345678).";

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

export function findClient(clientes: Cliente[], plate: string): Cliente | undefined {
  return clientes.find((c) => normPlate(c.patente) === normPlate(plate));
}

/** Si el cliente ya registró un ingreso hoy (para limitar a 1 pasada diaria por plan vigente). */
export function yaIngresoHoy(ingresos: Ingreso[], clienteId: string): boolean {
  const hoy = todayStr();
  return ingresos.some((i) => i.clienteId === clienteId && new Date(i.fecha).toDateString() === hoy);
}

/** La carga masiva por Excel deja "Sin nombre" quemado cuando la fila no trae nombre. */
export function esNombreVacio(nombre: string | undefined | null): boolean {
  return !nombre || !nombre.trim() || nombre.trim().toLowerCase() === "sin nombre";
}

export function planStatus(c: Pick<Cliente, "vencimiento">): PlanStatus {
  if (!c.vencimiento) return { label: "Sin plan", cls: "bad" };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(c.vencimiento);
  if (venc < hoy) return { label: "Vencido", cls: "bad" };
  const diff = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
  if (diff <= DIAS_AVISO_VENCIMIENTO) return { label: "Por vencer", cls: "warn", diasRestantes: diff };
  return { label: "Vigente", cls: "ok" };
}

export function tipoIngreso(i: Ingreso): { label: string; cls: "ok" | "warn" | "bad" } {
  if (i.glosa) return { label: i.glosa, cls: "ok" };
  if (i.viaCupon) return { label: "Cupón", cls: "warn" };
  if (i.esGarantia) return { label: "Garantía", cls: "warn" };
  if (i.planEstadoAlIngreso === "bad") return { label: fmtCLP(PRECIO_LAVADO_UNICO), cls: "bad" };
  return { label: "Ingreso por plan", cls: "ok" };
}

/** Alfabeto sin 0/O ni 1/I para evitar confusiones al leer o tipear el código. */
const ALFABETO_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generarCodigoCupon(existentes: Set<string>): string {
  let codigo: string;
  do {
    codigo = Array.from({ length: 6 }, () => ALFABETO_CUPON[Math.floor(Math.random() * ALFABETO_CUPON.length)]).join("");
  } while (existentes.has(codigo));
  return codigo;
}

/** Valida un código de descuento (tipo "descuento") para una patente dada, antes de aplicarlo a una venta.
 * Si el cupón no tiene patenteAsignada, es "abierto": lo puede usar cualquier patente. */
export function resolverDescuento(
  codigoCrudo: string,
  patente: string,
  cupones: Cupon[]
): { ok: true; cupon: Cupon } | { ok: false; msg: string } {
  const codigo = codigoCrudo.trim().toUpperCase();
  const cupon = cupones.find((c) => c.codigo === codigo);
  if (!cupon) return { ok: false, msg: "Código de descuento no encontrado" };
  if (cupon.tipo !== "descuento") return { ok: false, msg: "Este código no es un descuento válido" };
  if (cupon.usado) return { ok: false, msg: "Este descuento ya fue usado" };
  if (new Date(cupon.fechaCaducidad) < new Date()) return { ok: false, msg: "Este descuento está caducado" };
  if (cupon.patenteAsignada && cupon.patenteAsignada !== patente) {
    return { ok: false, msg: "Este descuento fue asignado a otra patente" };
  }
  return { ok: true, cupon };
}

/** Monto a descontar del precio base: si el cupón es de porcentaje, se calcula sobre precioBase; si no, es el monto fijo. */
export function montoDescuento(cupon: Cupon, precioBase: number): number {
  return cupon.esPorcentaje ? Math.round((precioBase * cupon.valor) / 100) : cupon.valor;
}

export function uid(): string {
  return "c" + Date.now() + Math.floor(Math.random() * 1000);
}

/** Mismo esquema de id usado para ingresos en toda la app ("i" + timestamp), envuelto en una función para no llamar Date.now() directo desde un componente (ver react-hooks/purity). */
export function uidIngreso(): string {
  return "i" + Date.now();
}

/** 30 days from now, as an ISO string. Kept outside component bodies since it is not a pure computation. */
export function vencimientoPorDefectoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

/**
 * Próximo vencimiento manteniendo el ciclo mensual anclado a la fecha de
 * contratación original (avanza de 30 en 30 días desde ahí), en vez de
 * reiniciar el ciclo desde la fecha en que el operador renueva manualmente
 * un cliente Web cuyo pago automático falló.
 */
export function vencimientoAnclado(fechaContratacion: string | null | undefined): string {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let base = fechaContratacion ? new Date(fechaContratacion) : new Date(hoy);
  if (isNaN(base.getTime())) base = new Date(hoy);
  while (base <= hoy) {
    base.setDate(base.getDate() + 30);
  }
  return base.toISOString();
}
