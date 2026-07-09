import type { AppData, Cliente, Ingreso, PagoInfo, Venta } from "@/types";
import { PLANES, normPlate, planStatus, precioPreferencial, uid } from "@/lib/helpers";

export function registrarIngreso(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null,
  esGarantia?: boolean
): Partial<AppData> {
  const estadoPlan = planStatus(cliente).cls;
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: new Date().toISOString(),
    planEstadoAlIngreso: estadoPlan,
    operador: operadorActual || "",
    esGarantia: esGarantia || undefined,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: new Date().toISOString(),
  };
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
  };
}

export function renovarPlan(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null,
  pago?: PagoInfo
): Partial<AppData> {
  const base = cliente.vencimiento && new Date(cliente.vencimiento) > new Date() ? new Date(cliente.vencimiento) : new Date();
  base.setDate(base.getDate() + 30);
  const clienteActualizado: Cliente = {
    ...cliente,
    vencimiento: base.toISOString(),
    ultimaRenovacion: new Date().toISOString(),
  };
  const venta: Venta = {
    id: "v" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    plan: cliente.plan || "",
    precio: precioPreferencial(data.precios, cliente.plan || ""),
    tipo: "Renovación preferencial",
    fecha: new Date().toISOString(),
    operador: operadorActual || "",
    metodoPago: pago?.metodo,
    voucher: pago?.voucher,
  };
  return {
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    ventas: [venta, ...data.ventas],
  };
}

function getField(row: Record<string, unknown>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((k) => k.trim().toLowerCase() === n);
    if (k !== undefined && row[k] !== "") return String(row[k]);
  }
  return "";
}

function parseFecha(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const d = new Date(v as string);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

export interface ImportResult {
  patch: Partial<AppData>;
  nuevos: number;
  actualizados: number;
  errores: number[];
}

export function importarClientes(data: AppData, rows: Record<string, unknown>[]): ImportResult {
  let nuevos = 0;
  let actualizados = 0;
  const errores: number[] = [];
  const clientes = [...data.clientes];

  rows.forEach((row, idx) => {
    const patenteRaw = getField(row, "patente", "placa", "placa patente");
    const patente = normPlate(patenteRaw);
    if (!patente) {
      errores.push(idx + 2);
      return;
    }
    const nombre = (getField(row, "nombre", "cliente") || "Sin nombre").toUpperCase();
    const telefono = getField(row, "telefono", "teléfono", "fono");
    const email = getField(row, "email", "correo", "correo electronico", "correo electrónico");
    const vehiculo = getField(row, "vehiculo", "vehículo", "auto");
    const plan = PLANES[0];
    const fechaContratacion = parseFecha(
      getField(row, "fecha contratacion", "fecha de contratacion", "fecha contratación", "fecha de contratación", "contratacion")
    );
    let vencimiento: string | null = null;
    if (fechaContratacion) {
      const v = new Date(fechaContratacion);
      v.setDate(v.getDate() + 30);
      vencimiento = v.toISOString();
    }
    const tipoDocRaw = getField(row, "tipo documento", "tipodocumento", "documento");
    const tipoDocumento: "Boleta" | "Factura" = tipoDocRaw && tipoDocRaw.toLowerCase().startsWith("fact") ? "Factura" : "Boleta";
    const razonSocial = tipoDocumento === "Factura" ? getField(row, "razon social", "razón social") : "";
    const rut = tipoDocumento === "Factura" ? getField(row, "rut") : "";
    const direccion = tipoDocumento === "Factura" ? getField(row, "direccion", "dirección") : "";
    const giro = tipoDocumento === "Factura" ? getField(row, "giro") : "";
    const origenRaw = getField(row, "origen", "canal");
    const origen: "WEB" | "LOCAL" = origenRaw.toLowerCase().startsWith("web") ? "WEB" : "LOCAL";

    const existenteIdx = clientes.findIndex((c) => normPlate(c.patente) === patente);
    if (existenteIdx !== -1) {
      const existente = clientes[existenteIdx];
      clientes[existenteIdx] = {
        ...existente,
        nombre,
        telefono,
        email,
        vehiculo,
        plan,
        tipoDocumento,
        razonSocial,
        rut,
        direccion,
        giro,
        fechaContratacion: fechaContratacion || existente.fechaContratacion,
        vencimiento: vencimiento || existente.vencimiento,
        origen: origenRaw ? origen : existente.origen,
      };
      actualizados++;
    } else {
      clientes.push({
        id: uid(),
        nombre,
        patente,
        telefono,
        email,
        vehiculo,
        plan,
        tipoDocumento,
        razonSocial,
        rut,
        direccion,
        giro,
        fechaContratacion,
        vencimiento,
        origen,
        visitas: 0,
        creadoEn: new Date().toISOString(),
        creadoPor: "Carga masiva (Excel)",
      });
      nuevos++;
    }
  });

  return { patch: { clientes }, nuevos, actualizados, errores };
}

export function descargarCierre(data: AppData, desde: string, hasta: string) {
  const { ingresos, clientes, ventas } = data;
  const ingresosPeriodo = ingresos.filter((i) => inRangeLocal(i.fecha, desde, hasta));
  const nuevosPeriodo = clientes.filter((c) => inRangeLocal(c.creadoEn, desde, hasta));
  const ventasPeriodo = ventas.filter((v) => inRangeLocal(v.fecha, desde, hasta));
  const autosConPlan = ingresosPeriodo.filter((i) => i.planEstadoAlIngreso !== "bad").length;

  const porCliente: Record<string, { Patente: string; Cliente: string; "Ingresos en el período": number }> = {};
  ingresosPeriodo.forEach((i) => {
    const key = i.patente;
    if (!porCliente[key]) porCliente[key] = { Patente: i.patente, Cliente: i.nombre, "Ingresos en el período": 0 };
    porCliente[key]["Ingresos en el período"]++;
  });

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
  }));

  import("xlsx").then((XLSX) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(Object.values(porCliente).length ? Object.values(porCliente) : [{ Patente: "", Cliente: "", "Ingresos en el período": "" }]),
      "Por cliente"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Fecha: "", Patente: "", Cliente: "", "Estado plan": "" }]),
      "Ingresos"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(planesVendidos.length ? planesVendidos : [{ Fecha: "", Patente: "", Cliente: "", Tipo: "", Precio: "" }]),
      "Planes vendidos"
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
