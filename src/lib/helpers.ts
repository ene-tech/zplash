import type { Cliente, Ingreso, PlanStatus, Precios } from "@/types";

export const PLANES = ["Plan Ilimitado Mensual"];
export const DIAS_AVISO_VENCIMIENTO = 7;

export const PRECIOS_DEFAULT: Precios = {
  "Plan Ilimitado Mensual": { normal: 21990, promo: 19990 },
};

/** Precio de un lavado único para clientes sin plan vigente (vencido o sin plan). */
export const PRECIO_LAVADO_UNICO = 9990;

export const OPERADORES_DEFAULT = [
  { id: "op1", nombre: "Christian", clave: "1001" },
  { id: "op2", nombre: "Verónica", clave: "1002" },
  { id: "op3", nombre: "Patricio", clave: "1003" },
  { id: "op4", nombre: "Emilio", clave: "1004" },
  { id: "op5", nombre: "Evelyn", clave: "1005" },
  { id: "op6", nombre: "Jota", clave: "1006" },
  { id: "op7", nombre: "Juan", clave: "1007" },
];

export function fmtCLP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function precioNormal(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].normal) || 0;
}

export function precioPreferencial(precios: Precios, plan: string): number {
  return (precios[plan] && precios[plan].promo) || 0;
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
  return !nombre || !nombre.trim() || nombre.trim() === "Sin nombre";
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

export function uid(): string {
  return "c" + Date.now() + Math.floor(Math.random() * 1000);
}

/** 30 days from now, as an ISO string. Kept outside component bodies since it is not a pure computation. */
export function vencimientoPorDefectoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
