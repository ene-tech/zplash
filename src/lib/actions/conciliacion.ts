import type { AppData, CartolaMovimiento, ReglaConciliacion } from "@/types";
import type { ParsedMovimiento } from "@/lib/cartolaParser";

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
