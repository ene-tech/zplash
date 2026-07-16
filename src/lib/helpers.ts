import type { Cliente, ConfigGlobal, Cupon, Ingreso, Modulo, PerfilPublico, PlanStatus, Precios, Servicio, Venta } from "@/types";

export const PLANES = ["Plan Ilimitado Mensual"];
export const DIAS_AVISO_VENCIMIENTO = 7;

export const PRECIOS_DEFAULT: Precios = {
  "Plan Ilimitado Mensual": { normal: 21990, promo: 19990 },
  tapiz: { normal: 39990, promo: 0 },
  alfombra: { normal: 19990, promo: 0 },
  techo: { normal: 19990, promo: 0 },
  motor: { normal: 29990, promo: 0 },
  "chasis-grafitado": { normal: 59990, promo: 0 },
};

/** Precio de un lavado único para clientes sin plan vigente (vencido o sin plan). */
export const PRECIO_LAVADO_UNICO = 9990;

/** Clave usada dentro de Precios para guardar el valor editable del lavado único. */
export const LAVADO_UNICO_KEY = "Lavado único";

/**
 * Precio del plan para quien contrata con renovación automática (Oneclick
 * Mall) desde /pagar — más barato que pagar un período a la vez con Webpay
 * Plus, para incentivar la renovación automática. Es un canal de venta
 * digital aparte y NO tiene relación con `precioPreferencial`/`promo`, que es
 * el descuento de renovación para un cliente físico atendido en el local.
 */
export const PRECIO_PLAN_ONECLICK_DEFAULT = 19990;

/** Clave usada dentro de Precios para guardar el valor editable del plan con renovación automática. */
export const PLAN_ONECLICK_KEY = "Plan Ilimitado Mensual (Renovación Automática)";

export function precioPlanOneclick(precios: Precios): number {
  return (precios[PLAN_ONECLICK_KEY] && precios[PLAN_ONECLICK_KEY].normal) || PRECIO_PLAN_ONECLICK_DEFAULT;
}

/** Monto adicional (sobre el lavado único ya pagado) para convertir la visita de hoy en la contratación del Plan Ilimitado Mensual — promoción ofrecida en el módulo Operador dentro de la primera hora tras el ingreso. */
export const PRECIO_UPGRADE_PLAN_DEFAULT = 12000;

/** Clave usada dentro de Precios para guardar el valor editable del upgrade a plan. */
export const UPGRADE_PLAN_KEY = "Upgrade a Plan Ilimitado";

export function precioUpgradePlan(precios: Precios): number {
  return (precios[UPGRADE_PLAN_KEY] && precios[UPGRADE_PLAN_KEY].normal) || PRECIO_UPGRADE_PLAN_DEFAULT;
}

/** Ventana desde el lavado único dentro de la cual se puede ofrecer el upgrade a plan (ver ventaUpgradeElegible). */
const HORAS_VENTANA_UPGRADE_PLAN = 1;

/**
 * Venta de "Lavado único" del cliente elegible para convertirse en
 * contratación del Plan Ilimitado Mensual vía la promoción de upgrade: la más
 * reciente, y solo si ocurrió hace menos de 1 hora — pasada esa ventana el
 * lavado ya se disfrutó sin plan y la promoción deja de tener sentido.
 */
export function ventaUpgradeElegible(ventas: Venta[], clienteId: string, ahora: Date = new Date()): Venta | undefined {
  const ultima = ventas
    .filter((v) => v.clienteId === clienteId && v.tipo === "Lavado único")
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
  if (!ultima) return undefined;
  const msDesde = ahora.getTime() - new Date(ultima.fecha).getTime();
  if (msDesde > HORAS_VENTANA_UPGRADE_PLAN * 3600 * 1000) return undefined;
  return ultima;
}

/** Datos de la cuenta bancaria de la empresa, mostrados al cliente cuando el operador elige "Transferencia bancaria" como forma de pago. */
export const DATOS_TRANSFERENCIA = [
  { label: "Nombre", valor: "SERVICIOS E INVERSIONES LAS AGUILAS SPA" },
  { label: "RUT", valor: "76.969.928-7" },
  { label: "Cuenta Corriente Banco Santander", valor: "0-000-9448956-3" },
  { label: "Mail", valor: "TB@ZPLASH.CL" },
];

/** Semilla/fallback de catálogo para cuando la tabla `servicios` está vacía o
 * la migración todavía no corrió — mismo patrón que PERFILES_DEFAULT. Mismos
 * ids/nombres/categorías que el antiguo SERVICIOS_ADICIONALES hardcodeado;
 * duracionMinutos queda en 30 como placeholder editable de inmediato desde
 * la pestaña Agenda (no hay dato real de duración por servicio todavía). */
