// Saneamiento de la tabla `clientes`: corrige lo que se puede corregir sin
// adivinar y BORRA lo que no sirve, para que la ficha quede visiblemente
// incompleta y el operador vuelva a pedir el dato la próxima vez que ese
// cliente pase por el túnel.
//
// La contraparte en la app ya existe: con el teléfono, el correo o el nombre
// vacíos, OperadorFoundResult muestra el input con su botón Guardar y marca la
// ficha como incompleta (ver fichaIncompleta en @/components/operador/
// useOperadorFoundResult). Dejar "+569" o "noquieredarcorreo@gmail.com" en el
// campo es peor que dejarlo vacío: el sistema cree que tiene el dato y nunca
// se lo vuelve a pedir a nadie.
//
// Qué hace, exactamente:
//
//   BORRA (deja el campo en null / "Sin nombre")
//     · teléfono que es solo el prefijo "+569", inventado (00000000,
//       99999999, 11111111…), una secuencia, texto de relleno o un número que
//       no se puede normalizar a +569XXXXXXXX (le falta o le sobra un dígito,
//       prefijo de otro país)
//     · correo de relleno ("noquiere…", "invitado@…", "limpiezaxx@…"), con la
//       parte local absurda ("aaa@"), inentregable (punto pegado al @) o
//       directamente inválido
//     · nombre de relleno ("NO QUIERE DAR NOMBRE"), el que repite la patente,
//       el de menos de tres letras y el genérico en un cliente con plan
//       vigente ("Invitado" con abono al día) → quedan como "Sin nombre", que
//       es el valor que la app ya entiende como "falta el nombre" (ver
//       esNombreVacio)
//
//   CORRIGE (sin borrar, porque el dato bueno se deduce sin ambigüedad)
//     · dominio mal escrito: @gmsil.com → @gmail.com, @hotmsil → @hotmail, etc.
//     · correo con tildes o ñ en medio: andrés.arredondo@ → andres.arredondo@
//       (la casilla existe, lo que está mal es la transcripción)
//     · correo guardado en mayúsculas → minúsculas
//     · teléfono con espacios o sin el +56 → formato canónico +569XXXXXXXX
//
//   NO TOCA
//     · teléfonos "sospechosos": poca variedad de dígitos pero que podrían ser
//       reales (+569 6300 0008 lo cargaron dos operadores distintos para la
//       misma persona). Se reportan para confirmarlos con el cliente.
//     · patentes inválidas y las "SIN-PATENTE-<pedido>" de WooCommerce: la
//       patente es la llave con la que entra el cliente, cambiarla o borrarla
//       rompe su historial. Van al informe para arreglo manual.
//     · fichas duplicadas por patente mal tipeada: fusionarlas mueve visitas,
//       ventas e ingresos, y eso se decide caso a caso.
//     · datos de facturación incompletos.
//     · que un correo o un teléfono se repita en varias patentes: es normal en
//       flotas y familias, no es un error.
//
// Todo cambio queda registrado en la tabla `auditoria` con el valor anterior
// (usuario "limpieza-datos"), así que nada se pierde: la dirección vieja se
// puede recuperar de ahí para confirmarla con el cliente. Además se escribe un
// CSV de respaldo con la fila completa de cada ficha tocada antes de escribir.
//
// Los criterios de "qué está mal" NO están acá: se importan de
// ./calidadDatosClientes, el mismo módulo que usa la auditoría, para que el
// informe y la limpieza no puedan discrepar.
//
// Uso (el modo por defecto NO escribe nada):
//   npx tsx --env-file=.env.local scripts/limpiar-datos-clientes.ts
//   npx tsx --env-file=.env.local scripts/limpiar-datos-clientes.ts --aplicar

import { writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { auditoria, clientes } from "@/db/schema";
import { isValidRut, limpiarRut } from "@/lib/helpers/validadores";
import {
  type Cliente,
  type Hallazgo,
  RUTS_FALSOS,
  conPatenteTexto,
  dvCorrecto,
  formatTelefono,
  revisarCliente,
  sugerirDominio,
  transliterar,
} from "./calidadDatosClientes";

const NOMBRE_VACIO = "Sin nombre";

// Qué hacer con cada chequeo de la auditoría. Lo que no está en este mapa se
// deja intacto a propósito (ver el encabezado): que un chequeo exista no
// significa que se pueda arreglar solo.
type Accion = "borrar-telefono" | "normalizar-telefono" | "borrar-email" | "corregir-dominio" | "quitar-tildes-email" | "minusculas-email" | "borrar-nombre" | "borrar-rut";

const ACCION_POR_CHEQUEO: Record<string, Accion> = {
  "telefono-sin-digitos": "borrar-telefono",
  "telefono-relleno": "borrar-telefono",
  "telefono-inventado": "borrar-telefono",
  "telefono-secuencia": "borrar-telefono",
  "telefono-invalido": "borrar-telefono",
  "telefono-sin-normalizar": "normalizar-telefono",
  "email-sin-arroba": "borrar-email",
  "email-relleno": "borrar-email",
  "email-del-local": "borrar-email",
  "email-invalido": "borrar-email",
  "email-local-absurdo": "borrar-email",
  "email-no-enviable": "borrar-email",
  "email-dominio-raro": "borrar-email",
  "email-dominio-typo": "corregir-dominio",
  "email-tildes": "quitar-tildes-email",
  "email-mayusculas": "minusculas-email",
  "nombre-relleno": "borrar-nombre",
  "nombre-es-patente": "borrar-nombre",
  "nombre-corto": "borrar-nombre",
  "nombre-sin-letras": "borrar-nombre",
  "nombre-placeholder-abonado": "borrar-nombre",
  "nombre-invitado": "borrar-nombre",
  // RUT inválido (24-nov-2026): con ese RUT el SII rechaza la factura, así que
  // se borra y el mesón lo vuelve a pedir. Razón social, giro y dirección se
  // dejan: suelen estar bien y el operador solo tiene que poner el RUT.
  "rut-falso": "borrar-rut",
  "rut-invalido": "borrar-rut",
  "rut-dv-invalido": "borrar-rut",
  // Deliberadamente fuera: telefono-sospechoso (puede ser real, hay que
  // preguntarle al cliente), patente-*, factura-*, vehiculo-*, fecha-*
  // y visitas-* — ver el encabezado.
};

type Cambio = {
  cliente: Cliente;
  campo: "telefono" | "email" | "nombre" | "rut";
  antes: string;
  despues: string | null;
  accion: Accion;
  chequeo: string;
};

function planificar(c: Cliente, hallazgos: Hallazgo[]): Cambio[] {
  const cambios: Cambio[] = [];
  for (const h of hallazgos) {
    const accion = ACCION_POR_CHEQUEO[h.chequeo];
    if (!accion) continue;
    switch (accion) {
      case "borrar-telefono":
        cambios.push({ cliente: c, campo: "telefono", antes: c.telefono || "", despues: null, accion, chequeo: h.chequeo });
        break;
      case "normalizar-telefono": {
        const normalizado = formatTelefono(c.telefono);
        if (normalizado !== c.telefono) cambios.push({ cliente: c, campo: "telefono", antes: c.telefono || "", despues: normalizado, accion, chequeo: h.chequeo });
        break;
      }
      case "borrar-email":
        cambios.push({ cliente: c, campo: "email", antes: c.email || "", despues: null, accion, chequeo: h.chequeo });
        break;
      case "corregir-dominio": {
        const email = (c.email || "").trim();
        const corte = email.lastIndexOf("@");
        const sugerido = sugerirDominio(email.slice(corte + 1).toLowerCase());
        if (sugerido) cambios.push({ cliente: c, campo: "email", antes: email, despues: `${email.slice(0, corte).toLowerCase()}@${sugerido}`, accion, chequeo: h.chequeo });
        break;
      }
      case "quitar-tildes-email": {
        const email = (c.email || "").trim();
        const ascii = transliterar(email).toLowerCase();
        if (ascii !== email && !/[^\x20-\x7E]/.test(ascii)) cambios.push({ cliente: c, campo: "email", antes: email, despues: ascii, accion, chequeo: h.chequeo });
        break;
      }
      case "minusculas-email": {
        const email = (c.email || "").trim();
        if (email !== email.toLowerCase()) cambios.push({ cliente: c, campo: "email", antes: email, despues: email.toLowerCase(), accion, chequeo: h.chequeo });
        break;
      }
      case "borrar-nombre":
        cambios.push({ cliente: c, campo: "nombre", antes: c.nombre, despues: NOMBRE_VACIO, accion, chequeo: h.chequeo });
        break;
      case "borrar-rut":
        cambios.push({ cliente: c, campo: "rut", antes: c.rut || "", despues: null, accion, chequeo: h.chequeo });
        break;
    }
  }
  // Un mismo campo puede caer en dos chequeos (un correo de relleno que además
  // tiene el dominio mal escrito). Gana borrar: corregirle el dominio a
  // "noquiere@darcorreo.gmsil.com" lo dejaría igual de inservible, pero con
  // pinta de dato bueno.
  const porCampo = new Map<string, Cambio>();
  for (const cambio of cambios) {
    const previo = porCampo.get(cambio.campo);
    if (!previo || (previo.despues !== null && cambio.despues === null)) porCampo.set(cambio.campo, cambio);
  }
  return [...porCampo.values()];
}

const ETIQUETA: Record<Accion, string> = {
  "borrar-telefono": "borra el teléfono",
  "normalizar-telefono": "normaliza el teléfono",
  "borrar-email": "borra el correo",
  "corregir-dominio": "corrige el dominio del correo",
  "quitar-tildes-email": "saca las tildes del correo",
  "minusculas-email": "pasa el correo a minúsculas",
  "borrar-nombre": "deja el nombre como «Sin nombre»",
  "borrar-rut": "borra el RUT",
};

// Comilla simple SQL: el valor viaja como literal en el VALUES.
const lit = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);

