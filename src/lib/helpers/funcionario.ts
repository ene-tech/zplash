import type {
  MarcaAsistencia,
  PartTime,
  PerfilPublico,
  ReglaOperador,
  TareaTurno,
  TareaTurnoHecha,
  TramoDotacion,
  TramoPartTime,
  TurnoConTareas,
  TurnoFuncionario,
  TurnoTipo,
  ZonaTurno,
} from "@/types";

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** Orden en que se recorre y se muestra la semana: parte en lunes, no en domingo. */
export const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];

export const TURNO_LABELS: Record<TurnoTipo, string> = {
  apertura: "Apertura",
  cierre: "Cierre",
  normal: "Turno normal",
};

export const ZONA_LABELS: Record<ZonaTurno, string> = {
  prelavado: "Prelavado",
  aspirados: "Aspirados",
};

/** Las cuatro combinaciones de turno y zona. Son a la vez los cuatro
 * encargados que reparte el configurador de Apertura y Cierre y los cuatro
 * checklists de tareas: el local se abre y se cierra por zona, y cada
 * encargado responde por el checklist de la suya. El orden es el de pantalla. */
export const TURNOS_ZONA: { turno: TurnoConTareas; zona: ZonaTurno; label: string }[] = [
  { turno: "apertura", zona: "prelavado", label: "Apertura zona prelavado" },
  { turno: "apertura", zona: "aspirados", label: "Apertura zona aspirados" },
  { turno: "cierre", zona: "prelavado", label: "Cierre zona prelavado" },
  { turno: "cierre", zona: "aspirados", label: "Cierre zona aspirados" },
];

/** El nombre en pantalla de un checklist (o del encargado que responde por
 * él): "Cierre zona aspirados". */
export function labelTurnoZona(turno: TurnoConTareas, zona: ZonaTurno): string {
  return TURNOS_ZONA.find((r) => r.turno === turno && r.zona === zona)?.label ?? TURNO_LABELS[turno];
}

/** La clave con que se guarda un combo turno+zona en los vetos de una regla
 * ("cierre|aspirados"). Ver ReglaOperador.vetados. */
export function claveTurnoZona(turno: TurnoConTareas, zona: ZonaTurno): string {
  return `${turno}|${zona}`;
}

/** Id determinista de un tramo de horario: perfil + día + hora de entrada.
 * Volver a guardar el martes a las 08:30 reescribe la misma fila; guardarlo a
 * las 15:00 agrega un segundo tramo (turno partido, con colación entre medio). */
export function idTurnoFuncionario(perfilId: string, diaSemana: number, horaInicio: string): string {
  return `tf-${perfilId}-${diaSemana}-${horaInicio.replace(":", "")}`;
}

/** Agrega (o reescribe) un tramo en la lista de turnos. Dos tramos el mismo
 * día son un turno partido y conviven; dos que se pisan son un error de
 * tipeo, así que el nuevo reemplaza al viejo. Reemplazar también por solape,
 * y no solo por id, es lo que deja corregir las filas antiguas de cuando
 * había un único turno por día (su id no llevaba la hora). */
export function conTramo(turnos: TurnoFuncionario[], fila: TurnoFuncionario): TurnoFuncionario[] {
  const pisa = (t: TurnoFuncionario) =>
    t.perfilId === fila.perfilId &&
    t.diaSemana === fila.diaSemana &&
    t.horaInicio < fila.horaFin &&
    fila.horaInicio < t.horaFin;
  return [...turnos.filter((t) => t.id !== fila.id && !pisa(t)), fila];
}

/** Por qué este tramo rompe la regla horaria del operador, o null si la
 * cumple. El texto viene sin el nombre —"no puede quedarse después de las
 * 18:30"— para que se lo anteponga quien lo muestre.
 *
 * La regla es un tope de horario y no un calendario: `dias` son los días en
 * que APLICA, y los demás la persona trabaja sin restricción. Carlos, que
 * estudia de noche entre semana, tiene la regla de lunes a viernes hasta las
 * 18:30 y el fin de semana se queda hasta el cierre. Sin regla no hay tope.
 *
 * Con `turno` (y `zona` si quien asigna la reparte) también revisa los vetos
 * de apertura y cierre de la regla y su ubicación de trabajo, que no dependen
 * del día.
 *
 * Es la única fuente de verdad de la regla: la usan las tres pantallas que
 * reparten turnos y también el creador de horario. */
