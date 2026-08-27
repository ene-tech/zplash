import { describe, expect, it } from "vitest";
import {
  avanceChecklist,
  avisosLegales,
  checklistDelDia,
  distanciaMetros,
  avisosDotacion,
  avisosPartTime,
  dotacionRequerida,
  horasPartTime,
  planillaVigente,
  sugerirPartTime,
  encargadoDeZona,
  idTareaHecha,
  minutosTrabajados,
  proximaMarca,
  tareasDelChecklist,
  turnoDelDia,
  tramosDelDia,
  motivoFueraDeRegla,
  conTramo,
  proponerHorario,
  TURNOS_ZONA,
} from "./helpers/funcionario";
import type { MarcaAsistencia, PartTime, TareaTurno, TareaTurnoHecha, TramoPartTime, TurnoFuncionario } from "@/types";

// Local de referencia (ZPlash, Chicureo) para las pruebas de distancia.
const LOCAL = { lat: -33.29, lng: -70.68 };

function marca(tipo: MarcaAsistencia["tipo"], hora: string, overrides: Partial<MarcaAsistencia> = {}): MarcaAsistencia {
  return {
    id: `${tipo}-${hora}`,
    perfilId: "p1",
    perfilNombre: "Christian",
    fecha: "2026-08-18",
    tipo,
    marcadoEn: `2026-08-18T${hora}:00.000Z`,
    ...overrides,
  };
}

function turno(diaSemana: number, overrides: Partial<TurnoFuncionario> = {}): TurnoFuncionario {
  return {
    id: `tf-p1-${diaSemana}-${(overrides.horaInicio ?? "08:30").replace(":", "")}`,
    perfilId: "p1",
    diaSemana,
    turno: "apertura",
    horaInicio: "08:30",
    horaFin: "17:00",
    activo: true,
    ...overrides,
  };
}

describe("encargadoDeZona", () => {
  // Un lunes cualquiera: p1 abre prelavado, p2 abre aspirados y p3 cierra
  // prelavado. El cierre de aspirados no lo tiene nadie.
  const turnos = [
    turno(1, { zona: "prelavado" }),
    turno(1, { id: "tf-p2-1", perfilId: "p2", zona: "aspirados" }),
    turno(1, { id: "tf-p3-1", perfilId: "p3", turno: "cierre", zona: "prelavado" }),
  ];

  it("distingue una zona de la otra dentro del mismo turno", () => {
    expect(encargadoDeZona(turnos, 1, "apertura", "prelavado")?.perfilId).toBe("p1");
    expect(encargadoDeZona(turnos, 1, "apertura", "aspirados")?.perfilId).toBe("p2");
  });

  it("no confunde al encargado de cierre con el de apertura de la misma zona", () => {
    expect(encargadoDeZona(turnos, 1, "cierre", "prelavado")?.perfilId).toBe("p3");
    expect(encargadoDeZona(turnos, 1, "cierre", "aspirados")).toBeNull();
  });

  it("es null el día en que nadie tiene la zona", () => {
    expect(encargadoDeZona(turnos, 2, "apertura", "prelavado")).toBeNull();
  });

  it("ignora los turnos desactivados y los que quedaron sin zona", () => {
    expect(encargadoDeZona([turno(3, { zona: "prelavado", activo: false })], 3, "apertura", "prelavado")).toBeNull();
    expect(encargadoDeZona([turno(3, { zona: null })], 3, "apertura", "prelavado")).toBeNull();
  });
});

