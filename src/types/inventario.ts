// Proveedor de productos de inventario (independiente de Empresa, que es
// para facturación de compra/venta) — catálogo simple referenciado desde
// Producto.proveedorId como proveedor preferente.
export interface Proveedor {
  id: string;
  nombre: string;
  rut?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  contacto?: string;
  emailVendedor?: string;
  telefonoVendedor?: string;
  emailComprobantes?: string;
  banco?: string;
  cuentaCorriente?: string;
  // Glosa de gasto habitual — calza con un CategoriaGasto.nombre (ver
  // MovimientoContable.categoria): el formulario de Egresos la precarga al
  // reconocer el RUT del proveedor.
  categoriaGasto?: string;
  creadoEn: string;
  creadoPor?: string;
}

// Categoría seleccionable en el formulario de Producto (ver Producto.categoriaId
// más abajo) — administrable desde Inventario → Categorías, mismo patrón que
// CategoriaIngreso (sin "grupo": el inventario no tiene una estructura fija
// equivalente al EERR).
export interface CategoriaProducto {
  id: string;
  nombre: string;
  activa: boolean;
}

// Ítem de inventario. `codigo` es un identificador corto de 6 dígitos que
// asigna el sistema al crear el producto (ver generarCodigoProducto en
// helpers.ts) — no lo edita el usuario, a diferencia de `sku`, que es el
// nombre de fantasía con el que el producto se vende en la web/vending.
// `categoriaId` referencia una CategoriaProducto administrable (Inventario →
// Categorías), igual que `proveedorId` referencia un Proveedor.
// `empaqueMinimo` es la cantidad por caja/paquete del proveedor: las OC de
// reposición que se generen cuando el stock caiga bajo `stockMin` deben
// pedirse en múltiplos de este valor. stock es un valor editable a mano (sin
// historial de movimientos ni integración automática con Ventas todavía);
// stockMin/stockMax son la regla de reposición usada para alertar en
// InventarioTab cuando el stock actual cae bajo el mínimo.
export interface Producto {
  id: string;
  codigo: string;
  sku: string;
  detalle: string;
  categoriaId?: string;
  valorCompra: number;
  valorVenta: number;
  stock: number;
  stockMin: number;
  stockMax: number;
  empaqueMinimo: number;
  proveedorId?: string;
  activo: boolean;
  // Ids de DestinoInventario donde este producto NO puede estar (ej. un paño
  // no debería poder cargarse en la máquina "Vending Café"). Vacío/ausente =
  // permitido en todos los destinos — ver productoPermitidoEnDestino en
  // helpers/inventario.ts, usado por TraspasoModal y GuiaTraspasoTab para
  // impedir traspasar a un destino bloqueado.
  destinosBloqueados?: string[];
  creadoEn: string;
  creadoPor?: string;
}

// Destino físico donde puede estar un Producto: Bodega (origen implícito de
// todo Producto.stock) o una máquina vending — administrable desde
// Inventario → Destinos, mismo patrón que CategoriaProducto. esBodega marca
// el único destino que no necesita movimientos para tener stock (ver
// stockPorDestino en helpers.ts).
export interface DestinoInventario {
  id: string;
  nombre: string;
  esBodega: boolean;
  activo: boolean;
}

// Traspaso de stock de un Producto entre dos DestinoInventario (ej. sacar
// cantidad de Bodega para reponer una máquina vending). La cantidad
// disponible en cada destino se calcula sumando/restando estos movimientos
// contra Producto.stock (ver stockPorDestino en helpers.ts) — no existe una
// columna de "cantidad actual por destino" guardada aparte.
// `folio` identifica la guía de traspaso que originó el movimiento: es
// correlativo e irrepetible (ver generarFolioTraspaso en helpers/ids.ts) y
// las líneas de una misma guía (GuiaTraspasoTab) comparten el mismo folio,
// para dejar registro de cada traspaso.
export interface MovimientoInventario {
  id: string;
  folio: string;
  productoId: string;
  origenId: string;
  destinoId: string;
  cantidad: number;
  fecha: string;
  notas?: string;
  creadoPor?: string;
}

// Categoría seleccionable en el formulario de Insumo (ver Insumo.categoriaId
// más abajo) — administrable desde Inventario → Categorías, mismo patrón que
// CategoriaProducto.
export interface CategoriaInsumo {
  id: string;
  nombre: string;
  activa: boolean;
}

// Ítem de consumo interno (Inventario → Insumos): a diferencia de Producto,
// nunca se vende (sin valorVenta ni sku/código de vending) — solo se
// consume para prestar el servicio de limpieza o para operar la oficina.
// Mismo patrón de reposición que Producto: stockMin/stockMax alertan cuando
// el stock cae bajo el mínimo.
export interface Insumo {
  id: string;
  nombre: string;
  categoriaId?: string;
  valorCompra: number;
  stock: number;
  stockMin: number;
  stockMax: number;
  proveedorId?: string;
  activo: boolean;
  creadoEn: string;
  creadoPor?: string;
}
