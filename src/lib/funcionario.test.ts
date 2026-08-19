import { describe, expect, it } from "vitest";
import {
  avanceChecklist,
  distanciaMetros,
  idTareaHecha,
  minutosTrabajados,
  proximaMarca,
  tareasDelTurno,
  turnoDelDia,
} from "./helpers/funcionario";
import type { MarcaAsistencia, TareaTurno, TareaTurnoHecha, TurnoFuncionario } from "@/types";

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
    id: `tf-p1-${diaSemana}`,
    perfilId: "p1",
    diaSemana,
    turno: "apertura",
    horaInicio: "08:30",
    horaFin: "17:00",
    activo: true,
    ...overrides,
  };
}

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

describe("checklist de turno", () => {
  const tareas: TareaTurno[] = [
    { id: "t2", turno: "cierre", descripcion: "Cortar matriz general de agua", orden: 2, activo: true },
    { id: "t1", turno: "cierre", descripcion: "Cambiar el selector de luz", orden: 1, activo: true },
    { id: "t3", turno: "cierre", descripcion: "Tarea vieja", orden: 3, activo: false },
    { id: "t4", turno: "apertura", descripcion: "Purgar compresores", orden: 1, activo: true },
  ];

  it("devuelve solo las tareas activas del turno, en orden de ejecución", () => {
    expect(tareasDelTurno(tareas, "cierre").map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("el id de una tarea hecha es determinista: volver a marcarla es la misma fila", () => {
    expect(idTareaHecha("2026-08-18", "cierre", "t1")).toBe(idTareaHecha("2026-08-18", "cierre", "t1"));
    expect(idTareaHecha("2026-08-18", "cierre", "t1")).not.toBe(idTareaHecha("2026-08-19", "cierre", "t1"));
  });

  it("el avance cuenta contra las tareas activas de ese turno", () => {
    const hechas: TareaTurnoHecha[] = [
      {
        id: idTareaHecha("2026-08-18", "cierre", "t1"),
        fecha: "2026-08-18",
        turno: "cierre",
        tareaId: "t1",
        perfilId: "p1",
        perfilNombre: "Christian",
        completadoEn: "2026-08-18T22:00:00.000Z",
      },
      // Marca de otro día: no debe contar en el avance de hoy.
      {
        id: idTareaHecha("2026-08-17", "cierre", "t2"),
        fecha: "2026-08-17",
        turno: "cierre",
        tareaId: "t2",
        perfilId: "p1",
        perfilNombre: "Christian",
        completadoEn: "2026-08-17T22:00:00.000Z",
      },
    ];
    expect(avanceChecklist(tareas, hechas, "2026-08-18", "cierre")).toEqual({ hechas: 1, total: 2 });
    expect(avanceChecklist(tareas, hechas, "2026-08-18", "apertura")).toEqual({ hechas: 0, total: 1 });
  });
});
