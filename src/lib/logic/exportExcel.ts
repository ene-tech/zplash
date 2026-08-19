import type { AppData, Cliente } from "@/types";
import { esTarjetaWeb, fmtTelefono, normPlate, PLANES, planStatus, precioNormal } from "@/lib/helpers";

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
    XLSX.writeFile(wb, `cierre-caja-${desde}_a_${hasta}.xlsx`);
  });
}

// Monto a facturar a un cliente: si tuvo ventas en el período, esa suma (caso
// de clientes que facturan por visita/lavado único). Si no tuvo ninguna pero
// su plan sigue Vigente o Por vencer, el precio del plan (caso de empresas
// con flota en Plan X5, que se factura mes a mes aunque el
// ciclo de renovación no haya caído dentro del período seleccionado). Sin
// ventas y sin plan activo, no hay nada que facturar.
export function montoAFacturar(c: Cliente, montoVentas: number, precios: AppData["precios"]): number {
  if (montoVentas > 0) return montoVentas;
  const st = planStatus(c);
  if (st.label !== "Vigente" && st.label !== "Por vencer") return 0;
  return precioNormal(precios, c.plan || PLANES[0]);
}

export function descargarFacturables(data: AppData, listaClientes: Cliente[], desde: string, hasta: string) {
  const filas = listaClientes.map((c) => {
    const ingPeriodo = data.ingresos.filter((i) => i.clienteId === c.id && inRangeLocal(i.fecha, desde, hasta)).length;
    const ventPeriodo = data.ventas.filter((v) => v.clienteId === c.id && inRangeLocal(v.fecha, desde, hasta));
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
      "Planes vendidos en el período": ventPeriodo.length,
      "Monto planes período": montoVentas,
      "Estado plan actual": st.label,
      "Monto a facturar": montoAFacturar(c, montoVentas, data.precios),
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
                "Planes vendidos en el período": "",
                "Monto planes período": "",
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
