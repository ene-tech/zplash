// Renderiza el correo del fin del Plan Ilimitado con la MISMA plantilla base
// que usa la app (envolverCorreoBase), para revisarlo antes de cargarlo.
// No toca la base ni manda nada.
//
// Necesita --conditions=react-server: plantillaBase.ts importa "server-only",
// que fuera de Next resuelve al entry de cliente y tira error.
//
// Uso: npx tsx --conditions=react-server --env-file=.env.local \
//        scripts/tmp-preview-correos-tope.ts [archivo-salida.json]
import { writeFileSync } from "node:fs";
import { envolverCorreoBase } from "@/lib/mailing/plantillaBase";

export const CORREOS = [
  {
    clave: "fin-ilimitado",
    nombre: "Fin del Plan Ilimitado",
    para: "Todo el que esté terminando su último mes de ilimitado, 7 días antes de que se le venza",
    asunto: "Tu Plan Ilimitado termina el {{fechaVencimiento}}",
    cuerpo: `Hola {{nombre}},

Te escribimos con tiempo para que no te tome por sorpresa: el **Plan Ilimitado Mensual** de tu patente {{patente}} dejó de ofrecerse y termina el **{{fechaVencimiento}}**.

Hasta esa fecha sigues lavando sin límite, como siempre. No cambia nada antes.

Desde ahí tenemos el **Plan X5**: 5 lavados al mes, mismo túnel, misma calidad, por **{{precioX5}}** al mes.

Puedes activarlo entrando a Mi Cuenta con tu patente {{patente}}. Se hace en un paso, y ahí mismo puedes revisar o dar de baja tu cobro automático si lo tienes.

Si prefieres seguir sin plan, no tienes que hacer nada. Tu lavado único te espera cuando quieras.

Gracias por estos meses con nosotros. Cualquier duda, respóndenos este correo.`,
  },
];

// Datos de un cliente real del grupo, para que la vista previa no sea inventada.
const EJEMPLO: Record<string, Record<string, string>> = {
  "fin-ilimitado": {
    nombre: "CRISTOFER MORA FUENTES",
    patente: "HSXR40",
    plan: "Plan Ilimitado Mensual",
    fechaVencimiento: "01-10-2026",
    // Precio real que le saldria: tiene heredado de $19.990, asi que
    // precioRenovacionATiempo le aplica ese y no los $21.990 vigentes.
    precioX5: "$19.990",
  },
};

const salida = process.argv[2];
if (salida) {
  const partes = CORREOS.map((c) =>
    JSON.stringify({
      ...c,
      asuntoRenderizado: c.asunto.replace(/\{\{(\w+)\}\}/g, (_, k) => EJEMPLO[c.clave][k] ?? ""),
      html: envolverCorreoBase(c.cuerpo, EJEMPLO[c.clave]),
    })
  );
  writeFileSync(salida, "[" + partes.join(",\n") + "]", "utf8");
  console.log(`Escrito: ${salida} (${CORREOS.length} correo(s))`);
} else {
  for (const c of CORREOS) console.log(`\n=== ${c.nombre} ===\nAsunto: ${c.asunto}\n\n${c.cuerpo}`);
}
