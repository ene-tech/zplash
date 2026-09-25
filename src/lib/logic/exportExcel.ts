import type { AppData, Cliente, Venta } from "@/types";
import { esTarjetaWeb, fmtTelefono, limpiarRut, normPlate, planStatus, PREFIJO_VENTA_REEMBOLSO } from "@/lib/helpers";

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

export function descargarCierre(data: AppData, desde: string, hasta: string) {
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

  const rango = desde === hasta ? desde : `${desde} a ${hasta}`;
  const resumen = [
    { Concepto: "Período", Valor: rango },
    { Concepto: "Total de ingresos", Valor: ingresosPeriodo.length },
    { Concepto: "Autos que pasaron con el plan vigente", Valor: autosConPlan },
    { Concepto: "Autos con plan vencido", Valor: ingresosPeriodo.length - autosConPlan },
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
      "Estado plan": i.planEstadoAlIngreso === "bad" ? "Vencido" : i.planEstadoAlIngreso === "warn" ? "Por vencer" : "Vigente",
    };
  });
  const planesVendidos = ventasPeriodo.map((v) => ({
    Fecha: fmtDateLocal(v.fecha),
    Patente: v.patente,
    Cliente: v.nombre,
    Tipo: v.tipo,
    Precio: v.precio,
    "Método de pago":
      v.metodoPago === "efectivo"
        ? "Efectivo"
        : v.metodoPago === "tarjeta"
          ? esTarjetaWeb(v.creadoPor)
            ? "Tarjetas Transbank"
            : "Tarjetas GETNET"
          : v.metodoPago === "transferencia"
            ? "Transferencia bancaria"
            : "-",
  }));
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
        detalle.length ? detalle : [{ Fecha: "", Patente: "", Cliente: "", Email: "", Teléfono: "", Operador: "", "Estado plan": "" }]
      ),
      "Ingresos"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        planesVendidos.length ? planesVendidos : [{ Fecha: "", Patente: "", Cliente: "", Tipo: "", Precio: "", "Método de pago": "" }]
      ),
      "Detalle de Venta"
    );
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

  const porCliente = new Map<string, Venta[]>();
  for (const v of ventas) {
    if (!inRangeLocal(v.fecha, desde, hasta)) continue;
    const clienteId = fichaDe(v);
    if (!clienteId) continue;
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