export function motivoFueraDeRegla(
  reglas: ReglaOperador[],
  perfilId: string,
  diaSemana: number,
  horaInicio: string,
  horaFin: string,
  turno?: TurnoTipo,
  zona?: ZonaTurno | null
): string | null {
  const r = reglas.find((x) => x.id === perfilId);
  if (!r) return null;
  // La ubicación de trabajo tampoco depende del día ni de la hora: quien
  // trabaja en aspirados no toma un tramo de la otra zona ningún día. Sin zona
  // (Horarios y Turnos asigna el tramo sin repartir sector) no hay nada que
  // romper.
  if (r.zonaFija && zona && zona !== r.zonaFija)
    return `solo trabaja en ${ZONA_LABELS[r.zonaFija].toLowerCase()}`;
  // El veto de apertura/cierre no depende del día: quien no cierra aspirados
  // no los cierra ningún día. Sin zona (Horarios y Turnos asigna el turno sin
  // repartir sector) solo frena si tiene vetados TODOS los sectores del turno.
  if (turno && turno !== "normal") {
    const combos = TURNOS_ZONA.filter((c) => c.turno === turno && (!zona || c.zona === zona));
    if (combos.length && combos.every((c) => r.vetados?.includes(claveTurnoZona(c.turno, c.zona))))
      return `no puede tomar turnos de ${(zona ? labelTurnoZona(turno, zona) : TURNO_LABELS[turno]).toLowerCase()}`;
  }
  if (!r.dias.includes(diaSemana)) return null;
  const dia = DIAS_SEMANA[diaSemana].toLowerCase();
  const losDias = `los ${dia.endsWith("s") ? dia : `${dia}s`}`;
  if (horaInicio < r.horaDesde) return `${losDias} no puede entrar antes de las ${r.horaDesde}`;
  if (horaFin > r.horaHasta) return `${losDias} no puede quedarse después de las ${r.horaHasta}`;
  return null;
}

/** Quién abre (o cierra) una zona un día de la semana (0 = domingo), o null si
 * nadie la tiene asignada. Devuelve la fila completa para poder mostrar
 * también el horario con el que entra. El configurador deja un solo encargado
 * por zona, turno y día (ver TareasTurnoTab). */
export function encargadoDeZona(
  turnos: TurnoFuncionario[],
  diaSemana: number,
  turno: TurnoConTareas,
  zona: ZonaTurno
): TurnoFuncionario | null {
  return turnos.find((t) => t.activo && t.diaSemana === diaSemana && t.turno === turno && t.zona === zona) ?? null;
}

/** Distancia en metros entre dos coordenadas (haversine sobre radio medio
 * terrestre). Se usa para verificar que una marca del libro de asistencia se
 * hizo en el local (ver MarcaAsistencia). */
export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(a))));
}

/** Los tramos que un perfil trabaja un día ("YYYY-MM-DD"), del más temprano al
 * más tarde. Vacío = ese día no trabaja. Ignora las filas desactivadas. */
export function tramosDelDia(turnos: TurnoFuncionario[], perfilId: string, fecha: string): TurnoFuncionario[] {
  const diaSemana = new Date(`${fecha}T00:00:00`).getDay();
  return tramosDelDiaSemana(turnos, perfilId, diaSemana);
}

/** Igual que tramosDelDia pero por día de la semana (0 = domingo), para las
 * pantallas que muestran la semana entera y no una fecha concreta. */
export function tramosDelDiaSemana(
  turnos: TurnoFuncionario[],
  perfilId: string,
  diaSemana: number
): TurnoFuncionario[] {
  return turnos
    .filter((t) => t.activo && t.perfilId === perfilId && t.diaSemana === diaSemana)
    .sort((a, b) => (a.horaInicio < b.horaInicio ? -1 : 1));
}

/** El primer tramo del día, o null si ese día no trabaja: la hora a la que
 * entra y la función con la que llega. */
export function turnoDelDia(
  turnos: TurnoFuncionario[],
  perfilId: string,
  fecha: string
): TurnoFuncionario | null {
  return tramosDelDia(turnos, perfilId, fecha)[0] ?? null;
}

/** El checklist del que un perfil es encargado ese día, o null si ese día no
 * responde por ninguno: día libre, turno "normal" (no abre ni cierra), o
 * trabaja sin zona a cargo. Es lo único que ve el funcionario en Mi Entorno —
 * el reparto de zonas lo hace Administración en Gestión de Equipo. */
export function checklistDelDia(
  turnos: TurnoFuncionario[],
  perfilId: string,
  fecha: string
): (typeof TURNOS_ZONA)[number] | null {
  // Se busca en todos los tramos del día, no solo en el primero: en un turno
  // partido la zona puede estar colgada del tramo de la tarde.
  // ponytail: si alguien queda a cargo de dos checklists el mismo día ve el
  // del tramo más temprano; devolver la lista completa el día que pase.
  for (const t of tramosDelDia(turnos, perfilId, fecha)) {
    const c = TURNOS_ZONA.find((c) => c.turno === t.turno && c.zona === t.zona);
    if (c) return c;
  }
  return null;
}

/** Las tareas activas de un checklist (turno + zona), en orden de ejecución. */
export function tareasDelChecklist(tareas: TareaTurno[], turno: TurnoConTareas, zona: ZonaTurno): TareaTurno[] {
  return tareas.filter((t) => t.activo && t.turno === turno && t.zona === zona).sort((a, b) => a.orden - b.orden);
}

