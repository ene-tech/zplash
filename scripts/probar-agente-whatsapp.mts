// Prueba el agente de WhatsApp (@/lib/whatsapp/agente) contra mensajes REALES
// de clientes, como si respondiera en el momento en que llegaron. No envía
// nada ni escribe en la base: solo lee e imprime qué habría contestado, qué
// herramientas usó y cuánto costó. Correrlo antes de prender AGENTE_WHATSAPP
// y cada vez que se toquen las instrucciones del agente.
//
// Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/probar-agente-whatsapp.mts [cantidad=15] [dias=7] [filtro]
// `filtro` (regex, sin distinguir mayúsculas) repite casos puntuales, ej. "tengo plan|tapiz".
// Toma siempre las conversaciones más recientes (no al azar), así se pueden
// comparar modelos sobre los mismos casos: AGENTE_WHATSAPP_MODELO=claude-haiku-4-5 npx tsx ...
// Necesita ANTHROPIC_API_KEY. Cada conversación cuesta ~US$0,05-0,15.
import postgres from "postgres";
import { conversacionFromRow } from "@/lib/dataAccess/whatsapp/conversaciones";
import { costoUsd, MODELO, responderConAgente } from "@/lib/whatsapp/agente";

const cantidad = Number(process.argv[2] ?? 15);
const dias = Number(process.argv[3] ?? 7);
const filtro = process.argv[4] ?? ".";
console.log(`Modelo: ${MODELO}`);

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  // El último mensaje con texto de cada conversación reciente, sin reacciones,
  // stickers ni saludos sueltos: lo que el menú no sabía contestar.
  const casos = await sql`
    select distinct on (m.conversacion_id) m.conversacion_id, m.texto, m.creado_en, to_jsonb(c.*) as conversacion
    from mensajes_whatsapp m join conversaciones_whatsapp c on c.id = m.conversacion_id
    where m.direccion = 'entrante' and m.creado_en > now() - make_interval(days => ${dias})
      and m.texto not like '[%' and length(m.texto) > 3 and m.texto ~* ${filtro}
    order by m.conversacion_id, m.creado_en desc`;
  const elegidos = casos.sort((a, b) => +new Date(b.creado_en as string) - +new Date(a.creado_en as string)).slice(0, cantidad);

  let totalUsd = 0;
  for (const caso of elegidos) {
    const fila = caso.conversacion as Record<string, unknown>;
    // to_jsonb trae snake_case; conversacionFromRow espera el row de drizzle.
    const conversacion = conversacionFromRow(
      Object.fromEntries(Object.entries(fila).map(([k, v]) => [k.replace(/_(\w)/g, (_, l) => l.toUpperCase()), v])) as never
    );
    const hasta = new Date(new Date(caso.creado_en as string).getTime() + 1).toISOString();
    console.log(`\n━━━ ${conversacion.nombreContacto || conversacion.telefono} · ${new Date(caso.creado_en as string).toLocaleString("es-CL")}`);
    console.log(`👤 ${caso.texto}`);
    try {
      const r = await responderConAgente(conversacion, conversacion.telefono, hasta);
      if (!r.texto) {
        console.log(`🤖 (no responde)${r.derivar ? ` · DERIVA: ${r.derivar}` : ""}`);
        continue;
      }
      const usd = costoUsd(r.uso);
      totalUsd += usd;
      console.log(`🤖 ${r.texto}`);
      console.log(`   herramientas: ${r.herramientas.join(", ") || "ninguna"}${r.derivar ? ` · DERIVA: ${r.derivar}` : ""} · US$${usd.toFixed(3)}`);
    } catch (error) {
      console.log(`❌ ${(error as Error).message}`);
    }
  }
  console.log(`\nTotal: US$${totalUsd.toFixed(2)} en ${elegidos.length} conversaciones`);
} finally {
  await sql.end();
  process.exit();
}
