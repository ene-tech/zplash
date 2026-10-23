import type { AppData, Cliente, Venta, VentaItem } from "@/types";
import {
  esTarjetaWeb,
  fmtTelefono,
  limpiarRut,
  normPlate,
  planStatus,
  PREFIJO_VENTA_REEMBOLSO,
  TIPO_VENTA_PRODUCTOS,
  TIPO_VENTA_REEMBOLSO,
  tipoIngreso,
} from "@/lib/helpers";

function inRangeLocal(iso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const start = new Date(desde + "T00:00:00");
  const end = new Date(hasta + "T23:59:59.999");
  return d >= start && d <= end;
}

function fmtDateLocal(d: string): string {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
  );
}

function metodoPagoLabel(v: Venta): string {
  if (v.metodoPago === "efectivo") return "Efectivo";
  if (v.metodoPago === "tarjeta") return esTarjetaWeb(v.creadoPor) ? "Tarjetas Transbank" : "Tarjetas GETNET";
  if (v.metodoPago === "transferencia") return "Transferencia bancaria";
  if (v.metodoPago === "orden_compra") return "Orden de compra";
  return "-";
}

/** Ventas del período que pueden tener líneas de producto (POS): las ventas
 * de productos y los reembolsos, porque una devolución del POS es un
 * reembolso con sus líneas en negativo (ver armarDevolucionPos). Las líneas
 * no vienen en AppData: quien llama las pide con lineasDeVentas. */
export function ventasPosDelPeriodo(ventas: Venta[], desde: string, hasta: string): Venta[] {
  return ventas.filter(
    (v) => (v.tipo === TIPO_VENTA_PRODUCTOS || v.tipo === TIPO_VENTA_REEMBOLSO) && inRangeLocal(v.fecha, desde, hasta)
  );
}

/** Hoja "Ventas POS": arriba lo vendido por producto (neto de devoluciones),
 * abajo cada línea de cada ticket con quién la cobró y cómo se pagó. */
export function filasVentasPos(ventasPos: Venta[], items: VentaItem[]): (string | number)[][] {
  const ventaPorId = new Map(ventasPos.map((v) => [v.id, v]));
  const lineas = items
    .filter((it) => ventaPorId.has(it.ventaId))
    .map((it) => ({ it, venta: ventaPorId.get(it.ventaId)! }))
    .sort((a, b) => a.venta.fecha.localeCompare(b.venta.fecha) || a.it.id.localeCompare(b.it.id));

  const porProducto = new Map<string, { sku: string; detalle: string; cantidad: number; monto: number }>();
  for (const { it } of lineas) {
    const key = it.productoId || it.sku;
    const p = porProducto.get(key) || { sku: it.sku, detalle: it.detalle, cantidad: 0, monto: 0 };
    p.cantidad += it.cantidad;
    p.monto += it.cantidad * it.precioUnitario;
    porProducto.set(key, p);
  }
  const resumen = [...porProducto.values()].sort((a, b) => b.monto - a.monto);
  const tickets = new Set(lineas.filter(({ venta }) => venta.tipo === TIPO_VENTA_PRODUCTOS).map(({ venta }) => venta.id));

  return [
    ["Productos vendidos"],
    ["SKU", "Producto", "Cantidad", "Monto"],
    ...resumen.map((p) => [p.sku, p.detalle, p.cantidad, p.monto]),
    ["", "Total", resumen.reduce((s, p) => s + p.cantidad, 0), resumen.reduce((s, p) => s + p.monto, 0)],
    [],
    [`Detalle de ventas POS (${tickets.size} ${tickets.size === 1 ? "ticket" : "tickets"})`],
    ["Fecha", "N° venta", "Tipo", "Funcionario", "Cliente", "Método de pago", "SKU", "Producto", "Cantidad", "Precio unitario", "Subtotal"],
    ...lineas.map(({ it, venta }) => [
      fmtDateLocal(venta.fecha),
      venta.id,
      venta.tipo === TIPO_VENTA_REEMBOLSO ? "Devolución" : "Venta",
      venta.creadoPor || "",
      venta.nombre,
      metodoPagoLabel(venta),
      it.sku,
      it.detalle,
      it.cantidad,
      it.precioUnitario,
      it.cantidad * it.precioUnitario,
    ]),
  ];
}

