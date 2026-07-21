// Tipos de dominio de la app, divididos por entidad de negocio bajo
// src/types/ (mismos dominios que @/lib/dataAccess y @/lib/db). AppData
// agrega un campo por entidad y por eso importa de todos los submódulos;
// vive acá en vez de en un archivo de dominio propio porque no es en sí una
// entidad, es el snapshot completo que carga loadAll() (ver
// @/lib/dataAccess/loadAll.ts).
import type { Cita, BloqueoAgenda, HorarioAgenda } from "./agenda";
import type { Cliente } from "./clientes";
import type { ConfigGlobal } from "./config";
import type { CartolaMovimiento, CategoriaGasto, CategoriaIngreso, MovimientoContable, ReglaConciliacion } from "./contabilidad";
import type { Cupon } from "./cupones";
import type { Empresa } from "./empresas";
import type { Ingreso } from "./ingresos";
import type {
  CategoriaInsumo,
  CategoriaProducto,
  DestinoInventario,
  Insumo,
  MovimientoInventario,
  Producto,
  Proveedor,
} from "./inventario";
import type { PerfilPublico } from "./perfiles";
import type { Precios } from "./precios";
import type { Servicio } from "./servicios";
import type { Venta } from "./ventas";

export interface AppData {
  clientes: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
  precios: Precios;
  perfiles: PerfilPublico[];
  cupones: Cupon[];
  movimientosContables: MovimientoContable[];
  categoriasGasto: CategoriaGasto[];
  categoriasIngreso: CategoriaIngreso[];
  categoriasProducto: CategoriaProducto[];
  empresas: Empresa[];
  servicios: Servicio[];
  horariosAgenda: HorarioAgenda[];
  bloqueosAgenda: BloqueoAgenda[];
  citas: Cita[];
  config: ConfigGlobal;
  cartolaMovimientos: CartolaMovimiento[];
  reglasConciliacion: ReglaConciliacion[];
  proveedores: Proveedor[];
  productos: Producto[];
  insumos: Insumo[];
  categoriasInsumo: CategoriaInsumo[];
  destinosInventario: DestinoInventario[];
  movimientosInventario: MovimientoInventario[];
}

export * from "./agenda";
export * from "./auditoria";
export * from "./clientes";
export * from "./config";
export * from "./contabilidad";
export * from "./cupones";
export * from "./empresas";
export * from "./ingresos";
export * from "./inventario";
export * from "./perfiles";
export * from "./precios";
export * from "./servicios";
export * from "./ui";
export * from "./ventas";
