import type { Cliente } from "./clientes";
import type { Empresa } from "./empresas";
import type { Insumo, Producto, Proveedor } from "./inventario";
import type { PagoInfo } from "./ventas";
import type { PerfilPublico } from "./perfiles";

export type PlanStatusCls = "ok" | "warn" | "bad";

export interface PlanStatus {
  label: string;
  cls: PlanStatusCls;
  diasRestantes?: number;
}

export type OperResult =
  | { found: true; cliente: Cliente }
  | { found: false; plate: string }
  | null;

export type ModalState =
  | { type: "client"; data: Cliente | null; contexto?: "operador" | "admin" }
  | { type: "confirm"; mensaje: string; onConfirm: () => void; confirmLabel?: string; danger?: boolean }
  | { type: "perfil"; data: PerfilPublico | null }
  | { type: "bulk" }
  | { type: "pago"; monto: number; descripcion: string; onConfirm: (pago: PagoInfo) => void }
  | { type: "clienteInfo"; data: Cliente }
  | { type: "empresa"; data: Empresa | null }
  | { type: "producto"; data: Producto | null }
  | { type: "proveedor"; data: Proveedor | null }
  | { type: "insumo"; data: Insumo | null }
  | { type: "traspasoInventario"; productoId?: string }
  | null;

export interface UIState {
  view: "login" | "hub" | "operador" | "admin" | "servicios" | "contabilidad" | "web_settings" | "inventario";
  operResult: OperResult;
  adminTab: string;
  contabilidadTab: string;
  webSettingsTab: string;
  inventarioTab: string;
  search: string;
  modal: ModalState;
  loginErr: string;
  cierreDesde: string | null;
  cierreHasta: string | null;
  statsDesde: string | null;
  statsHasta: string | null;
  ingresosDesde: string | null;
  ingresosHasta: string | null;
  facturaSearch: string;
  loginMode: "select" | "pin" | null;
  perfilSeleccionadoId: string | null;
  perfilActual: PerfilPublico | null;
  clientesFiltroEstado: string;
  clientesOrden: string;
}
