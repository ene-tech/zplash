// Simulador de sensores de nivel y válvulas: crea estanques y válvulas de
// prueba y después golpea /api/estanques/telemetria como lo hará el
// controlador del local, para poder ver la sección funcionando (niveles que
// bajan, alertas que se encienden, una llave que se abre desde la app y llena
// el estanque) ANTES de comprar una sola pieza de hardware.
//
// El bucle de abajo es también la especificación de lo que tiene que hacer el
// firmware: POST con las lecturas + el estado real de las válvulas, y aplicar
// las válvulas que vienen en la respuesta. Nada más.
//
// OJO: escribe en la base de datos real (este proyecto no tiene base local).
// Todo lo que crea lleva id "sim-*" y se borra con --limpiar.
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima.
//
// Uso: npx tsx --env-file=.env.local scripts/simular-estanques.ts
//      npx tsx --env-file=.env.local scripts/simular-estanques.ts --url https://zplash.cl
//      npx tsx --env-file=.env.local scripts/simular-estanques.ts --limpiar

import { drizzle } from "drizzle-orm/postgres-js";
import { like } from "drizzle-orm";
import postgres from "postgres";
import { estanques, lecturasEstanque, valvulas } from "@/db/schema";

const TICK_MS = 5000; // el hardware real reporta cada ~60s; acá se acelera para poder mirarlo

// litros: nivel simulado inicial. consumo/llenado: litros por tick.
const ESTANQUES_SIM = [
  {
    id: "sim-agua-cruda",
    nombre: "SIM AGUA CRUDA",
    contenido: "Agua de red",
    capacidadLitros: 5000,
    // Transductor de presión: crudo = cm de columna. 100 cm útiles = 5.000 L,
    // con el sensor colgando 5 cm sobre el fondo.
    offsetCrudo: 5,
    litrosPorUnidad: 50,
    umbralBajoLitros: null,
    litros: 3000,
    consumo: 60,
    llenado: 220,
  },
  {
    id: "sim-agua-tratada",
    nombre: "SIM AGUA TRATADA",
    contenido: "Agua osmosis",
    capacidadLitros: 2000,
    offsetCrudo: 0,
    litrosPorUnidad: 20,
    umbralBajoLitros: null,
    litros: 520,
    consumo: 40,
    llenado: 150,
  },
  {
    id: "sim-shampoo",
    nombre: "SIM SHAMPOO",
    contenido: "Shampoo túnel",
    capacidadLitros: 200,
    // Ultrasónico: crudo = cm de aire hasta el líquido. Lleno = 0 cm,
    // vacío = 100 cm. De ahí el factor negativo.
    offsetCrudo: 100,
    litrosPorUnidad: -2,
    umbralBajoLitros: 60,
    litros: 34,
    consumo: 1.5,
    llenado: 0, // no tiene válvula: se rellena a mano, es el caso "solo aviso"
  },
];

const VALVULAS_SIM = [
  { id: "sim-valvula-cruda", nombre: "SIM LLENADO CRUDA", estanqueId: "sim-agua-cruda" },
  { id: "sim-valvula-tratada", nombre: "SIM LLENADO TRATADA", estanqueId: "sim-agua-tratada" },
];

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
  const secreto = process.env.ESTANQUES_SECRET;
  if (!secreto) throw new Error("Falta ESTANQUES_SECRET en las variables de entorno");
  const base = arg("--url", "http://localhost:3000");

  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);

  if (process.argv.includes("--limpiar")) {
    await db.delete(lecturasEstanque).where(like(lecturasEstanque.estanqueId, "sim-%"));
    await db.delete(valvulas).where(like(valvulas.id, "sim-%"));
    await db.delete(estanques).where(like(estanques.id, "sim-%"));
    console.log("Datos de simulación borrados.");
    await client.end();
    return;
  }

  const ahora = new Date().toISOString();
  await db
    .insert(estanques)
    .values(
      ESTANQUES_SIM.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        contenido: e.contenido,
        capacidadLitros: e.capacidadLitros,
        offsetCrudo: e.offsetCrudo,
        litrosPorUnidad: e.litrosPorUnidad,
        umbralBajoLitros: e.umbralBajoLitros,
        activo: true,
        creadoEn: ahora,
        creadoPor: "simulador",
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(valvulas)
    .values(VALVULAS_SIM.map((v) => ({ ...v, abierta: false, cambiadoEn: ahora, activo: true })))
    .onConflictDoNothing();
  await client.end();

  console.log(`Estanques y válvulas de simulación listos. Reportando a ${base} cada ${TICK_MS / 1000}s.`);
  console.log("Abre el módulo Estanques y Válvulas y prueba abrir una llave. Ctrl+C para cortar.\n");

  // Estado real de las válvulas según este "controlador": arranca cerrado y
  // solo cambia cuando el servidor lo ordena. El firmware debe hacer lo mismo
  // — y cerrar todo si el POST falla, que es lo que hace el catch de abajo.
  const abiertas = new Map(VALVULAS_SIM.map((v) => [v.id, false]));
  const nivel = new Map(ESTANQUES_SIM.map((e) => [e.id, e.litros]));

  const tick = async () => {
    for (const e of ESTANQUES_SIM) {
      const valvula = VALVULAS_SIM.find((v) => v.estanqueId === e.id);
      const entra = valvula && abiertas.get(valvula.id) ? e.llenado : 0;
      const litros = Math.max(0, Math.min(e.capacidadLitros, (nivel.get(e.id) ?? 0) - e.consumo + entra));
      nivel.set(e.id, litros);
    }

    const cuerpo = {
      lecturas: ESTANQUES_SIM.map((e) => ({
        estanqueId: e.id,
        // Se invierte la calibración para mandar lo que mandaría el sensor:
        // ruido de ±0,3 unidades incluido, porque ningún sensor real entrega
        // el mismo número dos veces seguidas.
        crudo:
          Math.round(((nivel.get(e.id) ?? 0) / e.litrosPorUnidad + e.offsetCrudo + (Math.random() - 0.5) * 0.6) * 10) /
          10,
      })),
      valvulas: VALVULAS_SIM.map((v) => ({ id: v.id, abierta: abiertas.get(v.id) ?? false })),
    };

    try {
      const res = await fetch(`${base}/api/estanques/telemetria`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-estanques-secret": secreto },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const datos = (await res.json()) as { valvulas: { id: string; abierta: boolean }[] };
      for (const v of datos.valvulas) if (abiertas.has(v.id)) abiertas.set(v.id, v.abierta);
    } catch (error) {
      // Sin servidor no hay órdenes: se cierra todo. Esta es la parte del
      // firmware que NO se puede omitir — un controlador que se queda con la
      // llave abierta y pierde el WiFi inunda el local.
      for (const id of abiertas.keys()) abiertas.set(id, false);
      console.error("Sin respuesta del servidor, válvulas cerradas por seguridad:", (error as Error).message);
      return;
    }

    console.log(
      ESTANQUES_SIM.map((e) => `${e.nombre}: ${Math.round(nivel.get(e.id) ?? 0)}L`).join("  |  ") +
        "  |  abiertas: " +
        (VALVULAS_SIM.filter((v) => abiertas.get(v.id))
          .map((v) => v.nombre)
          .join(", ") || "ninguna")
    );
  };

  await tick();
  setInterval(tick, TICK_MS);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
