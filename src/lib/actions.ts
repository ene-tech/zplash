import type { AppData, CartolaMovimiento, Cita, Cliente, Empresa, Ingreso, PagoInfo, ReglaConciliacion, Venta } from "@/types";
import { esRetrocesoInvalido } from "@/lib/agenda";
import type { ParsedMovimiento } from "@/lib/cartolaParser";
import {
  GLOSA_SERVICIO_DETAILING,
  PLANES,
  esTarjetaWeb,
  formatRut,
  formatTelefono,
  isValidPatente,
  normPlate,
  planStatus,
  uid,
} from "@/lib/helpers";

export function registrarIngreso(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null | undefined,
  esGarantia?: boolean,
  glosa?: string
): Partial<AppData> {
  const estadoPlan = planStatus(cliente).cls;
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: new Date().toISOString(),
    planEstadoAlIngreso: estadoPlan,
    creadoPor: operadorActual || "",
    esGarantia: esGarantia || undefined,
    glosa: glosa || undefined,
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

// Registra el paso físico por el túnel de un lavado completo/detailing ya
// vendido en Servicios Adicionales (Venta + Cita creadas ahí, ver registrar()
// en ServiciosAdicionalesView.tsx): a diferencia de registrarIngreso(), esto
// NO genera una Venta nueva — la venta ya existe — solo deja constancia en
// Historial de Ingresos (glosa "Servicio de Detailing") y avanza el circuito de
// la cita a "en_limpieza".
export function registrarIngresoDetailing(
  data: AppData,
  cliente: Cliente,
  cita: Cita,
  operadorActual: string | null | undefined
): Partial<AppData> {
  // Si el operador vuelve a escanear la misma patente (la cita se sigue
  // ofreciendo como "pendiente" mientras esté en recibido/en_limpieza/
  // listo_entrega, ver puedeIngresarTunelDetailing), no hay que duplicar el
  // Ingreso ni el conteo de visitas del cliente — ya quedó constancia del
  // paso por el túnel para esta cita.
  if (data.ingresos.some((i) => i.citaId === cita.id)) {
    return {};
  }
  const ahora = new Date().toISOString();
  const ingreso: Ingreso = {
    id: "i" + Date.now(),
    clienteId: cliente.id,
    patente: cliente.patente,
    nombre: cliente.nombre,
    fecha: ahora,
    planEstadoAlIngreso: planStatus(cliente).cls,
    creadoPor: operadorActual || "",
    glosa: GLOSA_SERVICIO_DETAILING,
    citaId: cita.id,
  };
  const clienteActualizado: Cliente = {
    ...cliente,
    visitas: (cliente.visitas || 0) + 1,
    ultimaVisita: ahora,
  };
  // No retroceder el estado de la cita (p. ej. si Servicios Adicionales ya la
  // avanzó a "listo_entrega" antes de que el operador alcanzara a registrar
  // el ingreso al túnel) — mismo criterio que ya se aplica en los selects de
  // Agenda/Servicios Adicionales, ver esRetrocesoInvalido.
  const nuevoEstadoCita = esRetrocesoInvalido(cita.estado, "en_limpieza") ? cita.estado : "en_limpieza";
  return {
    ingresos: [ingreso, ...data.ingresos],
    clientes: data.clientes.map((c) => (c.id === cliente.id ? clienteActualizado : c)),
    citas: data.citas.map((ct) => (ct.id === cita.id ? { ...ct, estado: nuevoEstadoCita } : ct)),
  };
}

export function renovarPlan(
  data: AppData,
  cliente: Cliente,
  operadorActual: string | null | undefined,
  precio: number,
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
    precio,
    tipo: "Renovación preferencial",
    fecha: new Date().toISOString(),
    creadoPor: operadorActual || "",
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
  // El RUT manda (mismo criterio que ClientModal/ServiciosAdicionalesView/
  // VentaEmpresaTab): si una fila trae Factura con un RUT que no está en
  // Empresas, se da de alta ahí también, para que no queden facturables
  // "huérfanos" que solo existen en clientes.
  const rutsEmpresa = new Set(data.empresas.map((e) => formatRut(e.rut)));
  const nuevasEmpresas: Empresa[] = [];

  rows.forEach((row, idx) => {
    const patenteRaw = getField(row, "patente", "placa", "placa patente");
    const patente = normPlate(patenteRaw);
    if (!isValidPatente(patente)) {
      errores.push(idx + 2);
      return;
    }
    const nombre = getField(row, "nombre", "cliente").toUpperCase();
    if (!nombre) {
      errores.push(idx + 2);
      return;
    }
    const telefono = formatTelefono(getField(row, "telefono", "teléfono", "fono"));
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
    const rut = tipoDocumento === "Factura" ? formatRut(getField(row, "rut")) : "";
    const direccion = tipoDocumento === "Factura" ? getField(row, "direccion", "dirección") : "";
    const giro = tipoDocumento === "Factura" ? getField(row, "giro") : "";
    const origenRaw = getField(row, "origen", "canal");
    const origen: "WEB" | "LOCAL" = origenRaw.toLowerCase().startsWith("web") ? "WEB" : "LOCAL";

    const existenteIdx = clientes.findIndex((c) => normPlate(c.patente) === patente);
    let clienteId: string;
    if (existenteIdx !== -1) {
      const existente = clientes[existenteIdx];
      clienteId = existente.id;
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
      clienteId = uid();
      clientes.push({
        id: clienteId,
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

    if (tipoDocumento === "Factura" && rut && !rutsEmpresa.has(rut)) {
      rutsEmpresa.add(rut);
      nuevasEmpresas.push({
        id: uid(),
        razonSocial,
        rut,
        giro,
        direccion,
        telefono,
        contactoClienteId: clienteId,
        contactoNombre: nombre,
        creadoEn: new Date().toISOString(),
        creadoPor: "Carga masiva (Excel)",
      });
    }
  });

  return {
    patch: { clientes, ...(nuevasEmpresas.length ? { empresas: [...data.empresas, ...nuevasEmpresas] } : {}) },
    nuevos,
    actualizados,
    errores,
  };
}

// Regla semilla: "GETNET" ya fue confirmado por el usuario como la
// liquidación de ventas con tarjeta vía POS — se agrega sola en el primer
// import de conciliación si todavía no existe (ver importarCartola), sin
// necesitar un seed en @/lib/helpers ni en la base de datos.
const REGLA_GETNET_ID = "GETNET";
const REGLA_GETNET_CATEGORIA = "Ingreso Tarjeta POS (GETNET)";

export interface ImportCartolaResult {
  patch: Partial<AppData>;
  nuevos: number;
  duplicados: number;
}

function claveCartolaMovimiento(cuenta: string, fecha: string, cargo: number, abono: number, saldo?: number): string {
  return `${cuenta}|${fecha}|${cargo}|${abono}|${saldo ?? ""}`;
}

function categoriaPorRegla(reglas: ReglaConciliacion[], glosa: string): string | undefined {
  const glosaUpper = glosa.toUpperCase();
  return reglas.find((r) => glosaUpper.includes(r.id.toUpperCase()))?.categoria;
}

// Importa las líneas ya parseadas de una cartola (ver @/lib/cartolaParser) al
// modelo de la app. Pura, igual que importarClientes: no llama a commit() acá
// para poder testear sin tocar la base de datos (ver ConciliacionBancariaTab,
// que sí llama a commit(result.patch) después).
export function importarCartola(data: AppData, movimientos: ParsedMovimiento[], cuenta: string): ImportCartolaResult {
  // Dedup contra lo ya importado (permite volver a subir el mismo PDF sin
  // duplicar) y también dentro del mismo archivo, por si el banco repite una
  // línea entre páginas — el saldo corrido actúa casi como clave natural
  // fila a fila, junto al resto de los campos.
  const clavesExistentes = new Set(
    data.cartolaMovimientos
      .filter((m) => m.cuenta === cuenta)
      .map((m) => claveCartolaMovimiento(m.cuenta, m.fecha, m.cargo, m.abono, m.saldo))
  );

  const reglasNuevas: ReglaConciliacion[] = [];
  if (!data.reglasConciliacion.some((r) => r.id === REGLA_GETNET_ID)) {
    reglasNuevas.push({ id: REGLA_GETNET_ID, categoria: REGLA_GETNET_CATEGORIA, creadoEn: new Date().toISOString() });
  }
  const reglasEfectivas = [...data.reglasConciliacion, ...reglasNuevas];

  let duplicados = 0;
  const nuevas: CartolaMovimiento[] = [];
  const ahora = Date.now();
  movimientos.forEach((m, idx) => {
    const clave = claveCartolaMovimiento(cuenta, m.fecha, m.cargo, m.abono, m.saldo);
    if (clavesExistentes.has(clave)) {
      duplicados++;
      return;
    }
    clavesExistentes.add(clave);
    nuevas.push({
      id: "cb" + (ahora + idx) + Math.floor(Math.random() * 1000),
      cuenta,
      fecha: m.fecha,
      glosa: m.glosa,
      cargo: m.cargo,
      abono: m.abono,
      saldo: m.saldo,
      numeroDocumento: m.numeroDocumento,
      sucursal: m.sucursal,
      categoria: categoriaPorRegla(reglasEfectivas, m.glosa),
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
    });
  });

  const patch: Partial<AppData> = {};
  if (nuevas.length) patch.cartolaMovimientos = [...nuevas, ...data.cartolaMovimientos];
  if (reglasNuevas.length) patch.reglasConciliacion = reglasEfectivas;

  return { patch, nuevos: nuevas.length, duplicados };
}

// Backfill para clientes con Factura que quedaron sin su Empresa (p. ej. los
// que importarClientes creó antes de que sincronizara Empresas, o cualquier
// otro origen histórico): junta un cliente por RUT único que no esté ya en
// Empresas y lo da de alta ahí, con ese cliente como contacto. No toca
// clientes ni borra nada — solo agrega filas nuevas a Empresas.
export function empresasFaltantesDesdeClientes(data: AppData): Empresa[] {
  const rutsEmpresa = new Set(data.empresas.map((e) => formatRut(e.rut)));
  const nuevas: Empresa[] = [];
  for (const c of data.clientes) {
    if (c.tipoDocumento !== "Factura" || !c.rut) continue;
    const rut = formatRut(c.rut);
    if (rutsEmpresa.has(rut)) continue;
    rutsEmpresa.add(rut);
    nuevas.push({
      id: uid(),
      razonSocial: c.razonSocial || c.nombre,
      rut,
      giro: c.giro,
      direccion: c.direccion,
      telefono: c.telefono,
      contactoClienteId: c.id,
      contactoNombre: c.nombre,
      creadoEn: new Date().toISOString(),
      creadoPor: "Sincronización (clientes con Factura)",
    });
  }
  return nuevas;
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