/** Id determinista de una tarea cumplida: marcar dos veces la misma tarea del
 * mismo día, turno y zona es el mismo upsert, no dos filas (ver
 * tareas_turno_hechas). */
export function idTareaHecha(fecha: string, turno: TurnoConTareas, zona: ZonaTurno, tareaId: string): string {
  return `${fecha}|${turno}|${zona}|${tareaId}`;
}

/** Qué corresponde marcar ahora: "salida" si la última marca del día fue una
 * entrada, "entrada" en cualquier otro caso (incluido el primer marcaje del
 * día). Deja marcar varios pares por día — hay turnos partidos. */
export function proximaMarca(marcasDelDiaOrdenadas: MarcaAsistencia[]): "entrada" | "salida" {
  const ultima = marcasDelDiaOrdenadas[marcasDelDiaOrdenadas.length - 1];
  return ultima?.tipo === "entrada" ? "salida" : "entrada";
}

/** Minutos trabajados según los pares entrada→salida de un día. Una entrada
 * sin su salida (el funcionario se fue sin marcar, o está trabajando ahora
 * mismo) no aporta minutos: se informa aparte con `abierta`. */
export function minutosTrabajados(marcasDelDiaOrdenadas: MarcaAsistencia[]): { minutos: number; abierta: boolean } {
  let minutos = 0;
  let entrada: string | null = null;
  for (const m of marcasDelDiaOrdenadas) {
    if (m.tipo === "entrada") {
      entrada = m.marcadoEn;
    } else if (entrada) {
      minutos += Math.max(0, Math.round((Date.parse(m.marcadoEn) - Date.parse(entrada)) / 60000));
      entrada = null;
    }
  }
  return { minutos, abierta: entrada !== null };
}

/** "7h 30m" a partir de minutos. */
export function fmtMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Cuántas tareas de un checklist están hechas ese día, para el avance que se
 * muestra en pantalla. */
export function avanceChecklist(
  tareas: TareaTurno[],
  hechas: TareaTurnoHecha[],
  fecha: string,
  turno: TurnoConTareas,
  zona: ZonaTurno
): { hechas: number; total: number } {
  const delChecklist = tareasDelChecklist(tareas, turno, zona);
  const idsHechas = new Set(
    hechas.filter((h) => h.fecha === fecha && h.turno === turno && h.zona === zona).map((h) => h.tareaId)
  );
  return { hechas: delChecklist.filter((t) => idsHechas.has(t.id)).length, total: delChecklist.length };
}

/** Un tramo de días con la misma hora de apertura y de cierre: el local tiene
 * horario continuado, así que un grupo de días son dos horas y no cuatro. Van
 * varios porque no todos los días abre igual —lunes a viernes por un lado, fin
 * de semana por otro—. */
export interface HorarioLocal {
  /** Días que cubre este horario, 0 = domingo … 6 = sábado. */
  dias: number[];
  /** Hora a la que abre el local; con ella entra el bloque de la mañana. */
  apertura: string;
  /** Hora a la que cierra; con ella sale el bloque de la tarde. */
  cierre: string;
}

/** Criterios con los que se arma una propuesta de horario semanal. Son las
 * reglas del local, no de una persona: cuándo abre cada día y cuántos días
 * libres le tocan a cada uno. El horario de cada bloque es consecuencia de la
 * jornada de ese día: ver proponerHorario. */
export interface CriteriosHorario {
  /** Quiénes entran a la rotación (los demás conservan el horario que tengan). */
  perfilIds: string[];
  /** Horarios de apertura del local, uno por grupo de días. */
  horarios: HorarioLocal[];
  /** Días libres por persona a la semana. */
  diasLibres: number;
  /** Topes horarios por persona (ver motivoFueraDeRegla). A quien no le calce
   * un bloque no se le propone: mejor dejar el puesto vacante y avisarlo que
   * proponer un turno que la pantalla va a rechazar al guardarlo. */
  reglas?: ReglaOperador[];
  /** Dotación requerida por franja y día (ver TramoDotacion). El reparto suma
   * turnos normales hasta cubrirla; lo que no alcance sale en `avisos`. */
  dotacion?: TramoDotacion[];
  /** Planilla part time ya comprometida (ver TramoPartTime). Cuenta como
   * dotación en pie: el peak lo cubre primero el part time y solo lo que
   * quede corto se le pide al equipo de planta. */
  planillaPartTime?: TramoPartTime[];
}

type Bloque = "manana" | "tarde";

/** "08:30" -> 510. */
const aMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Parte una jornada continuada en el bloque que abre y el que cierra: el
 * relevo cae en la mitad, redondeada al cuarto de hora para que no salgan
 * horas como las 14:23.
 * ponytail: corte seco, sin minutos de solape para el traspaso; si el relevo
 * los necesita, restárselos acá al fin de la mañana. */