describe("distanciaMetros", () => {
  it("es 0 en el mismo punto", () => {
    expect(distanciaMetros(LOCAL.lat, LOCAL.lng, LOCAL.lat, LOCAL.lng)).toBe(0);
  });

  it("mide ~111 m por cada milésima de grado de latitud", () => {
    const d = distanciaMetros(LOCAL.lat, LOCAL.lng, LOCAL.lat + 0.001, LOCAL.lng);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it("deja fuera del radio por defecto (150 m) un punto a ~1 km", () => {
    expect(distanciaMetros(LOCAL.lat, LOCAL.lng, LOCAL.lat + 0.009, LOCAL.lng)).toBeGreaterThan(150);
  });
});

describe("turnoDelDia", () => {
  // 2026-08-18 es martes (diaSemana 2).
  const turnos = [turno(2), turno(3, { turno: "cierre", activo: false })];

  it("encuentra el turno del día de la semana que corresponde", () => {
    expect(turnoDelDia(turnos, "p1", "2026-08-18")?.turno).toBe("apertura");
  });

  it("es null el día que no tiene turno asignado", () => {
    expect(turnoDelDia(turnos, "p1", "2026-08-17")).toBeNull();
  });

  it("ignora los turnos desactivados", () => {
    expect(turnoDelDia(turnos, "p1", "2026-08-19")).toBeNull();
  });

  it("no devuelve el turno de otro funcionario", () => {
    expect(turnoDelDia(turnos, "p2", "2026-08-18")).toBeNull();
  });
});

describe("turno partido", () => {
  // Martes 2026-08-18: mañana 08:30-13:00 y tarde 14:00-19:00, con la colación
  // entre medio. La zona a cargo cuelga del tramo de la tarde.
  const partido = [
    turno(2, { horaInicio: "14:00", horaFin: "19:00", turno: "cierre", zona: "aspirados" }),
    turno(2, { horaInicio: "08:30", horaFin: "13:00", turno: "normal" }),
  ];

  it("devuelve los dos tramos del día, del más temprano al más tarde", () => {
    expect(tramosDelDia(partido, "p1", "2026-08-18").map((t) => t.horaInicio)).toEqual(["08:30", "14:00"]);
  });

  it("turnoDelDia devuelve el tramo con el que entra", () => {
    expect(turnoDelDia(partido, "p1", "2026-08-18")?.horaInicio).toBe("08:30");
  });

  it("el checklist se busca en todos los tramos, no solo en el primero", () => {
    expect(checklistDelDia(partido, "p1", "2026-08-18")).toMatchObject({ turno: "cierre", zona: "aspirados" });
  });

  it("conTramo deja convivir dos tramos que no se pisan", () => {
    const manana = turno(2, { horaInicio: "08:30", horaFin: "13:00" });
    const tarde = turno(2, { horaInicio: "14:00", horaFin: "19:00" });
    expect(conTramo([manana], tarde)).toHaveLength(2);
  });

  it("conTramo reemplaza el tramo que se pisa con el nuevo, aunque tenga otro id", () => {
    const viejo = { ...turno(2, { horaInicio: "08:30", horaFin: "17:00" }), id: "tf-p1-2" };
    const nuevo = turno(2, { horaInicio: "14:00", horaFin: "19:00" });
    expect(conTramo([viejo], nuevo)).toEqual([nuevo]);
  });

  it("conTramo no toca los tramos de otro día ni de otra persona", () => {
    const otroDia = turno(3);
    const otroPerfil = { ...turno(2), id: "tf-p2-2-0830", perfilId: "p2" };
    expect(conTramo([otroDia, otroPerfil], turno(2))).toHaveLength(3);
  });
});

describe("checklistDelDia", () => {
  // 2026-08-18 es martes (diaSemana 2).
  it("devuelve el checklist de la zona que tiene a cargo ese día", () => {
    const turnos = [turno(2, { zona: "aspirados" })];
    expect(checklistDelDia(turnos, "p1", "2026-08-18")).toMatchObject({ turno: "apertura", zona: "aspirados" });
  });

  it("es null si trabaja pero sin zona a cargo", () => {
    expect(checklistDelDia([turno(2, { zona: null })], "p1", "2026-08-18")).toBeNull();
  });

  it("es null en un turno normal, aunque tenga zona", () => {
    expect(checklistDelDia([turno(2, { turno: "normal", zona: "prelavado" })], "p1", "2026-08-18")).toBeNull();
  });

  it("es null el día libre", () => {
    expect(checklistDelDia([turno(2, { zona: "prelavado" })], "p1", "2026-08-17")).toBeNull();
  });
});

describe("proximaMarca", () => {
  it("la primera marca del día es una entrada", () => {
    expect(proximaMarca([])).toBe("entrada");
  });

  it("después de una entrada corresponde marcar salida", () => {
    expect(proximaMarca([marca("entrada", "12:00")])).toBe("salida");
  });

  it("después de una salida vuelve a corresponder entrada (turno partido)", () => {
    expect(proximaMarca([marca("entrada", "12:00"), marca("salida", "16:00")])).toBe("entrada");
  });
});

describe("minutosTrabajados", () => {
  it("suma los pares entrada→salida", () => {
    const r = minutosTrabajados([marca("entrada", "12:00"), marca("salida", "16:30")]);
    expect(r).toEqual({ minutos: 270, abierta: false });
  });

  it("suma varios pares del mismo día", () => {
    const r = minutosTrabajados([
      marca("entrada", "12:00"),
      marca("salida", "14:00"),
      marca("entrada", "15:00"),
      marca("salida", "17:00"),
    ]);
    expect(r.minutos).toBe(240);
  });

  it("no cuenta una entrada sin salida, pero avisa que quedó abierta", () => {
    const r = minutosTrabajados([marca("entrada", "12:00"), marca("salida", "14:00"), marca("entrada", "15:00")]);
    expect(r).toEqual({ minutos: 120, abierta: true });
  });

  it("ignora una salida huérfana en vez de contar minutos negativos", () => {
    expect(minutosTrabajados([marca("salida", "14:00")])).toEqual({ minutos: 0, abierta: false });
  });
});

describe("checklist de turno y zona", () => {
  const tareas: TareaTurno[] = [
    { id: "t2", turno: "cierre", zona: "prelavado", descripcion: "Cortar matriz general", orden: 2, activo: true },
    { id: "t1", turno: "cierre", zona: "prelavado", descripcion: "Cambiar el selector de luz", orden: 1, activo: true },
    { id: "t3", turno: "cierre", zona: "prelavado", descripcion: "Tarea vieja", orden: 3, activo: false },
    { id: "t5", turno: "cierre", zona: "aspirados", descripcion: "Vaciar bolsas de aspirado", orden: 1, activo: true },
    { id: "t4", turno: "apertura", zona: "prelavado", descripcion: "Purgar compresores", orden: 1, activo: true },
  ];

  it("devuelve solo las tareas activas de ese turno y zona, en orden de ejecución", () => {
    expect(tareasDelChecklist(tareas, "cierre", "prelavado").map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(tareasDelChecklist(tareas, "cierre", "aspirados").map((t) => t.id)).toEqual(["t5"]);
  });

  it("el id de una tarea hecha es determinista y separa las zonas", () => {
    expect(idTareaHecha("2026-08-18", "cierre", "prelavado", "t1")).toBe(
      idTareaHecha("2026-08-18", "cierre", "prelavado", "t1")
    );
    expect(idTareaHecha("2026-08-18", "cierre", "prelavado", "t1")).not.toBe(
      idTareaHecha("2026-08-19", "cierre", "prelavado", "t1")
    );
    expect(idTareaHecha("2026-08-18", "cierre", "prelavado", "t1")).not.toBe(
      idTareaHecha("2026-08-18", "cierre", "aspirados", "t1")
    );
  });

  it("el avance cuenta contra las tareas activas de ese turno y zona", () => {
    const hechas: TareaTurnoHecha[] = [
      {
        id: idTareaHecha("2026-08-18", "cierre", "prelavado", "t1"),
        fecha: "2026-08-18",
        turno: "cierre",
        zona: "prelavado",
        tareaId: "t1",
        perfilId: "p1",
        perfilNombre: "Christian",
        completadoEn: "2026-08-18T22:00:00.000Z",
      },
      // Marca de otro día: no debe contar en el avance de hoy.
      {
        id: idTareaHecha("2026-08-17", "cierre", "prelavado", "t2"),
        fecha: "2026-08-17",
        turno: "cierre",
        zona: "prelavado",
        tareaId: "t2",
        perfilId: "p1",
        perfilNombre: "Christian",
        completadoEn: "2026-08-17T22:00:00.000Z",
      },
    ];
    expect(avanceChecklist(tareas, hechas, "2026-08-18", "cierre", "prelavado")).toEqual({ hechas: 1, total: 2 });
    // La misma marca no puede colarse en el avance de la otra zona.
    expect(avanceChecklist(tareas, hechas, "2026-08-18", "cierre", "aspirados")).toEqual({ hechas: 0, total: 1 });
    expect(avanceChecklist(tareas, hechas, "2026-08-18", "apertura", "prelavado")).toEqual({ hechas: 0, total: 1 });
  });
});

describe("motivoFueraDeRegla", () => {
  // Carlos puede trabajar todos los días, pero de lunes a viernes se tiene que
  // ir a las 18:30 a estudiar: la regla APLICA de lunes a viernes.
  const reglas = [{ id: "p1", dias: [1, 2, 3, 4, 5], horaDesde: "08:00", horaHasta: "18:30" }];

  it("deja pasar el tramo que cabe en la ventana", () => {
    expect(motivoFueraDeRegla(reglas, "p1", 3, "08:30", "17:00")).toBeNull();
  });

  it("rechaza, el día en que aplica, el tramo que se pasa del tope", () => {
    expect(motivoFueraDeRegla(reglas, "p1", 3, "13:15", "20:15")).toBe(
      "los miércoles no puede quedarse después de las 18:30"
    );
  });

  it("rechaza el tramo que empieza antes de la hora de entrada", () => {
    expect(motivoFueraDeRegla(reglas, "p1", 3, "07:00", "15:00")).toBe("los miércoles no puede entrar antes de las 08:00");
  });

  it("el día que la regla NO aplica no tiene tope: el sábado se queda hasta el cierre", () => {
    expect(motivoFueraDeRegla(reglas, "p1", 6, "13:15", "20:15")).toBeNull();
    expect(motivoFueraDeRegla(reglas, "p1", 0, "06:00", "23:00")).toBeNull();
  });

  it("pluraliza el nombre del día", () => {
    const finDeSemana = [{ ...reglas[0], dias: [0, 6] }];
    expect(motivoFueraDeRegla(finDeSemana, "p1", 0, "08:30", "20:15")).toBe(
      "los domingos no puede quedarse después de las 18:30"
    );
    expect(motivoFueraDeRegla(finDeSemana, "p1", 6, "08:30", "20:15")).toBe(
      "los sábados no puede quedarse después de las 18:30"
    );
  });

  it("sin regla no hay tope, y una regla es solo de su dueño", () => {
    expect(motivoFueraDeRegla([], "p1", 3, "06:00", "23:00")).toBeNull();
    expect(motivoFueraDeRegla(reglas, "p2", 3, "06:00", "23:00")).toBeNull();
    expect(motivoFueraDeRegla([{ ...reglas[0], dias: [] }], "p1", 3, "06:00", "23:00")).toBeNull();
  });

  // El veto de apertura/cierre no mira el día ni la hora: si no cierra
  // aspirados, no los cierra ningún día aunque su horario dé.
  const sinCierreAspirados = [{ ...reglas[0], dias: [], vetados: ["cierre|aspirados"] }];

  it("rechaza el turno vetado y deja pasar los demás", () => {
    expect(motivoFueraDeRegla(sinCierreAspirados, "p1", 6, "08:00", "17:00", "cierre", "aspirados")).toBe(
      "no puede tomar turnos de cierre zona aspirados"
    );
    expect(motivoFueraDeRegla(sinCierreAspirados, "p1", 6, "08:00", "17:00", "cierre", "prelavado")).toBeNull();
    expect(motivoFueraDeRegla(sinCierreAspirados, "p1", 6, "08:00", "17:00", "apertura", "aspirados")).toBeNull();
    expect(motivoFueraDeRegla(sinCierreAspirados, "p1", 6, "08:00", "17:00", "normal", null)).toBeNull();
  });

  // Ubicación de trabajo: Carlos presta servicio solo en aspirados.
  const soloAspirados = [{ ...reglas[0], dias: [], zonaFija: "aspirados" as const }];

  it("rechaza cualquier tramo de la otra zona, aunque el horario dé", () => {
    expect(motivoFueraDeRegla(soloAspirados, "p1", 6, "08:00", "17:00", "apertura", "prelavado")).toBe(
      "solo trabaja en aspirados"
    );
    expect(motivoFueraDeRegla(soloAspirados, "p1", 3, "08:00", "17:00", "normal", "prelavado")).toBe(
      "solo trabaja en aspirados"
    );
    expect(motivoFueraDeRegla(soloAspirados, "p1", 6, "08:00", "17:00", "cierre", "aspirados")).toBeNull();
    // Sin zona (Horarios y Turnos asigna el tramo sin repartir sector) no hay
    // nada que romper.
    expect(motivoFueraDeRegla(soloAspirados, "p1", 6, "08:00", "17:00", "normal", null)).toBeNull();
    expect(motivoFueraDeRegla(soloAspirados, "p1", 6, "08:00", "17:00")).toBeNull();
  });

  it("sin zona (Horarios y Turnos) solo frena si tiene vetados todos los sectores del turno", () => {
    expect(motivoFueraDeRegla(sinCierreAspirados, "p1", 6, "08:00", "17:00", "cierre")).toBeNull();
    const sinCierre = [{ ...reglas[0], dias: [], vetados: ["cierre|aspirados", "cierre|prelavado"] }];
    expect(motivoFueraDeRegla(sinCierre, "p1", 6, "08:00", "17:00", "cierre")).toBe(
      "no puede tomar turnos de cierre"
    );
  });
});

describe("proponerHorario", () => {
  // Cinco personas, el local abre los siete días y cada uno descansa uno.
  const criterios = {
    perfilIds: ["p1", "p2", "p3", "p4", "p5"],
    diasLibres: 1,
    horarios: [{ dias: [0, 1, 2, 3, 4, 5, 6], apertura: "08:30", cierre: "20:15" }],
  };
  const diasAbierto = criterios.horarios[0].dias;

  it("deja los cuatro encargados cubiertos cada día que abre el local", () => {
    const { turnos, avisos } = proponerHorario(criterios);
    expect(avisos).toEqual([]);
    for (const dia of diasAbierto)
      for (const rol of TURNOS_ZONA) expect(encargadoDeZona(turnos, dia, rol.turno, rol.zona)).not.toBeNull();
  });

  it("no le pone a nadie dos tramos el mismo día ni más días que su jornada", () => {
    const { turnos } = proponerHorario(criterios);
    for (const perfilId of criterios.perfilIds) {
      const dias = turnos.filter((t) => t.perfilId === perfilId).map((t) => t.diaSemana);
      expect(new Set(dias).size).toBe(dias.length);
      expect(dias.length).toBeLessThanOrEqual(6);
    }
  });

  it("reparte parejo: entre el que más trabaja y el que menos hay a lo más un día", () => {
    const { turnos } = proponerHorario(criterios);
    const cargas = criterios.perfilIds.map((id) => turnos.filter((t) => t.perfilId === id).length);
    expect(Math.max(...cargas) - Math.min(...cargas)).toBeLessThanOrEqual(1);
  });

  it("usa solo los días que abre el local y parte la jornada continuada por la mitad", () => {
    const { turnos } = proponerHorario({ ...criterios, horarios: [{ ...criterios.horarios[0], dias: [1, 2, 3] }] });
    expect([...new Set(turnos.map((t) => t.diaSemana))].sort()).toEqual([1, 2, 3]);
    // 08:30-20:15 se corta en las 14:30: la mitad, redondeada al cuarto de hora.
    for (const t of turnos) expect(["08:30-14:30", "14:30-20:15"]).toContain(`${t.horaInicio}-${t.horaFin}`);
    // Se abre con el bloque de la mañana y se cierra con el de la tarde.
    for (const t of turnos.filter((t) => t.turno === "apertura")) expect(t.horaInicio).toBe("08:30");
    for (const t of turnos.filter((t) => t.turno === "cierre")) expect(t.horaFin).toBe("20:15");
  });

  it("le da a cada día la jornada de su propio horario", () => {
    // Lunes a viernes 08:15-20:00 y fin de semana 09:40-19:00: el sábado entra
    // a su propia hora, no a la de la semana.
    const { turnos } = proponerHorario({
      ...criterios,
      horarios: [
        { dias: [1, 2, 3, 4, 5], apertura: "08:15", cierre: "20:00" },
        { dias: [0, 6], apertura: "09:40", cierre: "19:00" },
      ],
    });
    for (const t of turnos)
      expect([1, 2, 3, 4, 5].includes(t.diaSemana) ? ["08:15-14:15", "14:15-20:00"] : ["09:40-14:15", "14:15-19:00"])
        .toContain(`${t.horaInicio}-${t.horaFin}`);
  });

  it("si dos horarios se pisan, el día se queda con el primero", () => {
    const { turnos } = proponerHorario({
      ...criterios,
      horarios: [
        { dias: [1], apertura: "08:15", cierre: "20:00" },
        { dias: [1], apertura: "09:40", cierre: "19:00" },
      ],
    });
    for (const t of turnos) expect(["08:15-14:15", "14:15-20:00"]).toContain(`${t.horaInicio}-${t.horaFin}`);
  });

  it("avisa del puesto que queda sin encargado en vez de inventar cobertura", () => {
    const { turnos, avisos } = proponerHorario({
      ...criterios,
      perfilIds: ["p1", "p2"],
      horarios: [{ ...criterios.horarios[0], dias: [1] }],
    });
    expect(turnos).toHaveLength(2);
    expect(avisos.some((a) => a.startsWith("Lunes:"))).toBe(true);
  });

  it("recorre la semana partiendo en lunes, no en domingo", () => {
    const { avisos } = proponerHorario({ ...criterios, perfilIds: [] });
    const porDia = avisos.filter((a) => a.includes(":"));
    expect(porDia[0].startsWith("Lunes:")).toBe(true);
    expect(porDia[porDia.length - 1].startsWith("Domingo:")).toBe(true);
  });

  it("no le propone a nadie un bloque que rompa su regla horaria", () => {
    // De lunes a viernes p1 se va a las 18:30, así que esos días no puede
    // tomar el bloque de tarde (termina 20:15); el fin de semana sí.
    const reglas = [{ id: "p1", dias: [1, 2, 3, 4, 5], horaDesde: "08:00", horaHasta: "18:30" }];
    const { turnos } = proponerHorario({ ...criterios, reglas });
    const suyos = turnos.filter((t) => t.perfilId === "p1");
    expect(suyos.length).toBeGreaterThan(0);
    for (const t of suyos) if (t.diaSemana >= 1 && t.diaSemana <= 5) expect(t.horaFin <= "18:30").toBe(true);
    // Y el resto del equipo cubre igual los cuatro encargados de cada día.
    for (const dia of diasAbierto)
      for (const rol of TURNOS_ZONA) expect(encargadoDeZona(turnos, dia, rol.turno, rol.zona)).not.toBeNull();
  });

  it("es determinista: los mismos criterios dan el mismo horario", () => {
    expect(proponerHorario(criterios)).toEqual(proponerHorario(criterios));
  });
});


describe("avisosLegales", () => {
  // 08:30-17:00 son 8h 30m: cinco días son 42h 30m, sobre las 40 de la ley.
  const p1 = { id: "p1", nombre: "Christian", modulos: [] };

  it("una semana dentro de la ley no avisa nada", () => {
    // Lunes a viernes, 7h por día: 35h, cinco días seguidos y domingo libre.
    const turnos = [1, 2, 3, 4, 5].map((d) => turno(d, { horaInicio: "09:00", horaFin: "16:00" }));
    expect(avisosLegales(turnos, [p1])).toEqual([]);
  });

  it("avisa de las 40 horas, de los días seguidos y de los domingos", () => {
    // Lunes a sábado a 8h 30m son 51h y seis días seguidos; con el domingo,
    // siete y ningún domingo libre.
    const avisos = avisosLegales([0, 1, 2, 3, 4, 5, 6].map((d) => turno(d)), [p1]);
    expect(avisos).toHaveLength(3);
    expect(avisos[0]).toContain("59h 30m");
    expect(avisos[1]).toContain("7 días seguidos");
    expect(avisos[2]).toContain("domingos");
  });

  it("cuenta la racha dando la vuelta a la semana, que se repite", () => {
    // Jueves a lunes: cinco días corridos que cruzan el sábado, más el martes
    // suelto. Son 6 seguidos contando la vuelta y hay que avisarlo.
    const turnos = [4, 5, 6, 0, 1].map((d) => turno(d, { horaInicio: "09:00", horaFin: "14:00" }));
    const avisos = avisosLegales(turnos, [p1]);
    expect(avisos.some((a) => a.includes("5 días seguidos"))).toBe(false);
    expect(avisosLegales([...turnos, turno(2, { horaInicio: "09:00", horaFin: "14:00" })], [p1])[0]).toContain(
      "6 días seguidos"
    );
  });

  it("no cuenta los tramos inactivos ni a quien no tiene turnos", () => {
    expect(avisosLegales([turno(0, { activo: false })], [p1])).toEqual([]);
    expect(avisosLegales([], [p1])).toEqual([]);
  });
});

describe("dotación", () => {
  // El peak del sábado: de 12 a 16 tienen que estar cuatro.
  const dotacion = [{ id: "d1", dias: [6], desde: "12:00", hasta: "16:00", cantidad: 4 }];

  it("pide la dotación de las franjas que se pisan con el tramo, sin sumarlas", () => {
    expect(dotacionRequerida(dotacion, 6, "09:40", "14:15")).toBe(4);
    // Termina justo cuando la franja empieza: no se pisan.
    expect(dotacionRequerida(dotacion, 6, "08:00", "12:00")).toBe(0);
    expect(dotacionRequerida(dotacion, 1, "12:00", "16:00")).toBe(0);
    // Dos franjas encima piden el máximo, no la suma.
    const dos = [...dotacion, { id: "d2", dias: [6], desde: "13:00", hasta: "15:00", cantidad: 2 }];
    expect(dotacionRequerida(dos, 6, "12:00", "16:00")).toBe(4);
  });

  it("avisa por el momento más flaco de la franja, no por el promedio", () => {
    const base = { perfilId: "", diaSemana: 6, turno: "normal" as const, zona: null, activo: true };
    const turnos = [
      { ...base, id: "t1", perfilId: "p1", horaInicio: "09:40", horaFin: "14:15" },
      { ...base, id: "t2", perfilId: "p2", horaInicio: "09:40", horaFin: "14:15" },
      { ...base, id: "t3", perfilId: "p3", horaInicio: "09:40", horaFin: "14:15" },
      { ...base, id: "t4", perfilId: "p4", horaInicio: "09:40", horaFin: "14:15" },
      { ...base, id: "t5", perfilId: "p5", horaInicio: "14:15", horaFin: "19:00" },
    ];
    // De 12:00 a 14:15 hay cuatro, pero después queda uno solo.
    expect(avisosDotacion(turnos, dotacion)).toEqual([
      "Sábado 12:00-16:00: la dotación pide 4 y en algún momento hay 1.",
    ]);
    expect(avisosDotacion(turnos, [{ ...dotacion[0], cantidad: 1 }])).toEqual([]);
    expect(avisosDotacion([], dotacion)).toEqual(["Sábado 12:00-16:00: la dotación pide 4 y en algún momento hay 0."]);
  });

  it("el creador de horario suma turnos hasta cubrir la dotación", () => {
    // Peak de tarde (el relevo del sábado cae a las 14:15): sin dotación
    // bastaban los dos encargados del cierre, ahora tienen que ser cuatro.
    const { turnos, avisos } = proponerHorario({
      perfilIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      diasLibres: 1,
      horarios: [{ dias: [6], apertura: "09:40", cierre: "19:00" }],
      dotacion: [{ id: "d1", dias: [6], desde: "15:00", hasta: "18:00", cantidad: 4 }],
    });
    expect(turnos.filter((t) => t.horaInicio === "14:15").length).toBe(4);
    expect(avisos).toEqual([]);
  });

  it("una franja que cruza el relevo pide la cantidad en los dos bloques y el faltante se reparte parejo", () => {
    // 12:00-16:00 toca la mañana (hasta las 14:15) y la tarde, y nadie hace
    // los dos tramos el mismo día: con seis personas no da para 4 y 4.
    const { turnos, avisos } = proponerHorario({
      perfilIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      diasLibres: 1,
      horarios: [{ dias: [6], apertura: "09:40", cierre: "19:00" }],
      dotacion,
    });
    expect(turnos.filter((t) => t.horaInicio === "09:40").length).toBe(3);
    expect(turnos.filter((t) => t.horaInicio === "14:15").length).toBe(3);
    expect(avisos).toEqual(["Sábado 12:00-16:00: la dotación pide 4 y en algún momento hay 3."]);
  });

  it("no inventa gente: si no alcanza, lo avisa en vez de romper los días libres", () => {
    const { avisos } = proponerHorario({
      perfilIds: ["p1", "p2", "p3", "p4"],
      diasLibres: 1,
      horarios: [{ dias: [6], apertura: "09:40", cierre: "19:00" }],
      dotacion,
    });
    expect(avisos.some((a) => a.includes("la dotación pide 4"))).toBe(true);
  });
});

describe("part time", () => {
  // El sábado abre de 09:00 a 19:00 con dos personas en cada bloque y el peak
  // de 12 a 16 pide tres: falta uno toda la franja, cruzando el relevo.
  const base = { perfilId: "", diaSemana: 6, turno: "normal" as const, zona: null, activo: true };
  const turnosSabado: TurnoFuncionario[] = [
    { ...base, id: "t1", perfilId: "p1", horaInicio: "09:00", horaFin: "14:00" },
    { ...base, id: "t2", perfilId: "p2", horaInicio: "09:00", horaFin: "14:00" },
    { ...base, id: "t3", perfilId: "p3", horaInicio: "14:00", horaFin: "19:00" },
    { ...base, id: "t4", perfilId: "p4", horaInicio: "14:00", horaFin: "19:00" },
  ];
  const dotacion = [{ id: "d1", dias: [6], desde: "12:00", hasta: "16:00", cantidad: 3 }];
  const pedro: PartTime = {
    id: "pt1",
    nombre: "Pedro",
    horarios: [{ id: "h1", dias: [6, 0], desde: "10:00", hasta: "18:00" }],
    activo: true,
  };
  const tramo: TramoPartTime = { id: "pl1", partTimeId: "pt1", dias: [6], desde: "12:00", hasta: "16:00" };

  it("junta los trozos pegados en un solo hueco y sugiere a quien pueda tomarlo", () => {
    const s = sugerirPartTime(turnosSabado, dotacion, [], [pedro]);
    // 12:00-14:00 y 14:00-16:00 van cortos por lo mismo: es un hueco, no dos.
    expect(s.huecos).toEqual([
      { diaSemana: 6, desde: "12:00", hasta: "16:00", faltan: 1, candidatos: [pedro] },
    ]);
    expect(s.horas).toBe(4);
    expect(s.personas).toBe(1);
    expect(s.enLaFicha).toBe(1);
    // Y el horario que tendría que cumplir esa persona.
    expect(s.puestos).toEqual([
      { tramos: [{ diaSemana: 6, desde: "12:00", hasta: "16:00" }], horas: 4, candidatos: [pedro] },
    ]);
  });

  it("reparte los huecos en personas: junta días distintos y separa lo que se pisa", () => {
    // El domingo no trabaja nadie, así que la misma franja pide los tres.
    const finde = [{ id: "d1", dias: [6, 0], desde: "12:00", hasta: "16:00", cantidad: 3 }];
    const { puestos, personas } = sugerirPartTime(turnosSabado, finde, [], [pedro]);
    expect(personas).toBe(3);
    // El sábado falta uno y el domingo tres: el primer puesto se lleva los dos
    // días —no se pisan— y los otros dos solo el domingo.
    expect(puestos.map((p) => p.tramos.map((t) => `${t.diaSemana} ${t.desde}-${t.hasta}`))).toEqual([
      ["6 12:00-16:00", "0 12:00-16:00"],
      ["0 12:00-16:00"],
      ["0 12:00-16:00"],
    ]);
    expect(puestos.map((p) => p.horas)).toEqual([8, 4, 4]);
    // Pedro declaró sábado y domingo de 10:00 a 18:00: le sirven los tres.
    expect(puestos.every((p) => p.candidatos.includes(pedro))).toBe(true);
  });

  it("nadie carga más que el tope part time: abre otro puesto en vez de pasarse", () => {
    // El local sin nadie asignado, pidiendo una persona 10 h los siete días.
    const semana = [{ id: "d1", dias: [0, 1, 2, 3, 4, 5, 6], desde: "08:00", hasta: "18:00", cantidad: 1 }];
    const { puestos, horas, personas } = sugerirPartTime([], semana, [], []);
    expect(horas).toBe(70);
    expect(personas).toBe(3);
    expect(puestos.map((p) => p.horas)).toEqual([30, 30, 10]);
    expect(puestos.every((p) => p.horas <= 30)).toBe(true);
  });

  it("un part time en la planilla cuenta como dotación en pie y cierra el hueco", () => {
    expect(avisosDotacion(turnosSabado, dotacion)).toEqual([
      "Sábado 12:00-16:00: la dotación pide 3 y en algún momento hay 2.",
    ]);
    expect(avisosDotacion(turnosSabado, dotacion, [tramo])).toEqual([]);
    expect(sugerirPartTime(turnosSabado, dotacion, [tramo], [pedro]).huecos).toEqual([]);
  });

  it("el tramo de un part time inactivo o borrado deja de contar como dotación", () => {
    expect(planillaVigente([tramo], [pedro])).toEqual([tramo]);
    expect(planillaVigente([tramo], [{ ...pedro, activo: false }])).toEqual([]);
    expect(planillaVigente([tramo], [])).toEqual([]);
  });

  it("no sugiere a quien ya está comprometido a esa hora ni a quien no llega con su disponibilidad", () => {
    const dosFaltan = [{ ...dotacion[0], cantidad: 4 }];
    // Pedro ya viene 12-16: no puede tomar dos veces la misma hora.
    expect(sugerirPartTime(turnosSabado, dosFaltan, [tramo], [pedro]).huecos[0].candidatos).toEqual([]);
    // Ana solo puede hasta las 14:00: no cubre la franja entera.
    const ana: PartTime = { ...pedro, id: "pt2", nombre: "Ana", horarios: [{ id: "h2", dias: [6], desde: "10:00", hasta: "14:00" }] };
    expect(sugerirPartTime(turnosSabado, dotacion, [], [ana]).huecos[0].candidatos).toEqual([]);
  });

  it("el creador de horario no manda gente de planta a lo que ya cubre el part time", () => {
    const criterios = {
      perfilIds: ["p1", "p2", "p3", "p4", "p5", "p6"],
      diasLibres: 1,
      horarios: [{ dias: [6], apertura: "09:40", cierre: "19:00" }],
      dotacion: [{ id: "d1", dias: [6], desde: "15:00", hasta: "18:00", cantidad: 4 }],
    };
    // Sin planilla hay que reforzar la tarde hasta llegar a cuatro.
    expect(proponerHorario(criterios).turnos.filter((t) => t.horaInicio === "14:15").length).toBe(4);
    // Con dos part time en esa franja bastan los dos encargados del cierre.
    const planilla: TramoPartTime[] = [
      { id: "pl1", partTimeId: "pt1", dias: [6], desde: "14:00", hasta: "19:00" },
      { id: "pl2", partTimeId: "pt2", dias: [6], desde: "14:00", hasta: "19:00" },
    ];
    const { turnos, avisos } = proponerHorario({ ...criterios, planillaPartTime: planilla });
    expect(turnos.filter((t) => t.horaInicio === "14:15").length).toBe(2);
    expect(avisos).toEqual([]);
  });

  it("avisa el tramo fuera de la disponibilidad declarada y la semana sobre el tope part time", () => {
    const ana: PartTime = { ...pedro, id: "pt2", nombre: "Ana", horarios: [{ id: "h2", dias: [6], desde: "10:00", hasta: "14:00" }] };
    expect(avisosPartTime([{ ...tramo, partTimeId: "pt2" }], [ana])[0]).toContain(
      "Ana: Sábado 12:00-16:00 queda fuera de la disponibilidad"
    );
    // 10 h por seis días: 60 a la semana, el doble del tope part time.
    const abusiva: TramoPartTime = { id: "pl2", partTimeId: "pt1", dias: [1, 2, 3, 4, 5, 6], desde: "08:00", hasta: "18:00" };
    expect(horasPartTime([abusiva], "pt1")).toBe(60);
    expect(avisosPartTime([abusiva], [pedro]).some((a) => a.includes("sobre el tope part time de 30 h"))).toBe(true);
    expect(avisosPartTime([tramo], [pedro])).toEqual([]);
  });
});
