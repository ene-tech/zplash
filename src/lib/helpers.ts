import type { Cliente, Ingreso, PlanStatus, Precios } from "@/types";

export const PLANES = ["Plan Ilimitado Mensual"];
export const DIAS_AVISO_VENCIMIENTO = 7;

export const PRECIOS_DEFAULT: Precios = {
  "Plan Ilimitado Mensual": { normal: 21990, promo: 19990 },
};

/** Precio de un lavado único para clientes sin plan vigente (vencido o sin plan). */
export const PRECIO_LAVADO_UNICO = 9990;

/** Clave usada dentro de Precios para guardar el valor editable del lavado único. */
export const LAVADO_UNICO_KEY = "Lavado único";

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

export const OPERADORES_DEFAULT = [
  { id: "op1", nombre: "Christian", clave: "1001" },
  { id: "op2", nombre: "Verónica", clave: "1002" },
  { id: "op3", nombre: "Patricio", clave: "1003" },
  { id: "op4", nombre: "Emilio", clave: "1004" },
  { id: "op5", nombre: "Evelyn", clave: "1005" },
  { id: "op6", nombre: "Jota", clave: "1006" },
  { id: "op7", nombre: "Juan", clave: "1007" },
];

/** Credenciales de ADMINISTRACIÓN por persona. Juan es el gerente: puede
 * cambiar la contraseña de cualquiera; Evelyn solo puede cambiar la suya. */
export const ADMINISTRADORES_DEFAULT = [
  { id: "adm1", nombre: "Evelyn" as const, clave: "1234" },
  { id: "adm2", nombre: "Juan" as const, clave: "5678", esGerente: true },
];

/**
 * Estructura del Estado de Resultados (EERR): cada grupo de gasto pertenece
 * a una sección (operacional / no operacional) y agrupa las glosas
 * seleccionables del formulario de Egresos/Gastos. Basado en el formato de
 * EERR entregado por el usuario (cuentas que suman vs. cuentas que restan).
 */
export interface GastoGrupo {
  grupo: string;
  seccion: "operacional" | "no_operacional";
  categorias: string[];
}

export const GASTO_GRUPOS: GastoGrupo[] = [
  {
    grupo: "Otros Costos Directos",
    seccion: "operacional",
    categorias: [
      "Comisiones por Venta",
      "Insumos de Lavado",
      "Mantención de Maquinarias",
      "Mantención de Instalaciones",
      "Aseo y Limpieza",
      "Gastos de Electricidad",
      "Gastos de Agua Potable",
      "Ropa y Útiles de Trabajo",
      "Gastos de Combustibles",
      "Otros Gastos Directos",
    ],
  },
  {
    grupo: "Gasto de Remuneraciones",
    seccion: "operacional",
    categorias: ["Sueldo Base", "Gratificación", "Aguinaldos", "Aporte Patronal", "Servicios de Terceros", "Vacaciones"],
  },
  {
    grupo: "Gastos de Administración",
    seccion: "operacional",
    categorias: [
      "Honorarios Profesionales",
      "Gastos Notariales",
      "Gastos y Artículos de Oficina",
      "Gastos de Publicidad - Papelería",
      "Gastos de Internet y Transmisión de Datos",
      "Fletes y Embalajes",
      "Seguros",
      "Arriendos",
      "Gastos de Pasajes - Peajes",
      "Gastos de Cafetería y Similares",
      "Gastos en Seguridad",
    ],
  },
  {
    grupo: "Gastos Financieros Bancarios",
    seccion: "no_operacional",
    categorias: ["Gastos Bancarios"],
  },
  {
    grupo: "Otros Egresos Fuera de la Explotación",
    seccion: "no_operacional",
    categorias: ["Costo de Venta por Enajenación de Activos Fijos"],
  },
];

/** Mapa inverso categoría → grupo, para sumar cada egreso registrado dentro
 * del grupo correcto del EERR. Las glosas que no calzan con ninguna
 * categoría conocida (datos antiguos) caen en "Otros Gastos Directos". */
export const CATEGORIA_GASTO_A_GRUPO: Record<string, string> = Object.fromEntries(
  GASTO_GRUPOS.flatMap((g) => g.categorias.map((c) => [c, g.grupo] as const))
);

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

export function planStatus(c: Cliente): PlanStatus {
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

export function uid(): string {
  return "c" + Date.now() + Math.floor(Math.random() * 1000);
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