export function descargarCierre(data: AppData, desde: string, hasta: string, itemsPos: VentaItem[] = []) {
  const { ingresos, clientes, ventas } = data;
  const ingresosPeriodo = ingresos.filter((i) => inRangeLocal(i.fecha, desde, hasta));
  const nuevosPeriodo = clientes.filter((c) => inRangeLocal(c.creadoEn, desde, hasta));
  const ventasPeriodo = ventas.filter((v) => inRangeLocal(v.fecha, desde, hasta));
  const autosConPlan = ingresosPeriodo.filter((i) => i.planEstadoAlIngreso !== "bad").length;

  const serviciosAdicionalesPeriodo = ventasPeriodo.filter((v) => v.esServicioAdicional).map((v) => ({
    Fecha: fmtDateLocal(v.fecha),
    Patente: v.patente,
    Cliente: v.nombre,
    Servicios: v.tipo,
    Cantidad: v.cantidadItems ?? 1,
    Monto: v.precio,
  }));

  // Lavados con ticket: todo canje de un cupón "vale" en el túnel (Pack de
  // Tickets, Pack Empresa, Promo de lavados) deja el Ingreso con viaCupon y el
  // código del ticket, ver registrarIngresoCupon. El funcionario es quien
  // registró el ingreso en el módulo Operador.
  const cuponesPorCodigo = new Map(data.cupones.map((c) => [c.codigo, c]));
  const ingresosTicket = ingresosPeriodo.filter((i) => i.viaCupon);
  const lavadosTicket = ingresosTicket.map((i) => {
    const cupon = i.cuponCodigo ? cuponesPorCodigo.get(i.cuponCodigo) : undefined;
    return {
      Fecha: fmtDateLocal(i.fecha),
      Patente: i.patente,
      Cliente: i.nombre,
      "Código ticket": i.cuponCodigo || "",
      Lote: cupon?.nombreLote || "",
      "RUT empresa": cupon?.rut || "",
      Funcionario: i.creadoPor || "",
    };
  });
  const ticketsPorFuncionario = new Map<string, number>();
  for (const i of ingresosTicket) {
    const f = i.creadoPor || "Sin registrar";
    ticketsPorFuncionario.set(f, (ticketsPorFuncionario.get(f) || 0) + 1);
  }

  const rango = desde === hasta ? desde : `${desde} a ${hasta}`;
  const resumen = [
    { Concepto: "Período", Valor: rango },
    { Concepto: "Total de ingresos", Valor: ingresosPeriodo.length },
    { Concepto: "Autos que pasaron con el plan vigente", Valor: autosConPlan },
    { Concepto: "Autos con plan vencido", Valor: ingresosPeriodo.length - autosConPlan },
    { Concepto: "Lavados con ticket", Valor: ingresosTicket.length },
    ...[...ticketsPorFuncionario]
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => ({ Concepto: `  Lavados con ticket — ${f}`, Valor: n })),
    { Concepto: "Registros nuevos", Valor: nuevosPeriodo.length },
    { Concepto: "Planes vendidos (nuevos + renovaciones)", Valor: ventasPeriodo.length },
  ];
  // Mismo criterio que la tabla "Detalle de ingresos" de CierreTab: el
  // contacto no está en el Ingreso, se busca en la ficha del cliente por id y,
  // si el ingreso no tiene clienteId (canje de cupón), por patente.
  const clientesPorId = new Map(clientes.map((c) => [c.id, c]));
  const clientesPorPatente = new Map(clientes.filter((c) => normPlate(c.patente)).map((c) => [normPlate(c.patente), c]));
  const detalle = ingresosPeriodo.map((i) => {
    const cliente = clientesPorId.get(i.clienteId) || clientesPorPatente.get(normPlate(i.patente));
    return {
      Fecha: fmtDateLocal(i.fecha),
      Patente: i.patente,
      Cliente: i.nombre,
      Email: cliente?.email || "",
      Teléfono: cliente?.telefono ? fmtTelefono(cliente.telefono) : "",
      Operador: i.creadoPor || "",
      Tipo: i.viaCupon ? "Ticket" : tipoIngreso(i).label,
      "Estado plan": i.planEstadoAlIngreso === "bad" ? "Vencido" : i.planEstadoAlIngreso === "warn" ? "Por vencer" : "Vigente",
    };
  });
  const planesVendidos = ventasPeriodo.map((v) => ({
    Fecha: fmtDateLocal(v.fecha),
    Patente: v.patente,
    Cliente: v.nombre,
    Tipo: v.tipo,
    Precio: v.precio,
    "Método de pago": metodoPagoLabel(v),
  }));
  const ventasPos = filasVentasPos(ventasPosDelPeriodo(ventas, desde, hasta), itemsPos);
  // Facturas pedidas en el checkout web (ver facturasEmpresaPeriodo en
  // useCierreData): acá van también las ya emitidas, marcadas en su columna.
  const facturasWeb = ventasPeriodo
    .filter((v) => v.tipoDocumento === "Factura")
    .map((v) => ({
      Fecha: fmtDateLocal(v.fecha),
      Detalle: v.tipo,
      "Razón Social": v.razonSocial || "",
      RUT: v.rut || "",
      Dirección: v.direccion || "",
      Giro: v.giro || "",
      Email: v.email || "",
      Monto: v.precio,
      "Factura emitida": v.facturaEmitida ? "Sí" : "No",
    }));

  import("xlsx").then((XLSX) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        serviciosAdicionalesPeriodo.length
          ? serviciosAdicionalesPeriodo
          : [{ Fecha: "", Patente: "", Cliente: "", Servicios: "", Cantidad: "", Monto: "" }]
      ),
      "Servicios adicionales"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        detalle.length ? detalle : [{ Fecha: "", Patente: "", Cliente: "", Email: "", Teléfono: "", Operador: "", Tipo: "", "Estado plan": "" }]
      ),
      "Ingresos"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        lavadosTicket.length
          ? lavadosTicket
          : [{ Fecha: "", Patente: "", Cliente: "", "Código ticket": "", Lote: "", "RUT empresa": "", Funcionario: "" }]
      ),
      "Lavados con ticket"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        planesVendidos.length ? planesVendidos : [{ Fecha: "", Patente: "", Cliente: "", Tipo: "", Precio: "", "Método de pago": "" }]
      ),
      "Detalle de Venta"
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ventasPos), "Ventas POS");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        facturasWeb.length
          ? facturasWeb
          : [{ Fecha: "", Detalle: "", "Razón Social": "", RUT: "", Dirección: "", Giro: "", Email: "", Monto: "", "Factura emitida": "" }]
      ),
      "Facturas web"
    );
    XLSX.writeFile(wb, `cierre-caja-${desde}_a_${hasta}.xlsx`);
  });
}