export const SERVICIOS_DEFAULT: Servicio[] = [
  { id: "detailing-pequeno", categoria: "Lavado Completo Detailing", nombre: "Auto Pequeño", duracionMinutos: 30, activo: true },
  { id: "detailing-mediano", categoria: "Lavado Completo Detailing", nombre: "Mediano / SUV / Pick-up", duracionMinutos: 30, activo: true },
  { id: "detailing-xl", categoria: "Lavado Completo Detailing", nombre: "Auto XL", duracionMinutos: 30, activo: true },
  { id: "tapiz", categoria: "Servicios Adicionales", nombre: "Limpieza de Tapiz (2 Corridas de Asientos)", duracionMinutos: 30, activo: true },
  { id: "alfombra", categoria: "Servicios Adicionales", nombre: "Limpieza de Alfombra", duracionMinutos: 30, activo: true },
  { id: "techo", categoria: "Servicios Adicionales", nombre: "Limpieza de Techo", duracionMinutos: 30, activo: true },
  { id: "motor", categoria: "Servicios Adicionales", nombre: "Lavado de Motor", duracionMinutos: 30, activo: true },
  { id: "chasis", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis", duracionMinutos: 30, activo: true },
  { id: "chasis-grafitado", categoria: "Servicios Adicionales", nombre: "Lavado de Chasis + Grafitado", duracionMinutos: 30, activo: true },
];

/** Categoría del catálogo que implica que el vehículo pasa por el túnel.
 * Compartida entre ServiciosAdicionalesView (venta) y OperadorResult
 * (registro físico del ingreso al túnel, ver GLOSA_SERVICIO_DETAILING). */
export const CATEGORIA_DETAILING = "Lavado Completo Detailing";

/** Glosa de Ingreso para un lavado completo/detailing: la venta se hace en
 * Servicios Adicionales, pero el Ingreso (historial de túnel) recién se crea
 * cuando el operador registra la patente en el módulo Operador al llegar el
 * vehículo — no constituye una venta nueva, solo deja constancia del paso
 * físico por el túnel (ver registrarIngresoDetailing en lib/actions.ts). */
export const GLOSA_SERVICIO_DETAILING = "Servicio de Detailing";

/** Semilla/fallback de horario del módulo Operador (ver ConfigGlobal) para
 * cuando la tabla `config` todavía no tiene los nuevos campos guardados —
 * mismo patrón que PRECIOS_DEFAULT/SERVICIOS_DEFAULT. */
export const CONFIG_DEFAULT: ConfigGlobal = {
  horarioOperadorSemanaInicio: "08:25",
  horarioOperadorSemanaFin: "20:15",
  horarioOperadorFindeInicio: "09:55",
  horarioOperadorFindeFin: "19:15",
  festivos: [],
};

export const MODULOS_ADMIN: Modulo[] = [
  "clientes",
  "ingresos",
  "cierre",
  "empresa",
  "empresas_facturacion",
  "perfiles",
  "stats",
  "config",
  "agenda",
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
  agenda: "Agenda",
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
 * dentroDeHorarioOperador) si tiene acceso a Configuración — hoy eso equivale
 * a Administración y Gerencia (ver PERFILES_DEFAULT), sin necesidad de un
 * campo de "rol" aparte. */
export function esExentoHorarioOperador(modulos: Modulo[]): boolean {
  return modulos.includes("config");
}

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

/** Precio vigente de un servicio del catálogo, editable por el administrador desde Configuración; si no se ha guardado uno, es 0. */
export function precioServicio(precios: Precios, servicioId: string): number {
  return (precios[servicioId] && precios[servicioId].normal) || 0;
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

export function sumarDias(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function ymd(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** true si `fecha` cae sábado, domingo, o en la lista de festivos configurada (YYYY-MM-DD). */
export function esFinDeSemanaOFestivo(fecha: Date, festivos: string[]): boolean {
  const dia = fecha.getDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) return true;
  return festivos.includes(ymd(fecha));
}

/** Reempaqueta la hora actual real como si fuera hora local del proceso, pero con
 * los componentes (año/mes/día/hora/minuto) de la zona horaria del negocio
 * (America/Santiago). Así, sin importar en qué TZ corra el servidor (en
 * producción, Node/Vercel suele correr en UTC), `getHours()`/`getDay()`/etc.
 * sobre el resultado devuelven la hora de pared de Chile — necesario para que
 * dentroDeHorarioOperador compare la hora configurada contra la hora real del
 * local y no contra la hora UTC del servidor. */
export function ahoraEnSantiago(): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  // La hora "24" de Intl para medianoche se mapea a 0 en el constructor de Date.
  return new Date(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** true si `ahora` cae dentro del horario configurado para registrar ingresos en el
 * módulo Operador: Lunes a Viernes usa el rango "semana", Sábado/Domingo/festivos usa
 * el rango "finde" (ver ConfigGlobal, configurable en Administrador de Ingresos → Config). */
export function dentroDeHorarioOperador(config: ConfigGlobal, ahora: Date): boolean {
  const finde = esFinDeSemanaOFestivo(ahora, config.festivos);
  const inicio = finde ? config.horarioOperadorFindeInicio : config.horarioOperadorSemanaInicio;
  const fin = finde ? config.horarioOperadorFindeFin : config.horarioOperadorSemanaFin;
  const horaActual = String(ahora.getHours()).padStart(2, "0") + ":" + String(ahora.getMinutes()).padStart(2, "0");
  return horaActual >= inicio && horaActual <= fin;
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string | null | undefined): boolean {
  return EMAIL_REGEX.test((email || "").trim());
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

export function findClient(clientes: Cliente[], plate: string): Cliente | undefined {
  return clientes.find((c) => normPlate(c.patente) === normPlate(plate));
}

/** Si el cliente ya registró un ingreso hoy (para limitar a 1 pasada diaria por plan vigente). */
export function yaIngresoHoy(ingresos: Ingreso[], clienteId: string): boolean {
  const hoy = todayStr();
  return ingresos.some((i) => i.clienteId === clienteId && new Date(i.fecha).toDateString() === hoy);
}

export function ultimoIngresoCliente(ingresos: Ingreso[], clienteId: string): Ingreso | undefined {
  return ingresos
    .filter((i) => i.clienteId === clienteId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];
}

const HORAS_MIN_ENTRE_INGRESOS_PLAN = 24.5;
const HORAS_VENTANA_GARANTIA = 1;

export type EstadoReingresoPlan = "libre" | "garantia" | "bloqueado";

/**
 * Un vehículo con plan solo puede pasar 1 vez cada 24:30 horas. La garantía (repasar
 * el mismo lavado sin cobrar de nuevo) solo se puede hacer efectiva hasta 1 hora
 * después del ingreso anterior; pasada esa hora y hasta que se cumplan las 24:30
 * horas, el reingreso queda bloqueado (ni garantía ni pasada nueva, salvo pagando
 * un lavado único — ver `precioLavadoUnico`).
 */
export function estadoReingresoPlan(ingresos: Ingreso[], clienteId: string, ahora: Date = new Date()): EstadoReingresoPlan {
  const ultimo = ultimoIngresoCliente(ingresos, clienteId);
  if (!ultimo) return "libre";
  const msDesdeUltimo = ahora.getTime() - new Date(ultimo.fecha).getTime();
  if (msDesdeUltimo >= HORAS_MIN_ENTRE_INGRESOS_PLAN * 3600 * 1000) return "libre";
  if (msDesdeUltimo <= HORAS_VENTANA_GARANTIA * 3600 * 1000) return "garantia";
  return "bloqueado";
}

/** Hora a partir de la cual el vehículo vuelve a poder pasar (último ingreso + 24:30). */
export function proximoIngresoPermitido(ingresos: Ingreso[], clienteId: string): Date | undefined {
  const ultimo = ultimoIngresoCliente(ingresos, clienteId);
  if (!ultimo) return undefined;
  return new Date(new Date(ultimo.fecha).getTime() + HORAS_MIN_ENTRE_INGRESOS_PLAN * 3600 * 1000);
}

export function mensajeBloqueoReingreso(ingresos: Ingreso[], clienteId: string): string {
  const proximo = proximoIngresoPermitido(ingresos, clienteId);
  const hora = proximo ? fmtHora(proximo.toISOString()) : "";
  return `VEHICULO HIZO USO DEL SERVICIO TUNEL HACE MENOS DE 24 HORAS. PUEDE REINGRESAR A PARTIR DE LAS ${hora} HRS.`;
}

/** La carga masiva por Excel deja "Sin nombre" quemado cuando la fila no trae nombre. */
export function esNombreVacio(nombre: string | undefined | null): boolean {
  return !nombre || !nombre.trim() || nombre.trim().toLowerCase() === "sin nombre";
}

export function planStatus(c: Pick<Cliente, "vencimiento">): PlanStatus {
  if (!c.vencimiento) return { label: "Sin plan", cls: "bad" };
  // ahoraEnSantiago() en vez de `new Date()`: esta función se llama tanto
  // desde el navegador (hora de Chile) como desde rutas de servidor
  // (/api/pagos/estado, el bot de WhatsApp) que en producción corren en UTC
  // — sin normalizar, un mismo cliente podía verse "Vigente" en la pantalla
  // del operador y "Vencido" en WhatsApp durante varias horas alrededor de
  // la medianoche en Chile (mismo bug que ya se corrigió para el bloqueo
  // horario del módulo Operador, ver dentroDeHorarioOperador).
  const hoy = ahoraEnSantiago();
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

/** Mismo esquema de id usado para ventas en toda la app ("v" + timestamp), envuelto en una función por el mismo motivo que uidIngreso(). */
export function uidVenta(): string {
  return "v" + Date.now();
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
  // Mismo motivo que en planStatus: hora de Chile, no la del entorno donde
  // corre esta función.
  const hoy = ahoraEnSantiago();
  hoy.setHours(0, 0, 0, 0);
  let base = fechaContratacion ? new Date(fechaContratacion) : new Date(hoy);
  if (isNaN(base.getTime())) base = new Date(hoy);
  while (base <= hoy) {
    base.setDate(base.getDate() + 30);
  }
  return base.toISOString();
}
