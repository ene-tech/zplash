/** Clave "YYYY-MM" de una fecha ISO en hora de Chile (no en la hora local del
 * proceso), usada para filtrar movimientos contables por mes y como guarda
 * anti-doble-cobro de los ciclos Oneclick (ver cobrarSuscripcion/
 * cobrarOfertaOneclick en @/lib/pagos). Antes usaba los componentes UTC de
 * `Date` directo: en producción el server corre en UTC, así que un cobro
 * hecho en las últimas horas de un mes chileno (pero ya "el 1" en UTC) quedaba
 * etiquetado con el mes siguiente, y el chequeo de "¿ya se cobró este ciclo?"
 * no lo encontraba — dejaba pasar un segundo cobro real cerca del cambio de
 * mes. Reusa la misma conversión que ahoraEnSantiago (ver más abajo). */
export function mesKey(fecha: string): string {
  const d = fechaEnSantiago(new Date(fecha));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

export function mesActualKey(): string {
  return mesKey(new Date().toISOString());
}

export function todayYMD(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function todayStr(): string {
  return new Date().toDateString();
}

export function sumarDias(fecha: string, delta: number): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Suma `delta` meses calendario, clampando al último día del mes destino
 * cuando el día no existe ahí (31 ene + 1 mes = 28 feb, y no el 3 de marzo al
 * que se desborda `setMonth` solo). Base del ciclo mensual de los planes —
 * ver finCicloPlan en ./clientes. */
export function sumarMesesFecha(fecha: Date, delta: number): Date {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setMonth(d.getMonth() + delta);
  if (d.getDate() !== dia) d.setDate(0);
  return d;
}

export function sumarMeses(fecha: string, delta: number): string {
  return ymd(sumarMesesFecha(new Date(`${fecha}T00:00:00`), delta));
}

export function ymd(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Suma minutos a una fecha+hora "YYYY-MM-DD"+"HH:MM" y devuelve el resultado en el mismo formato (puede cruzar de día). */
export function sumarMinutos(fecha: string, hora: string, minutos: number): { fecha: string; hora: string } {
  const d = new Date(`${fecha}T${hora}:00`);
  d.setMinutes(d.getMinutes() + minutos);
  return { fecha: ymd(d), hora: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") };
}

/** true si `fecha` cae sábado, domingo, o en la lista de festivos configurada (YYYY-MM-DD). */
export function esFinDeSemanaOFestivo(fecha: Date, festivos: string[]): boolean {
  const dia = fecha.getDay(); // 0 = domingo, 6 = sábado
  if (dia === 0 || dia === 6) return true;
  return festivos.includes(ymd(fecha));
}

/** Reempaqueta una fecha real como si fuera hora local del proceso, pero con
 * los componentes (año/mes/día/hora/minuto) de la zona horaria del negocio
 * (America/Santiago). Así, sin importar en qué TZ corra el servidor (en
 * producción, Node/Vercel suele correr en UTC), `getHours()`/`getDay()`/etc.
 * sobre el resultado devuelven la hora de pared de Chile para esa fecha —
 * separada de ahoraEnSantiago (el caso "ahora mismo") para que mesKey pueda
 * convertir una fecha arbitraria sin duplicar el Intl.DateTimeFormat. */
// Construido una sola vez a nivel de módulo, no por llamada: `new
// Intl.DateTimeFormat` es de lo más caro que hay en JS (carga y resuelve los
// datos de locale/zona horaria), y esta función está en el camino caliente de
// planStatus(), que la lista de Clientes llama decenas de miles de veces por
// tecla tipeada al ordenar por estado. El formateador no tiene estado, así
// que reusarlo es seguro.
const FORMATO_SANTIAGO = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function fechaEnSantiago(fecha: Date): Date {
  const partes = FORMATO_SANTIAGO.formatToParts(fecha);
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  // La hora "24" de Intl para medianoche se mapea a 0 en el constructor de Date.
  return new Date(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** `fechaEnSantiago` para el instante actual — necesario para que
 * dentroDeHorarioOperador compare la hora configurada contra la hora real del
 * local y no contra la hora UTC del servidor. */
export function ahoraEnSantiago(): Date {
  return fechaEnSantiago(new Date());
}

/** Día de caja ("YYYY-MM-DD") al que pertenece una fecha ISO, en hora de
 * Chile y no en la del proceso: en producción el server corre en UTC, así que
 * una venta de las 22:00 de Santiago caería "al día siguiente" usando los
 * componentes locales. Es la clave con la que se cierra un día y con la que
 * los guards de cierre deciden si una fila ya quedó congelada (ver
 * CierreCaja en @/types y @/lib/dataAccess/cierre). */
export function diaCaja(iso: string): string {
  return ymd(fechaEnSantiago(new Date(iso)));
}

/** Primer día del mes actual, en formato YYYY-MM-DD. */
export function primerDiaMesActualYMD(): string {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Rango { desde, hasta } (YYYY-MM-DD) del mes calendario anterior al actual. */
export function mesPasadoRango(): { desde: string; hasta: string } {
  const d = new Date();
  return {
    desde: ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    hasta: ymd(new Date(d.getFullYear(), d.getMonth(), 0)),
  };
}

export function inRange(iso: string | null | undefined, desde: string, hasta: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const start = new Date(desde + "T00:00:00");
  const end = new Date(hasta + "T23:59:59.999");
  return d >= start && d <= end;
}

export function fmtDate(d: string): string {
  const dt = new Date(d);
  return (
    dt.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    dt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
  );
}

export function fmtFecha(d: string): string {
  return new Date(d).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtHora(d: string): string {
  return new Date(d).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/** Claves "YYYY-MM" entre dos meses (inclusive), para el EERR comparativo.
 * Acepta el rango invertido y corta en 36 columnas.
 * ponytail: tope duro; si alguien necesita más años, paginar por año. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const idx = (k: string) => {
    const [y, m] = k.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  let a = idx(desde);
  let b = idx(hasta);
  if (Number.isNaN(a) || Number.isNaN(b)) return [mesActualKey()];
  if (b < a) [a, b] = [b, a];
  const out: string[] = [];
  for (let n = a; n <= b && out.length < 36; n++) {
    out.push(Math.floor(n / 12) + "-" + String((n % 12) + 1).padStart(2, "0"));
  }
  return out;
}