// Ventas del período que hay que facturarle a cada cliente, indexadas por
// cliente.id. Además de las ventas con `clienteId` propio, reparte las compras
// con Factura pagadas por la web (Pack Empresa, 10 Tickets, Cupón Venta
// Empresa): esas llegan SIN clienteId — el checkout guarda razón social y RUT
// como snapshot en la venta, ver pagosWebpayItems — así que se asignan al
// cliente que tenga ese mismo RUT en su ficha. Sin esto la fila del cliente en
// "Clientes con Factura" mostraba $0 aunque hubiera comprado con factura
// dentro del período. Cuando un RUT tiene varias fichas (una por auto) el
// monto se le carga a una sola, para no emitir dos veces la misma factura.
// Si la venta se factura con los datos de la ficha del cliente: no se eligió
// documento al cobrar (ventas viejas) o se eligió Factura "de la ficha" (sin
// RUT propio). Una Boleta elegida no se factura; una Factura con RUT propio va
// por su cuenta (Cierre → facturas pedidas en la compra). Misma regla que
// emitirFacturasAutomaticas.
export function sigueDocumentoDeFicha(v: Venta): boolean {
  return !v.tipoDocumento || (v.tipoDocumento === "Factura" && !v.rut);
}

export function ventasAFacturarPorCliente(
  clientes: Cliente[],
  ventas: Venta[],
  desde: string,
  hasta: string
): Map<string, Venta[]> {
  const fichaPorRut = new Map<string, string>();
  for (const c of clientes) {
    if (c.tipoDocumento !== "Factura") continue;
    const rut = limpiarRut(c.rut);
    if (rut && !fichaPorRut.has(rut)) fichaPorRut.set(rut, c.id);
  }
  const porId = new Map(ventas.map((v) => [v.id, v]));
  const rutPorId = new Map(clientes.map((c) => [c.id, c.rut]));
  // El contra-asiento de un reembolso (ver reembolsarVenta) copia el clienteId
  // de la venta original pero no su razón social ni su RUT, así que el de una
  // compra web se queda sin dueño: hay que devolverlo a la misma ficha que la
  // venta que anula, o la compra reembolsada seguiría figurando como plata por
  // facturar. El id del contra-asiento es "reembolso-" + el id original.
  const fichaDe = (v: Venta | undefined): string | undefined => {
    if (!v) return undefined;
    if (v.clienteId) return v.clienteId;
    if (v.tipoDocumento === "Factura") return fichaPorRut.get(limpiarRut(v.rut));
    if (v.id.startsWith(PREFIJO_VENTA_REEMBOLSO)) return fichaDe(porId.get(v.id.slice(PREFIJO_VENTA_REEMBOLSO.length)));
    return undefined;
  };

  // Boleta elegida al cobrar: no se factura aunque la ficha diga Factura. El
  // contra-asiento de su reembolso tampoco (no copia el tipo de documento).
  const esBoleta = (v: Venta | undefined): boolean => {
    if (!v) return false;
    if (v.tipoDocumento === "Boleta") return true;
    return v.id.startsWith(PREFIJO_VENTA_REEMBOLSO) && esBoleta(porId.get(v.id.slice(PREFIJO_VENTA_REEMBOLSO.length)));
  };

  const porCliente = new Map<string, Venta[]>();
  for (const v of ventas) {
    if (!inRangeLocal(v.fecha, desde, hasta) || esBoleta(v)) continue;
    const clienteId = fichaDe(v);
    if (!clienteId) continue;
    // Factura a otra empresa (elegida al cobrar): se emite a ese RUT, no a la
    // ficha de este cliente — si no, saldría dos veces. Su reembolso, igual.
    const rutFicha = limpiarRut(rutPorId.get(clienteId));
    const original = v.id.startsWith(PREFIJO_VENTA_REEMBOLSO) ? porId.get(v.id.slice(PREFIJO_VENTA_REEMBOLSO.length)) : v;
    if (original?.tipoDocumento === "Factura" && original.rut && rutFicha && limpiarRut(original.rut) !== rutFicha) continue;
    const lista = porCliente.get(clienteId);
    if (lista) lista.push(v);
    else porCliente.set(clienteId, [v]);
  }
  return porCliente;
}