/**
 * El SQL que el usuario pega en el SQL Editor de Supabase (desde acá no se
 * escribe a producción). Un bloque por campo: cada UPDATE solo pisa la ficha
 * si el campo sigue teniendo el valor malo que se vio al generar (si alguien
 * lo corrigió entretanto, no se toca), y lo que realmente cambió queda en
 * `auditoria` con el valor anterior. Re-pegarlo no hace nada: el valor malo ya
 * no está.
 */
function generarSql(cambios: Cambio[], empresasMalas: { id: string; rut: string; razon_social: string }[], fecha: string): string {
  const partes = [`-- Limpieza de datos de clientes ${fecha} (scripts/limpiar-datos-clientes.ts --sql)`, "begin;"];
  for (const campo of ["nombre", "telefono", "email", "rut"] as const) {
    const suyos = cambios.filter((x) => x.campo === campo);
    if (!suyos.length) continue;
    const filas = suyos.map((x) => `  (${lit(x.cliente.id)}, ${lit(x.antes)}, ${lit(x.despues)}, ${lit(`limpieza de datos: ${x.chequeo}`)})`).join(",\n");
    partes.push(
      `\n-- ${campo}: ${suyos.length} fichas
with v(id, antes, despues, motivo) as (values
${filas}
), u as (
  update clientes c set ${campo} = v.despues
  from v where c.id = v.id and btrim(coalesce(c.${campo}, '')) = btrim(v.antes)
  returning c.id, v.antes, v.despues, v.motivo
)
insert into auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario)
select 'clientes', id, 'update', jsonb_build_object('${campo}', antes), jsonb_build_object('${campo}', despues, 'motivo', motivo), 'limpieza-datos' from u;`
    );
  }
  if (empresasMalas.length) {
    // empresas.rut es obligatorio: una empresa con RUT inválido no se puede
    // dejar sin RUT, se borra (nada la referencia; la vuelve a crear el mesón
    // cuando se carga el RUT bueno).
    partes.push(
      `\n-- empresas con RUT inválido: ${empresasMalas.length}
with d as (
  delete from empresas where id in (${empresasMalas.map((e) => lit(e.id)).join(", ")})
  returning *
)
insert into auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario)
select 'empresas', id, 'delete', to_jsonb(d), jsonb_build_object('motivo', 'limpieza de datos: rut inválido'), 'limpieza-datos' from d;`
    );
  }
  partes.push("\ncommit;");
  return partes.join("\n") + "\n";
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");

  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);
  const ahora = new Date();

  const filas = (await db.select().from(clientes)).map(conPatenteTexto);
  const cambios = filas.flatMap((c) => planificar(c, revisarCliente(c, ahora)));
  const fichas = new Set(cambios.map((x) => x.cliente.id));

  console.log("═".repeat(72));
  console.log(aplicar ? "LIMPIEZA DE DATOS DE CLIENTES — APLICANDO" : "LIMPIEZA DE DATOS DE CLIENTES — SIMULACIÓN (no escribe nada)");
  console.log("═".repeat(72));
  console.log(`  Clientes en la base: ${filas.length}`);
  console.log(`  Fichas a tocar: ${fichas.size}`);
  console.log(`  Campos a cambiar: ${cambios.length}\n`);

  const porAccion = new Map<Accion, Cambio[]>();
  for (const cambio of cambios) porAccion.set(cambio.accion, [...(porAccion.get(cambio.accion) || []), cambio]);
  for (const [accion, items] of [...porAccion.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${ETIQUETA[accion].padEnd(38)} ${String(items.length).padStart(4)}`);
  }

  console.log("\n■ Muestra de lo que va a pasar");
  for (const [accion, items] of porAccion) {
    console.log(`\n  ${ETIQUETA[accion]} (${items.length})`);
    for (const x of items.slice(0, 8)) {
      console.log(`    ${x.cliente.patente.padEnd(9)} ${(x.cliente.nombre || "—").slice(0, 22).padEnd(22)} ${x.antes.slice(0, 34).padEnd(34)} → ${x.despues === null ? "(vacío)" : x.despues}`);
    }
    if (items.length > 8) console.log(`    … y ${items.length - 8} más`);
  }

  // Respaldo antes de tocar nada: la fila completa de cada ficha afectada, tal
  // como está ahora. La auditoría guarda el campo cambiado, esto guarda el
  // resto por si hiciera falta reconstruir algo a mano.
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const afectadas = filas.filter((c) => fichas.has(c.id));
  const respaldo = [
    ["id", "patente", "nombre", "telefono", "email", "vehiculo", "plan", "rut", "razon_social", "origen", "creado_por", "creado_en", "cambios"].join(","),
    ...afectadas.map((c) =>
      [
        c.id,
        c.patente,
        c.nombre,
        c.telefono,
        c.email,
        c.vehiculo,
        c.plan,
        c.rut,
        c.razonSocial,
        c.origen,
        c.creadoPor,
        c.creadoEn,
        cambios
          .filter((x) => x.cliente.id === c.id)
          .map((x) => `${x.campo}: ${x.antes} → ${x.despues === null ? "(vacío)" : x.despues}`)
          .join(" | "),
      ]
        .map(esc)
        .join(",")
    ),
  ];
  const rutaRespaldo = `respaldo-limpieza-clientes-${ahora.toISOString().slice(0, 10)}.csv`;
  writeFileSync(rutaRespaldo, "﻿" + respaldo.join("\n"), "utf8");
  console.log(`\nRespaldo de las ${afectadas.length} fichas afectadas escrito en ${rutaRespaldo}`);

  if (process.argv.includes("--sql")) {
    const filasEmp = (await client`select id, rut, razon_social from empresas`) as unknown as { id: string; rut: string; razon_social: string }[];
    const empresasMalas = filasEmp.filter((e) => !isValidRut(e.rut) || !dvCorrecto(limpiarRut(e.rut)) || RUTS_FALSOS.has(limpiarRut(e.rut)));
    for (const e of empresasMalas) console.log(`  borra la empresa ${e.razon_social} (${e.rut})`);
    const rutaSql = `limpieza-clientes-${ahora.toISOString().slice(0, 10)}.sql`;
    writeFileSync(rutaSql, generarSql(cambios, empresasMalas, ahora.toISOString().slice(0, 10)), "utf8");
    console.log(`\nSQL escrito en ${rutaSql} (no se escribió nada en la base).`);
    await client.end();
    return;
  }

  if (!aplicar) {
    console.log("\nSimulación: no se escribió nada. Volvé a correr con --aplicar para hacerlo efectivo.");
    await client.end();
    return;
  }

  // Un UPDATE por ficha (no por campo) para que una ficha con teléfono y
  // correo malos se arregle en una sola escritura, y una fila de auditoría por
  // campo cambiado, que es la unidad que después se va a querer consultar
  // ("¿qué correo tenía antes esta patente?").
  let tocadas = 0;
  for (const c of afectadas) {
    const suyos = cambios.filter((x) => x.cliente.id === c.id);
    // `nombre` es notNull en el esquema: nunca va a null, va al centinela.
    const patch: Partial<Pick<Cliente, "telefono" | "email" | "nombre" | "rut">> = {};
    for (const x of suyos) {
      if (x.campo === "nombre") patch.nombre = x.despues ?? NOMBRE_VACIO;
      else patch[x.campo] = x.despues;
    }
    try {
      await db.update(clientes).set(patch).where(eq(clientes.id, c.id));
    } catch (error) {
      console.error(`  ERROR actualizando ${c.patente}:`, error);
      continue;
    }
    tocadas++;
    await db.insert(auditoria).values(
      suyos.map((x) => ({
        tabla: "clientes",
        registroId: c.id,
        accion: "update",
        datosAnteriores: { [x.campo]: x.antes },
        datosNuevos: { [x.campo]: x.despues, motivo: `limpieza de datos: ${x.chequeo}` },
        usuario: "limpieza-datos",
      }))
    );
  }

  console.log(`\nListo: ${tocadas} fichas actualizadas, ${cambios.length} campos cambiados, todo registrado en la tabla auditoria.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