function bloquesDeJornada(apertura: string, cierre: string): Record<Bloque, { inicio: string; fin: string }> {
  const mitadMin = Math.round((aMinutos(apertura) + aMinutos(cierre)) / 2 / 15) * 15;
  const mitad = `${String(Math.floor(mitadMin / 60)).padStart(2, "0")}:${String(mitadMin % 60).padStart(2, "0")}`;
  return { manana: { inicio: apertura, fin: mitad }, tarde: { inicio: mitad, fin: cierre } };
}

/** Cuántos operadores pide la dotación para una franja de un día: el máximo de
 * los tramos configurados que se pisan con ella, porque dos tramos solapados
 * no se suman —cada uno dice "al menos N"—. Sin tramos que la toquen, 0. */
export function dotacionRequerida(
  dotacion: TramoDotacion[],
  diaSemana: number,
  horaInicio: string,
  horaFin: string
): number {
  return Math.max(
    0,
    ...dotacion
      .filter((t) => t.dias.includes(diaSemana) && t.desde < horaFin && horaInicio < t.hasta)
      .map((t) => t.cantidad)
  );
}

/** Los tramos de una franja de un día, mirados como cuerpos disponibles: el
 * equipo de planta más la planilla part time. Un part time cuenta igual que
 * un funcionario para la dotación —es gente en el local— pero no toma
 * apertura ni cierre, así que no aparece en el horario del equipo. */
function cuerposDelDia(
  turnos: TurnoFuncionario[],
  planilla: TramoPartTime[],
  diaSemana: number
): { desde: string; hasta: string }[] {
  return [
    ...turnos.filter((t) => t.activo && t.diaSemana === diaSemana).map((t) => ({ desde: t.horaInicio, hasta: t.horaFin })),
    ...planilla.filter((p) => p.dias.includes(diaSemana)).map((p) => ({ desde: p.desde, hasta: p.hasta })),
  ];
}

/** Cuánta gente hay en pie en el momento MÁS FLACO de una ventana, contando
 * equipo de planta y part time. Se mira el mínimo y no el promedio: si a las
 * 12:00 hay tres pero a las 15:00 queda uno, esa franja tiene uno. Basta con
 * revisar el inicio de la ventana y cada hora en que alguien entra o sale,
 * que es donde el número puede bajar. */
export function dotacionEnPie(
  turnos: TurnoFuncionario[],
  planilla: TramoPartTime[],
  diaSemana: number,
  desde: string,
  hasta: string
): number {
  const cuerpos = cuerposDelDia(turnos, planilla, diaSemana);
  const cortes = [desde, ...cuerpos.flatMap((c) => [c.desde, c.hasta]).filter((h) => h > desde && h < hasta)];
  return Math.min(...cortes.map((h) => cuerpos.filter((c) => c.desde <= h && h < c.hasta).length));
}

/** Las franjas de la dotación que la semana asignada no alcanza a cubrir,
 * contando el equipo de planta más la planilla part time (ver dotacionEnPie).
 * Son avisos, no bloqueos: la franja corta se ve antes de que llegue el
 * sábado. */
export function avisosDotacion(
  turnos: TurnoFuncionario[],
  dotacion: TramoDotacion[],
  planilla: TramoPartTime[] = []
): string[] {
  const avisos: string[] = [];
  for (const tramo of dotacion)
    for (const dia of tramo.dias.slice().sort((a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b))) {
      const enPie = dotacionEnPie(turnos, planilla, dia, tramo.desde, tramo.hasta);
      if (enPie < tramo.cantidad)
        avisos.push(
          `${DIAS_SEMANA[dia]} ${tramo.desde}-${tramo.hasta}: la dotación pide ${tramo.cantidad} y en algún momento hay ${enPie}.`
        );
    }
  return avisos;
}

/** Tope legal de la jornada part time en Chile (art. 40 bis del Código del
 * Trabajo): 30 horas semanales. Más que eso ya no es part time, y es el
 * divisor con que se estima cuánta gente falta (ver sugerirPartTime). */
export const TOPE_HORAS_PART_TIME = 30;

/** Horas a la semana que la planilla le asigna a un part time. */
export function horasPartTime(planilla: TramoPartTime[], partTimeId: string): number {
  const minutos = planilla
    .filter((t) => t.partTimeId === partTimeId)
    .reduce((n, t) => n + t.dias.length * (aMinutos(t.hasta) - aMinutos(t.desde)), 0);
  return Math.round((minutos / 60) * 10) / 10;
}

/** true si la disponibilidad que declaró esa persona cubre entera la ventana.
 * ponytail: exige que UN horario suyo la cubra completa —no encadena dos ni
 * ofrece cubrir media ventana—; si aparece el caso, partir el hueco. */
export function puedeCubrir(pt: PartTime, diaSemana: number, desde: string, hasta: string): boolean {
  return pt.horarios.some((h) => h.dias.includes(diaSemana) && h.desde <= desde && h.hasta >= hasta);
}