export function descargarFacturables(data: AppData, listaClientes: Cliente[], desde: string, hasta: string) {
  const ventasPorCliente = ventasAFacturarPorCliente(data.clientes, data.ventas, desde, hasta);
  const filas = listaClientes.map((c) => {
    const ingPeriodo = data.ingresos.filter((i) => i.clienteId === c.id && inRangeLocal(i.fecha, desde, hasta)).length;
    const ventPeriodo = ventasPorCliente.get(c.id) || [];
    const montoVentas = ventPeriodo.reduce((s, v) => s + (v.precio || 0), 0);
    const st = planStatus(c);
    return {
      Patente: c.patente,
      Cliente: c.nombre,
      "Razón Social": c.razonSocial || "",
      RUT: c.rut || "",
      Giro: c.giro || "",
      Dirección: c.direccion || "",
      Email: c.email || "",
      Teléfono: c.telefono || "",
      "Ingresos en el período": ingPeriodo,
      "Ventas en el período": ventPeriodo.length,
      "Estado plan actual": st.label,
      "Monto a facturar": montoVentas,
    };
  });
  import("xlsx").then((XLSX) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filas.length
          ? filas
          : [
              {
                Patente: "",
                Cliente: "",
                "Razón Social": "",
                RUT: "",
                Giro: "",
                Dirección: "",
                Email: "",
                Teléfono: "",
                "Ingresos en el período": "",
                "Ventas en el período": "",
                "Estado plan actual": "",
                "Monto a facturar": "",
              },
            ]
      ),
      "Facturables"
    );
    XLSX.writeFile(wb, `facturables-${desde}_a_${hasta}.xlsx`);
  });
}
