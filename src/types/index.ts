// Tipos de dominio de la app, divididos por entidad de negocio bajo
// src/types/ (mismos dominios que @/lib/dataAccess y @/lib/serverActions). AppData
// agrega un campo por entidad y por eso importa de todos los submódulos;
// vive acá en vez de en un archivo de dominio propio porque no es en sí una
// entidad, es el snapshot completo que carga loadAll() (ver
// @/lib/dataAccess/loadAll.ts).
import type { Cita, BloqueoAgenda, HorarioAgenda } from "./agenda";
import type { CierreCaja } from "./cierre";
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
import type { AlertaMantencion, Maquinaria, RegistroMantencion } from "./mantencion";
import type { PlantillaCorreo, ReglaCorreo } from "./mail";
import type { PerfilPublico } from "./perfiles";
import type { Precios, PreciosTamano } from "./precios";
import type { Servicio } from "./servicios";
import type { Venta } from "./ventas";
import type { PlantillaWhatsapp, ReglaWhatsapp } from "./whatsapp";

export interface AppData {
  clientes: Cliente[];
  ingresos: Ingreso[];
  ventas: Venta[];
  precios: Precios;
  preciosTamano: PreciosTamano;
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
  maquinarias: Maquinaria[];
  registrosMantencion: RegistroMantencion[];
  alertasMantencion: AlertaMantencion[];
  plantillasCorreo: PlantillaCorreo[];
  reglasCorreo: ReglaCorreo[];
  plantillasWhatsapp: PlantillaWhatsapp[];
  reglasWhatsapp: ReglaWhatsapp[];
  cierresCaja: CierreCaja[];
}

export * from "./agenda";
export * from "./auditoria";
export * from "./buzon";
export * from "./cierre";
export * from "./clientes";
export * from "./config";
export * from "./contabilidad";
export * from "./cupones";
export * from "./empresas";
export * from "./ingresos";
export * from "./inventario";
export * from "./mail";
export * from "./mantencion";
export * from "./perfiles";
export * from "./precios";
export * from "./servicios";
export * from "./ui";
export * from "./ventas";
export * from "./whatsapp";