/** La planilla que efectivamente cuenta como dotación: sin los tramos de
 * quien ya no está activo ni de una ficha que se borró. Un tramo huérfano
 * sumaría gente que no va a llegar el sábado. */
export function planillaVigente(planilla: TramoPartTime[], partTimes: PartTime[]): TramoPartTime[] {
  return planilla.filter((t) => partTimes.some((p) => p.id === t.partTimeId && p.activo));
}

/** Avisos de la planilla part time: tramos que caen fuera de la
 * disponibilidad que la persona declaró y semanas sobre el tope part time.
 * Avisos y no bloqueos, igual que avisosLegales: el favor se puede pedir,
 * pero queda a la vista. */
export function avisosPartTime(planilla: TramoPartTime[], partTimes: PartTime[]): string[] {
  const avisos: string[] = [];
  for (const t of planilla) {
    const pt = partTimes.find((p) => p.id === t.partTimeId);
    if (!pt) {
      avisos.push(`Hay un tramo ${t.desde}-${t.hasta} sin part time asignado.`);
      continue;
    }
    const fuera = DIAS_ORDEN.filter((d) => t.dias.includes(d) && !puedeCubrir(pt, d, t.desde, t.hasta));
    if (fuera.length)
      avisos.push(
        `${pt.nombre}: ${fuera.map((d) => DIAS_SEMANA[d]).join(", ")} ${t.desde}-${t.hasta} queda fuera de la disponibilidad que declaró.`
      );
  }
  for (const pt of partTimes) {
    const horas = horasPartTime(planilla, pt.id);
    if (horas > TOPE_HORAS_PART_TIME)
      avisos.push(`${pt.nombre}: ${horas} h a la semana, sobre el tope part time de ${TOPE_HORAS_PART_TIME} h.`);
  }
  return avisos;
}

/** Un trozo de la semana en que la dotación queda corta aun contando la
 * planilla part time: cuántos cuerpos faltan ahí y qué part times de la ficha
 * podrían tomarlo. */
export interface HuecoDotacion {
  diaSemana: number;
  desde: string;
  hasta: string;
  /** Cuerpos que faltan durante toda la ventana. */
  faltan: number;
  /** Part times activos, disponibles a esa hora y todavía sin comprometer. */
  candidatos: PartTime[];
}

/** La semana que tendría que cumplir UNA persona part time nueva: los tramos
 * que viene a cubrir, lo que suman y quién de la ficha podría tomarlos. Es lo
 * que se le publica a quien busca el reemplazo ("sábado y domingo de 12:00 a
 * 16:00, 8 h a la semana"). */
export interface PuestoPartTime {
  tramos: { diaSemana: number; desde: string; hasta: string }[];
  /** Horas a la semana que suman sus tramos. */
  horas: number;
  /** Part times de la ficha que cubren TODOS sus tramos y no están
   * comprometidos a esas horas. */
  candidatos: PartTime[];
}

/** El sugerido de part time: qué le falta a la dotación y cuánta gente hay que
 * sumar para cerrarla. */
export interface SugerenciaPartTime {
  huecos: HuecoDotacion[];
  /** Un puesto por persona que hay que sumar, con el horario que debe cumplir. */
  puestos: PuestoPartTime[];
  /** Horas part time a la semana que hay que comprar. */
  horas: number;
  /** Personas part time que faltan: los puestos que salieron del reparto. */
  personas: number;
  /** De esas, cuántas pueden salir de la ficha: disponibles y sin asignar. */
  enLaFicha: number;
}

/** Cuántos part time faltan para cumplir la dotación con el horario que hoy
 * tiene el equipo y la planilla ya comprometida.
 *
 * Recorre la semana por tramos —el déficit solo puede cambiar donde empieza o
 * termina una franja de dotación o donde alguien entra o sale— y junta los
 * trozos pegados que van cortos por lo mismo, para que el sugerido diga
 * "sábado de 12:00 a 16:00 falta 1" y no cuatro pedazos.
 *
 * Los huecos después se reparten en puestos: la semana concreta que tendría
 * que cumplir cada persona que se contrate. El reparto es codicioso —cada
 * cuerpo que falta se le da al primer puesto que lo pueda tomar sin pisarse
 * con lo que ya lleva ni pasarse del tope part time, y si ninguno puede se
 * abre uno nuevo—, así que la cantidad de personas es el largo de esa lista.
 * ponytail: primer calce y no el mínimo de personas posible (eso es bin
 * packing); alcanza para no repartir cuatro sábados sueltos entre cuatro
 * personas. Sigue siendo un sugerido: quién toma cada puesto se decide a mano
 * en la planilla. */
