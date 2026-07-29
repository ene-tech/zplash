import type { AppData, Cliente } from "@/types";
import { esTarjetaWeb, planStatus } from "@/lib/helpers";

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
  const detalle = ingresosPeriodo.map((i) => ({
    Fecha: fmtDateLocal(i.fecha),
    Patente: i.patente,
    Cliente: i.nombre,
    "Estado plan": i.planEstadoAlIngreso === "bad" ? "Vencido" : i.planEstadoAlIngreso === "warn" ? "Por vencer" : "Vigente",
  }));
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
      XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Fecha: "", Patente: "", Cliente: "", "Estado plan": "" }]),
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
              },
            ]
      ),
      "Facturables"
    );
    XLSX.writeFile(wb, `facturables-${desde}_a_${hasta}.xlsx`);
  });
}