export function sugerirPartTime(
  turnos: TurnoFuncionario[],
  dotacion: TramoDotacion[],
  planilla: TramoPartTime[],
  partTimes: PartTime[]
): SugerenciaPartTime {
  const huecos: HuecoDotacion[] = [];
  const dias = [...new Set(dotacion.flatMap((d) => d.dias))].sort(
    (a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b)
  );
  for (const dia of dias) {
    const cuerpos = cuerposDelDia(turnos, planilla, dia);
    const cortes = [
      ...new Set([
        ...dotacion.filter((d) => d.dias.includes(dia)).flatMap((d) => [d.desde, d.hasta]),
        ...cuerpos.flatMap((c) => [c.desde, c.hasta]),
      ]),
    ].sort();
    for (let i = 0; i < cortes.length - 1; i++) {
      const desde = cortes[i];
      const hasta = cortes[i + 1];
      const faltan =
        dotacionRequerida(dotacion, dia, desde, hasta) -
        cuerpos.filter((c) => c.desde <= desde && desde < c.hasta).length;
      if (faltan <= 0) continue;
      const ultimo = huecos[huecos.length - 1];
      if (ultimo && ultimo.diaSemana === dia && ultimo.hasta === desde && ultimo.faltan === faltan)
        ultimo.hasta = hasta;
      else huecos.push({ diaSemana: dia, desde, hasta, faltan, candidatos: [] });
    }
  }
  /** Los de la ficha que pueden tomar esa ventana entera: activos, con la
   * disponibilidad que declararon y sin otro tramo a esa misma hora. */
  const disponibles = (diaSemana: number, desde: string, hasta: string) =>
    partTimes.filter(
      (pt) =>
        pt.activo &&
        puedeCubrir(pt, diaSemana, desde, hasta) &&
        // Nadie puede cubrir dos tramos a la misma hora.
        !planilla.some(
          (t) => t.partTimeId === pt.id && t.dias.includes(diaSemana) && t.desde < hasta && desde < t.hasta
        )
    );
  for (const h of huecos) h.candidatos = disponibles(h.diaSemana, h.desde, h.hasta);

  const horasTramos = (tramos: PuestoPartTime["tramos"]) =>
    tramos.reduce((n, t) => n + (aMinutos(t.hasta) - aMinutos(t.desde)), 0) / 60;
  const puestos: PuestoPartTime[] = [];
  for (const h of huecos)
    // Un hueco al que le faltan dos cuerpos son dos personas: el mismo tramo
    // no le puede caber dos veces a la misma (se pisa consigo mismo).
    for (let i = 0; i < h.faltan; i++) {
      const tramo = { diaSemana: h.diaSemana, desde: h.desde, hasta: h.hasta };
      const puesto = puestos.find(
        (p) =>
          horasTramos([...p.tramos, tramo]) <= TOPE_HORAS_PART_TIME &&
          !p.tramos.some((t) => t.diaSemana === h.diaSemana && t.desde < h.hasta && h.desde < t.hasta)
      );
      if (puesto) puesto.tramos.push(tramo);
      else puestos.push({ tramos: [tramo], horas: 0, candidatos: [] });
    }
  for (const p of puestos) {
    p.horas = Math.round(horasTramos(p.tramos) * 10) / 10;
    // Candidato del puesto es quien puede con TODOS sus tramos, no con uno.
    p.candidatos = p.tramos
      .map((t) => disponibles(t.diaSemana, t.desde, t.hasta))
      .reduce((a, b) => a.filter((pt) => b.includes(pt)));
  }

  return {
    huecos,
    puestos,
    horas: Math.round(horasTramos(puestos.flatMap((p) => p.tramos)) * 10) / 10,
    personas: puestos.length,
    enLaFicha: new Set(huecos.flatMap((h) => h.candidatos.map((p) => p.id))).size,
  };
}

/** Arma una propuesta de horario semanal: reparte los cuatro encargados que
 * necesita cada día que abre el local (ver TURNOS_ZONA) y después completa la
 * semana de cada uno con turnos normales hasta llegar a sus días trabajados.
 *
 * El reparto es codicioso y desempata en tres criterios: primero quien lleva
 * menos días trabajados, después quien lleva menos veces ese bloque (para que
 * la mañana y la tarde no le caigan siempre a la misma persona) y al final una
 * rotación por día, para que el empate no premie siempre al primero de la lista.
 *
 * No inventa cobertura: si con la gente disponible no alcanza para los cuatro
 * encargados de un día, ese puesto queda vacante y sale en `avisos` — mejor
 * verlo antes de aplicar que descubrirlo el sábado a las 8 de la mañana.
 *
 * Como el local no cierra al mediodía, la jornada de cada día se parte por la
 * mitad (ver bloquesDeJornada): el bloque de la mañana abre y el de la tarde
 * cierra. Los días con horario distinto —el fin de semana suele abrir más
 * tarde— parten en su propia mitad, no en una común. Propone un solo tramo por
 * persona y día: el turno partido (ver conTramo) se arma a mano sobre la
 * propuesta ya aplicada.
 *
 * Es solo una propuesta: devuelve filas listas para guardar (id determinista,
 * ver idTurnoFuncionario) pero no toca la base; se aplica desde la pantalla.
 */
export function proponerHorario(c: CriteriosHorario): { turnos: TurnoFuncionario[]; avisos: string[] } {
  // Un día lo cubre el primer horario que lo marque: si dos se pisan gana el de
  // más arriba en pantalla, y así ningún día queda con dos jornadas distintas.
  const bloquesPorDia = new Map<number, ReturnType<typeof bloquesDeJornada>>();
  for (const h of c.horarios)
    for (const dia of h.dias)
      if (!bloquesPorDia.has(dia)) bloquesPorDia.set(dia, bloquesDeJornada(h.apertura, h.cierre));
  const dias = [...bloquesPorDia.keys()].sort((a, b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b));
  const maxDias = Math.max(0, Math.min(dias.length, 7 - c.diasLibres));
  const avisos: string[] = [];
  const turnos: TurnoFuncionario[] = [];
  // dias = jornadas ya asignadas; manana/tarde = veces que le tocó cada bloque.
  const carga = new Map(c.perfilIds.map((id) => [id, { dias: 0, manana: 0, tarde: 0 }]));

  if (c.perfilIds.length < TURNOS_ZONA.length)
    avisos.push(
      `Con ${c.perfilIds.length} en la rotación no alcanza para los ${TURNOS_ZONA.length} encargados que necesita cada día que abre el local.`
    );

  const ocupado = (perfilId: string, dia: number) => turnos.some((t) => t.perfilId === perfilId && t.diaSemana === dia);

  const puede = (perfilId: string, dia: number, bloque: Bloque, rol?: (typeof TURNOS_ZONA)[number]) =>
    !motivoFueraDeRegla(
      c.reglas ?? [],
      perfilId,
      dia,
      bloquesPorDia.get(dia)![bloque].inicio,
      bloquesPorDia.get(dia)![bloque].fin,
      rol?.turno,
      rol?.zona
    );

  const elegir = (dia: number, bloque: Bloque, rol?: (typeof TURNOS_ZONA)[number]) =>
    c.perfilIds
      .filter((id) => !ocupado(id, dia) && carga.get(id)!.dias < maxDias && puede(id, dia, bloque, rol))
      .sort((a, b) => {
        const ca = carga.get(a)!;
        const cb = carga.get(b)!;
        return (
          ca.dias - cb.dias ||
          ca[bloque] - cb[bloque] ||
          // Rotación: el desempate arranca en otra persona cada día.
          ((c.perfilIds.indexOf(a) + dia) % c.perfilIds.length) -
            ((c.perfilIds.indexOf(b) + dia) % c.perfilIds.length)
        );
      })[0];

  const asignar = (perfilId: string, dia: number, turno: TurnoTipo, zona: ZonaTurno | null, bloque: Bloque) => {
    const horario = bloquesPorDia.get(dia)![bloque];
    turnos.push({
      id: idTurnoFuncionario(perfilId, dia, horario.inicio),
      perfilId,
      diaSemana: dia,
      turno,
      zona,
      horaInicio: horario.inicio,
      horaFin: horario.fin,
      activo: true,
    });
    const cargaDe = carga.get(perfilId)!;
    cargaDe.dias++;
    cargaDe[bloque]++;
  };

  for (const dia of dias)
    for (const rol of TURNOS_ZONA) {
      const bloque: Bloque = rol.turno === "cierre" ? "tarde" : "manana";
      const elegido = elegir(dia, bloque, rol);
      if (!elegido) {
        avisos.push(`${DIAS_SEMANA[dia]}: ${rol.label} queda sin encargado.`);
        continue;
      }
      asignar(elegido, dia, rol.turno, rol.zona, bloque);
    }

  // Dotación: los cuatro encargados son el piso, no el techo. Si una franja
  // pide más gente se suman turnos normales, y siempre al bloque que va más
  // corto: repartir por déficit evita que la mañana se lleve a todos y la
  // tarde quede pelada cuando el peak cruza el relevo.
  // ponytail: el refuerzo entra por bloque de jornada, no minuto a minuto, así
  // que un peak de 12 a 16 que cruza el relevo pide la cantidad completa en la
  // mañana Y en la tarde. Si hace falta un tramo que arranque dentro del peak,
  // se agrega a mano sobre la propuesta (o se cubre con un part time).
  const planilla = c.planillaPartTime ?? [];
  const franjas = dias.flatMap((dia) =>
    (["manana", "tarde"] as Bloque[]).map((bloque) => ({ dia, bloque, ...bloquesPorDia.get(dia)![bloque] }))
  );
  // Lo que le falta a un bloque: por cada franja de dotación que lo toca, lo
  // que esa franja pide menos lo que hay en pie en el trozo que comparten —el
  // equipo ya asignado ese día y la planilla part time—. Se mide contra el
  // trozo compartido y no contra el bloque entero para no mandar a nadie a las
  // 09:40 por un peak que recién arranca a las 12:00.
  const faltan = (f: (typeof franjas)[number]) =>
    Math.max(
      0,
      ...(c.dotacion ?? [])
        .filter((d) => d.dias.includes(f.dia) && d.desde < f.fin && f.inicio < d.hasta)
        .map(
          (d) =>
            d.cantidad -
            dotacionEnPie(
              turnos,
              planilla,
              f.dia,
              d.desde > f.inicio ? d.desde : f.inicio,
              d.hasta < f.fin ? d.hasta : f.fin
            )
        )
    );
  const sinGente = new Set<string>();
  for (;;) {
    const peor = franjas
      .filter((f) => !sinGente.has(`${f.dia}|${f.bloque}`) && faltan(f) > 0)
      .sort((a, b) => faltan(b) - faltan(a))[0];
    if (!peor) break;
    const elegido = elegir(peor.dia, peor.bloque);
    // Nadie disponible para ese bloque: se deja corto (lo reporta
    // avisosDotacion) y se sigue con los demás, que pueden tener a quién.
    if (!elegido) {
      sinGente.add(`${peor.dia}|${peor.bloque}`);
      continue;
    }
    asignar(elegido, peor.dia, "normal", null, peor.bloque);
  }

  // Relleno: a quien le falten días de jornada se le da turno normal (trabaja
  // pero no es encargado de ninguna zona) en el bloque que menos le ha tocado.
  for (const perfilId of c.perfilIds)
    for (const dia of dias) {
      const cargaDe = carga.get(perfilId)!;
      if (cargaDe.dias >= maxDias) break;
      if (ocupado(perfilId, dia)) continue;
      // El bloque que menos le ha tocado; si su regla no se lo permite, el
      // otro; si ninguno le calza ese día, se queda libre.
      const preferido: Bloque = cargaDe.manana <= cargaDe.tarde ? "manana" : "tarde";
      const bloque = ([preferido, preferido === "manana" ? "tarde" : "manana"] as Bloque[]).find((b) =>
        puede(perfilId, dia, b)
      );
      if (!bloque) continue;
      asignar(perfilId, dia, "normal", null, bloque);
    }

  avisos.push(...avisosDotacion(turnos, c.dotacion ?? [], planilla));

  return { turnos: turnos.sort((a, b) => a.diaSemana - b.diaSemana), avisos };
}

/** Topes legales de la jornada (Chile): 40 horas semanales y no más de 5 días
 * seguidos de trabajo. Los 2 domingos libres al mes no son un número que se
 * pueda contar acá —ver avisosLegales—. */
export const TOPE_HORAS_SEMANA = 40;
export const TOPE_DIAS_SEGUIDOS = 5;

/** Revisa la semana de cada persona contra los topes legales y devuelve un
 * aviso por infracción. No bloquea nada: se pueden hacer excepciones, pero
 * quedan a la vista antes de aplicar el horario y no aparecen el día que
 * alguien reclame.
 *
 * El horario es una plantilla que se repite todas las semanas, así que:
 * - los días seguidos se cuentan dando la vuelta (el sábado empalma con el
 *   domingo de la semana siguiente), y
 * - quien tiene turno el domingo lo tiene TODOS los domingos del mes, o sea
 *   cero domingos libres de los 2 que pide la ley. Un domingo suelto se
 *   arregla quitándole ese turno en la semana que corresponda.
 */
export function avisosLegales(turnos: TurnoFuncionario[], funcionarios: PerfilPublico[]): string[] {
  const avisos: string[] = [];
  for (const f of funcionarios) {
    const suyos = turnos.filter((t) => t.perfilId === f.id && t.activo);
    if (!suyos.length) continue;

    const minutos = suyos.reduce((n, t) => n + (aMinutos(t.horaFin) - aMinutos(t.horaInicio)), 0);
    if (minutos > TOPE_HORAS_SEMANA * 60)
      avisos.push(`${f.nombre}: ${fmtMinutos(minutos)} a la semana, sobre el tope legal de ${TOPE_HORAS_SEMANA} h.`);

    // Dos vueltas a la semana para pillar la racha que cruza el sábado; el
    // tope es 7 porque más allá de eso es la misma racha repitiéndose.
    const trabaja = new Set(suyos.map((t) => t.diaSemana));
    let racha = 0;
    let mayor = 0;
    for (let d = 0; d < 14; d++) {
      racha = trabaja.has(d % 7) ? racha + 1 : 0;
      mayor = Math.max(mayor, Math.min(racha, 7));
    }
    if (mayor > TOPE_DIAS_SEGUIDOS)
      avisos.push(`${f.nombre}: ${mayor} días seguidos, sobre el tope legal de ${TOPE_DIAS_SEGUIDOS}.`);

    if (trabaja.has(0))
      avisos.push(`${f.nombre}: trabaja todos los domingos; la ley pide 2 domingos libres al mes.`);
  }
  return avisos;
}
