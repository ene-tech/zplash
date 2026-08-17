// Auditoría de calidad de datos de la tabla `clientes` (solo lectura, no
// escribe nada nunca): recorre todos los clientes buscando campos que están
// mal cargados —teléfonos de relleno tipo 111111, correos sin @ o con
// "noquieredarmail", RUTs falsos, nombres placeholder, fechas imposibles— y
// además cruza contra el historial de envíos para sumar los correos que NO se
// pudieron mandar por dirección mala (correos_automaticos con estado "error" y
// disparos_regla_correo con estado "error").
//
// Es un DIAGNÓSTICO, no un fix automático: los arreglos de datos de cliente
// (borrar un correo, corregir un teléfono) los tiene que decidir una persona
// mirando el caso, porque muchos de estos valores son la dirección correcta
// con un typo obvio y borrarla a ciegas pierde el dato. Lo único que ya se
// borra solo, y con auditoría, es el email que el proveedor rechaza de plano
// (ver limpiarEmailCliente en @/lib/dataAccess/clientes).
//
// No importa desde @/lib/dataAccess ni @/db (llevan `import "server-only"`,
// que revienta fuera del bundler de Next) — arma su propia conexión mínima,
// mismo patrón que scripts/backfill-renovacion-auto-woo.ts.
//
// Uso:
//   npx tsx --env-file=.env.local scripts/auditar-datos-clientes.ts
//   npx tsx --env-file=.env.local scripts/auditar-datos-clientes.ts --csv hallazgos.csv
//   npx tsx --env-file=.env.local scripts/auditar-datos-clientes.ts --todos   (lista completa, sin recortar a 15 por chequeo)
//   npx tsx --env-file=.env.local scripts/auditar-datos-clientes.ts --html informe.html
//
// Para el PDF del informe (no hay librería de PDF en el proyecto; se imprime
// con el Chrome que ya está instalado):
//   npx tsx --env-file=.env.local scripts/auditar-datos-clientes.ts --html informe.html
//   "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu \
//     --no-pdf-header-footer --print-to-pdf=informe.pdf informe.html

import { writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { auditoria, clientes, correosAutomaticos, disparosReglaCorreo } from "@/db/schema";
import { esEmailEnviable, formatTelefono, isValidEmail } from "@/lib/helpers";
// Los criterios de "qué está mal" viven en un módulo aparte porque este script
// y scripts/limpiar-datos-clientes.ts tienen que usar exactamente los mismos.
import {
  type Cliente,
  type Hallazgo,
  type Severidad,
  distanciaUno,
  normPlate,
  pareceRelleno,
  revisarCliente,
  sugerirDominio,
  tieneRepeticionSospechosa,
  tokenizar,
} from "./calidadDatosClientes";

// ────────────────────────────────────────────────────────────────────────
// Informe imprimible
//
// Misma información que sale por consola, maquetada como documento para
// entregarle a alguien que no va a leer una terminal. Se emite en HTML con
// --html y de ahí sale el PDF imprimiéndolo con Chrome headless (ver el
// comentario de uso al inicio): el proyecto no tiene ninguna librería de PDF
// y agregar una dependencia para un informe puntual no se justifica.
// ────────────────────────────────────────────────────────────────────────

// Una ficha con todos sus problemas juntos: el informe por chequeo sirve para
// decidir arreglos masivos, pero para trabajar caso a caso (llamar al cliente,
// pedirle el correo en el próximo lavado) hace falta ver la ficha completa con
// todo lo que tiene mal de una sola vez.
type Ficha = {
  cliente: Cliente;
  operador: string;
  hallazgos: Hallazgo[];
  severidad: Severidad;
  firma: string;
};

const ORDEN_SEVERIDAD: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };

function armarFichas(hallazgos: Hallazgo[], clientesPorId: Map<string, Cliente>, etiqueta: (c: Cliente) => string): Ficha[] {
  return [...agrupar(hallazgos, (h) => h.clienteId).entries()]
    .flatMap(([id, items]) => {
      const cliente = clientesPorId.get(id);
      if (!cliente) return [];
      const ordenados = [...items].sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
      return [
        {
          cliente,
          operador: etiqueta(cliente),
          hallazgos: ordenados,
          severidad: ordenados[0].severidad,
          firma: ordenados.map((h) => h.chequeo).join("+"),
        },
      ];
    })
    .sort(
      (a, b) =>
        ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad] ||
        b.hallazgos.length - a.hallazgos.length ||
        a.firma.localeCompare(b.firma) ||
        a.cliente.patente.localeCompare(b.cliente.patente)
    );
}

type DatosInforme = {
  fecha: Date;
  totalClientes: number;
  hallazgos: Hallazgo[];
  fichas: Ficha[];
  clientesConProblema: number;
  sinTelefono: number;
  sinEmail: number;
  incontactables: number;
  typosPorDominio: Array<[string, number, string, number]>;
  emailsDup: Array<[string, Cliente[]]>;
  telsDup: Array<[string, Cliente[]]>;
  compartidos: Array<[string, Cliente[]]>;
  casiIguales: Array<{ a: Cliente; b: Cliente; senal: string }>;
  envios: { total: number; error: number; desde: string };
  disparos: { total: number; error: number; desde: string; porCausa: Array<[string, number]> };
  rechazados: Array<{ patente: string; email: string; fecha: string; error: string }>;
  limpiezas: number;
  proyeccion: { conEmail: number; sinEmail: number; noEnviables: number; relleno: number; typo: number; perdidos: number; sinCanal: number };
  operadores: Array<{
    operador: string;
    fichas: number;
    conProblema: number;
    pct: number;
    hallazgos: Hallazgo[];
    altas: number;
    recientes: number;
    pctRecientes: number | null;
    sinCanal: number;
    fallidos: number;
    desde: string;
    hasta: string;
  }>;
  mesesRelleno: string[];
  rellenoPorOperador: Array<[string, Record<string, number>, number]>;
  desde30: string;
};

const esc = (v: unknown) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => n.toLocaleString("es-CL");
const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

// Columnas de la tabla cruzada operador × problema: los chequeos que
// concentran el volumen. Todo lo demás cae en "Otros" para que la tabla no
// crezca a 15 columnas ilegibles.
const COLUMNAS_CRUCE: Array<[string, string]> = [
  ["telefono-invalido", "Tel. inválido"],
  ["telefono-repetido", "Tel. inventado"],
  ["email-relleno", "Correo relleno"],
  ["email-dominio-typo", "Dominio malo"],
  ["email-no-enviable", "Correo inentregable"],
];

function seccionHallazgos(hallazgos: Hallazgo[]): string {
  const orden: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  const porChequeo = [...agrupar(hallazgos, (h) => h.chequeo).entries()].sort(
    (a, b) => orden[a[1][0].severidad] - orden[b[1][0].severidad] || b[1].length - a[1].length
  );
  return porChequeo
    .map(([chequeo, items]) => {
      const h0 = items[0];
      const ejemplos = items
        .slice(0, 6)
        .map((h) => `<li><span class="pat">${esc(h.patente)}</span> ${esc(h.valor === "" ? "(vacío)" : h.valor)}</li>`)
        .join("");
      // El detalle del primer hallazgo NO vale como descripción del grupo
      // cuando los motivos difieren: rotulaba "solo 3 dígitos" a los 361
      // teléfonos inválidos, de los que 358 son "+569" y 3 son otra cosa.
      const detalles = [...agrupar(items, (h) => h.detalle).entries()].sort((a, b) => b[1].length - a[1].length);
      const descripcion =
        detalles.length === 1 ? esc(h0.detalle) : detalles.map(([d, its]) => `${esc(d)} <strong>(${num(its.length)})</strong>`).join("<br>");
      return `<tr>
        <td><span class="sev sev-${h0.severidad}">${h0.severidad}</span></td>
        <td><strong>${esc(chequeo)}</strong><div class="det">${descripcion}</div></td>
        <td class="n">${num(items.length)}</td>
        <td><ul class="ej">${ejemplos}${items.length > 6 ? `<li class="mas">+${num(items.length - 6)} más en el CSV</li>` : ""}</ul></td>
      </tr>`;
    })
    .join("");
}

function renderInforme(d: DatosInforme): string {
  const fechaTxt = d.fecha.toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const porCampo = [...agrupar(d.hallazgos, (h) => h.campo).entries()].sort((a, b) => b[1].length - a[1].length);
  const altas = d.hallazgos.filter((h) => h.severidad === "alta").length;

  const cruce = d.operadores
    .filter((o) => o.fichas > 0)
    .map((o) => {
      const cuenta = agrupar(o.hallazgos, (h) => h.chequeo);
      const celdas = COLUMNAS_CRUCE.map(([k]) => cuenta.get(k)?.length || 0);
      const otros = o.hallazgos.length - celdas.reduce((a, b) => a + b, 0);
      return `<tr>
        <td>${esc(o.operador)}</td>
        <td class="n">${num(o.fichas)}</td>
        ${celdas.map((n) => `<td class="n${n ? "" : " cero"}">${n || "·"}</td>`).join("")}
        <td class="n${otros ? "" : " cero"}">${otros || "·"}</td>
        <td class="n tot">${num(o.hallazgos.length)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Auditoría de datos de clientes — Zplash</title>
<style>
  @page { size: A4; margin: 15mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #1b2430; font-size: 9.5pt; line-height: 1.45; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 21pt; margin: 0 0 2mm; letter-spacing: -0.4pt; }
  h2 { font-size: 13pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5pt solid #1b2430; letter-spacing: -0.2pt; }
  h3 { font-size: 10.5pt; margin: 6mm 0 2mm; color: #34455c; }
  p { margin: 0 0 2.5mm; }
  .sub { color: #5b6b80; font-size: 9.5pt; }
  .portada { border-bottom: 3pt solid #1b2430; padding-bottom: 4mm; margin-bottom: 6mm; }
  .meta { display: flex; flex-wrap: wrap; gap: 1.5mm 7mm; font-size: 8.5pt; color: #5b6b80; margin-top: 3mm; }
  .meta > span { white-space: nowrap; }
  .meta code { white-space: nowrap; }
  .kpis { display: flex; gap: 3mm; margin: 4mm 0 6mm; }
  .kpi { flex: 1; border: 0.8pt solid #d4dae2; border-radius: 2mm; padding: 3mm; background: #f8fafc; }
  .kpi .v { font-size: 17pt; font-weight: 650; letter-spacing: -0.5pt; display: block; line-height: 1.1; }
  .kpi .l { font-size: 7.6pt; color: #5b6b80; text-transform: uppercase; letter-spacing: 0.3pt; }
  .kpi.alerta { background: #fdf2f2; border-color: #f0c8c8; }
  .kpi.alerta .v { color: #a52020; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.6pt; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.3pt; color: #5b6b80;
       border-bottom: 1pt solid #98a5b5; padding: 1.5mm 2mm; font-weight: 600; }
  td { padding: 1.8mm 2mm; border-bottom: 0.5pt solid #e6eaef; vertical-align: top; }
  tr { page-break-inside: avoid; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.cero { color: #b6bfca; }
  td.tot { font-weight: 650; }
  tbody tr.total td { border-top: 1pt solid #98a5b5; border-bottom: none; font-weight: 650; background: #f4f6f9; }
  .sev { display: inline-block; font-size: 7.2pt; text-transform: uppercase; letter-spacing: 0.3pt;
         padding: 0.6mm 1.6mm; border-radius: 1mm; font-weight: 650; }
  .sev-alta { background: #fbe3e3; color: #9a1c1c; }
  .sev-media { background: #fdf0d9; color: #8a5a08; }
  .sev-baja { background: #e9edf2; color: #4a5a6e; }
  .det { color: #5b6b80; font-size: 8pt; margin-top: 0.6mm; }
  ul.ej { margin: 0; padding: 0; list-style: none; font-size: 8pt; color: #34455c; }
  ul.ej li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 72mm; }
  ul.ej .pat { display: inline-block; min-width: 17mm; font-weight: 600; color: #1b2430; }
  ul.ej .mas { color: #8794a6; font-style: italic; }
  .nota { background: #f4f6f9; border-left: 2.5pt solid #98a5b5; padding: 2.5mm 3mm; margin: 3mm 0; font-size: 8.6pt; color: #34455c; }
  .destacado { background: #fdf2f2; border-left-color: #d06a6a; }
  code { font-family: "Consolas", monospace; font-size: 8.4pt; background: #eef1f5; padding: 0.3mm 1mm; border-radius: 0.8mm; }
  .quiebre { page-break-before: always; }
  table.anexo { font-size: 7.8pt; }
  table.anexo td { padding: 0.9mm 1.6mm; }
  table.anexo .idx { color: #98a5b5; }
  table.anexo .pat { font-weight: 650; letter-spacing: 0.2pt; white-space: nowrap; }
  table.anexo .fecha { white-space: nowrap; }
  .dato { line-height: 1.3; }
  .dato .campo { display: inline-block; min-width: 14mm; color: #5b6b80; }
  .dato .valor { font-family: "Consolas", monospace; font-size: 7.6pt; color: #1b2430; }
  .dato .chk { color: #8794a6; font-size: 7pt; white-space: nowrap; }
  ol.acciones { margin: 0; padding-left: 5mm; }
  ol.acciones li { margin-bottom: 2.5mm; }
  footer { margin-top: 8mm; padding-top: 2.5mm; border-top: 0.8pt solid #d4dae2; font-size: 7.8pt; color: #8794a6; }
</style>
</head>
<body>

<div class="portada">
  <h1>Auditoría de datos de clientes</h1>
  <div class="sub">Campos mal cargados en la base y correos que no llegan a destino</div>
  <div class="meta">
    <span><strong>Datos al:</strong> ${esc(fechaTxt)}</span>
    <span><strong>Alcance:</strong> ${num(d.totalClientes)} fichas de cliente</span>
    <span><strong>Fuente:</strong> tablas <code>clientes</code>, <code>correos_automaticos</code>, <code>disparos_regla_correo</code>, <code>auditoria</code></span>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><span class="v">${num(d.totalClientes)}</span><span class="l">Fichas revisadas</span></div>
  <div class="kpi alerta"><span class="v">${num(d.clientesConProblema)}</span><span class="l">Con algún problema (${pct((d.clientesConProblema / d.totalClientes) * 100)})</span></div>
  <div class="kpi"><span class="v">${num(d.hallazgos.length)}</span><span class="l">Hallazgos (${num(altas)} graves)</span></div>
  <div class="kpi alerta"><span class="v">${pct((d.proyeccion.sinCanal / d.totalClientes) * 100)}</span><span class="l">Sin correo útil hoy</span></div>
</div>

<h2>Resumen</h2>
<p>De ${num(d.totalClientes)} fichas, <strong>${num(d.clientesConProblema)} traen al menos un dato mal cargado</strong>. Tres problemas explican casi todo el volumen:</p>
<ol class="acciones">
  <li><strong>Teléfonos que son solo el prefijo <code>+569</code></strong> — episodio cerrado de julio: el formulario guardaba su propio texto de ejemplo cuando el operador no escribía nada.</li>
  <li><strong>Correos de relleno</strong> (<code>noquieredarcorreo@gmail.com</code>, <code>invitado@gmail.com</code>) — esto <strong>sigue ocurriendo y va en aumento</strong>: es la salida que encuentra el operador cuando el sistema le exige un correo que el cliente no quiere dar.</li>
  <li><strong>Dominios mal escritos</strong>, sobre todo <code>@gmsil.com</code> por <code>@gmail.com</code> — se arregla en una sola pasada.</li>
</ol>
<div class="nota">Sin contacto útil: ${num(d.sinTelefono)} fichas no tienen teléfono y ${num(d.sinEmail)} no tienen correo; ${num(d.incontactables)} no tienen ninguno de los dos.</div>

<h2>Hallazgos por campo</h2>
${porCampo
  .map(
    ([campo, items]) => `<h3>${esc(campo)} — ${num(items.length)} hallazgo(s)</h3>
<table>
  <thead><tr><th style="width:15mm">Gravedad</th><th style="width:58mm">Problema</th><th class="n" style="width:14mm">Casos</th><th>Ejemplos</th></tr></thead>
  <tbody>${seccionHallazgos(items)}</tbody>
</table>`
  )
  .join("")}

${
  d.typosPorDominio.length
    ? `<h3>Dominios mal escritos, por frecuencia</h3>
<div class="nota destacado">No todos rebotan, y eso es peor: <code>@gmsil.com</code> tiene servidor de correo propio (es un dominio de terceros que vive de los errores de tipeo de <code>@gmail.com</code>), así que esos correos <strong>se entregan</strong> — con los datos del cliente adentro — a alguien que no es el cliente. La bandeja de salida los muestra como enviados.</div>
<table>
  <thead><tr><th>Dominio cargado</th><th class="n" style="width:22mm">Clientes</th><th class="n" style="width:26mm">De relleno</th><th style="width:38mm">Debería decir</th></tr></thead>
  <tbody>${d.typosPorDominio
    .map(
      ([dom, n, sug, relleno]) =>
        `<tr><td><code>@${esc(dom)}</code></td><td class="n">${num(n)}</td><td class="n${relleno ? "" : " cero"}">${relleno || "·"}</td><td><code>@${esc(sug)}</code></td></tr>`
    )
    .join("")}</tbody>
</table>
<p class="sub">La columna «de relleno» son direcciones que además son inventadas (<code>noquieredsrcorreo@gmsil.com</code>): esas se borran, no se corrigen.</p>`
    : ""
}

<div class="quiebre"></div>
<h2>Fichas duplicadas</h2>
<p>Un mismo cliente cargado dos veces parte en dos su historial de visitas y de pagos, y la ficha con la patente inventada nunca vuelve a aparecer en un escaneo.</p>
<div class="nota">Que un mismo correo o teléfono aparezca en varias patentes <strong>no se considera un problema</strong>: es lo habitual en flotas, empresas y familias. Se usa solo como señal para detectar la patente mal tipeada, y las direcciones genéricas que sí eran un problema ya están contadas como correo de relleno.</div>
<h3>Patentes que difieren en un carácter, con el mismo contacto — ${num(d.casiIguales.length)} par(es)</h3>
<table>
  <thead><tr><th style="width:36mm">Patentes</th><th style="width:28mm">Coinciden en</th><th>Nombres</th><th>Contacto</th></tr></thead>
  <tbody>${d.casiIguales
    .map(
      (p) =>
        `<tr><td><strong>${esc(p.a.patente)}</strong> ↔ <strong>${esc(p.b.patente)}</strong></td><td>${esc(p.senal)}</td><td>${esc(p.a.nombre)} / ${esc(p.b.nombre)}</td><td>${esc(p.a.email || p.a.telefono || "—")}</td></tr>`
    )
    .join("")}</tbody>
</table>
<p class="sub">Como contexto: hay ${num(d.emailsDup.length)} direcciones y ${num(d.telsDup.length)} teléfonos que aparecen en más de una ficha, ${num(d.compartidos.length)} de ellos en tres o más. No es un hallazgo, es el uso normal de una flota o una familia.</p>

<div class="quiebre"></div>
<h2>Correos que no se pudieron enviar</h2>
<div class="nota">El registro de envíos es corto porque las tablas son nuevas: la bandeja de salida arranca el ${esc(d.envios.desde)} y los disparos de reglas el ${esc(d.disparos.desde)}. Por eso, más abajo, la proyección de lo que fallaría hoy.</div>
<table>
  <thead><tr><th>Registro</th><th class="n" style="width:24mm">Total</th><th class="n" style="width:24mm">Fallidos</th><th class="n" style="width:20mm">% fallo</th></tr></thead>
  <tbody>
    <tr><td>Bandeja de salida (<code>correos_automaticos</code>)</td><td class="n">${num(d.envios.total)}</td><td class="n">${num(d.envios.error)}</td><td class="n">${d.envios.total ? pct((d.envios.error / d.envios.total) * 100) : "—"}</td></tr>
    <tr><td>Disparos de reglas de correo</td><td class="n">${num(d.disparos.total)}</td><td class="n">${num(d.disparos.error)}</td><td class="n">${d.disparos.total ? pct((d.disparos.error / d.disparos.total) * 100) : "—"}</td></tr>
    <tr><td>Correos borrados de la ficha por inentregables</td><td class="n">—</td><td class="n">${num(d.limpiezas)}</td><td class="n">—</td></tr>
  </tbody>
</table>
<h3>Causa de los fallos</h3>
<table>
  <thead><tr><th>Causa</th><th class="n" style="width:24mm">Casos</th></tr></thead>
  <tbody>${d.disparos.porCausa.map(([causa, n]) => `<tr><td>${esc(causa)}</td><td class="n">${num(n)}</td></tr>`).join("")}</tbody>
</table>
${
  d.rechazados.length
    ? `<h3>Direcciones rechazadas por el proveedor</h3>
<table>
  <thead><tr><th style="width:18mm">Patente</th><th style="width:52mm">Dirección</th><th style="width:20mm">Fecha</th><th>Motivo</th></tr></thead>
  <tbody>${d.rechazados.map((r) => `<tr><td>${esc(r.patente)}</td><td>${esc(r.email)}</td><td>${esc(r.fecha)}</td><td class="sub">${esc(r.error)}</td></tr>`).join("")}</tbody>
</table>`
    : ""
}
<h3>Proyección: a quién no le llegaría un correo hoy</h3>
<table>
  <thead><tr><th>Situación</th><th class="n" style="width:26mm">Clientes</th></tr></thead>
  <tbody>
    <tr><td>Con correo cargado</td><td class="n">${num(d.proyeccion.conEmail)}</td></tr>
    <tr><td>Sin correo (el envío ni se intenta)</td><td class="n">${num(d.proyeccion.sinEmail)}</td></tr>
    <tr><td>Correo que el proveedor rechaza de plano</td><td class="n">${num(d.proyeccion.noEnviables)}</td></tr>
    <tr><td>Correo de relleno (llega a un buzón que no es del cliente)</td><td class="n">${num(d.proyeccion.relleno)}</td></tr>
    <tr><td>Correo con el dominio mal escrito (rebota)</td><td class="n">${num(d.proyeccion.typo)}</td></tr>
    <tr class="total"><td>Sin canal de correo útil</td><td class="n">${num(d.proyeccion.sinCanal)} · ${pct((d.proyeccion.sinCanal / d.totalClientes) * 100)} de la base</td></tr>
  </tbody>
</table>

<div class="quiebre"></div>
<h2>Por operador</h2>
<p><code>clientes.creado_por</code> guarda quién <strong>creó</strong> la ficha, no quién la editó después: esto atribuye la carga inicial del dato. «Administrador», «Administración» y «Gerencia» son perfiles compartidos, no personas.</p>
<table>
  <thead><tr>
    <th>Operador</th><th class="n">Fichas</th><th class="n">Con problema</th><th class="n">%</th>
    <th class="n">Hallazgos</th><th class="n">Graves</th><th class="n">Últ. 30 d</th><th class="n">% 30 d</th>
    <th class="n">Sin correo útil</th><th class="n">Correos fallidos</th>
  </tr></thead>
  <tbody>
    ${d.operadores
      .map(
        (o) => `<tr>
      <td>${esc(o.operador)}</td><td class="n">${num(o.fichas)}</td><td class="n">${num(o.conProblema)}</td><td class="n">${pct(o.pct)}</td>
      <td class="n">${num(o.hallazgos.length)}</td><td class="n">${num(o.altas)}</td><td class="n">${num(o.recientes)}</td>
      <td class="n">${o.pctRecientes === null ? "—" : pct(o.pctRecientes)}</td>
      <td class="n">${num(o.sinCanal)}</td><td class="n">${num(o.fallidos)}</td></tr>`
      )
      .join("")}
    <tr class="total">
      <td>TOTAL</td><td class="n">${num(d.totalClientes)}</td><td class="n">${num(d.clientesConProblema)}</td>
      <td class="n">${pct((d.clientesConProblema / d.totalClientes) * 100)}</td><td class="n">${num(d.hallazgos.length)}</td>
      <td class="n">${num(altas)}</td><td class="n">—</td><td class="n">—</td>
      <td class="n">${num(d.proyeccion.sinCanal)}</td><td class="n">${num(d.disparos.error)}</td>
    </tr>
  </tbody>
</table>
<p class="sub">«Últ. 30 d» son las fichas creadas desde el ${esc(d.desde30)}; el porcentaje de al lado dice cómo se está cargando hoy, sin arrastrar episodios ya cerrados.</p>

<h3>Qué problema cargó cada uno</h3>
<table>
  <thead><tr><th>Operador</th><th class="n">Fichas</th>${COLUMNAS_CRUCE.map(([, l]) => `<th class="n">${l}</th>`).join("")}<th class="n">Otros</th><th class="n">Total</th></tr></thead>
  <tbody>${cruce}</tbody>
</table>

<h3>Correos de relleno por mes — el problema que sigue creciendo</h3>
<table>
  <thead><tr><th>Operador</th>${d.mesesRelleno.map((m) => `<th class="n">${esc(m)}</th>`).join("")}<th class="n">Total</th></tr></thead>
  <tbody>${d.rellenoPorOperador
    .map(
      ([op, porMes, total]) =>
        `<tr><td>${esc(op)}</td>${d.mesesRelleno.map((m) => `<td class="n${porMes[m] ? "" : " cero"}">${porMes[m] || "·"}</td>`).join("")}<td class="n tot">${num(total)}</td></tr>`
    )
    .join("")}</tbody>
</table>
<div class="nota destacado">El mes en curso está incompleto y aun así iguala o supera al anterior en varios casos. Todos escriben las mismas direcciones, así que la práctica se copia entre turnos: no es descuido individual, es el atajo frente a un campo obligatorio que el cliente no quiere completar.</div>

<div class="quiebre"></div>
<h2>Anexo: listado de fichas con problemas</h2>
<p>Las ${num(d.fichas.length)} fichas afectadas, una por fila, con el dato exacto que está guardado. Ordenadas por gravedad y agrupadas por tipo de problema, de modo que las fichas que se arreglan igual quedan juntas.</p>
<table class="anexo">
  <thead><tr>
    <th style="width:8mm">#</th><th style="width:11mm">Grav.</th><th style="width:18mm">Patente</th>
    <th style="width:34mm">Nombre</th><th style="width:22mm">Operador</th><th style="width:16mm">Creada</th>
    <th>Dato guardado y problema</th>
  </tr></thead>
  <tbody>
    ${d.fichas
      .map(
        (f, i) => `<tr>
      <td class="n idx">${i + 1}</td>
      <td><span class="sev sev-${f.severidad}">${f.severidad}</span></td>
      <td class="pat">${esc(f.cliente.patente)}</td>
      <td>${esc(f.cliente.nombre || "—")}</td>
      <td class="sub">${esc(f.operador)}</td>
      <td class="sub">${esc(String(f.cliente.creadoEn).slice(0, 10))}</td>
      <td>${f.hallazgos
        .map(
          (h) =>
            `<div class="dato"><span class="campo">${esc(h.campo)}</span> <span class="valor">${esc(h.valor === "" ? "(vacío)" : h.valor)}</span> <span class="chk">${esc(h.chequeo)}</span></div>`
        )
        .join("")}</td>
    </tr>`
      )
      .join("")}
  </tbody>
</table>

<footer>
  Generado por <code>scripts/auditar-datos-clientes.ts</code> — proceso de solo lectura, no modificó ningún dato.
  El mismo listado, filtrable en Excel, está en los CSV que acompañan a este informe
  (uno por hallazgo y uno por ficha).
</footer>

</body>
</html>`;
}

function agrupar<T>(items: T[], clave: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = clave(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

// Reduce el mensaje de error del proveedor a una categoría estable: los textos
// traen el id del envío y la dirección, así que agrupar por el string crudo
// daría una fila por correo en vez de un conteo por causa.
function clasificarError(error: string): string {
  const e = error.toLowerCase();
  if (e.includes("no puede recibir correo") || e.includes("invalid") || e.includes("validation_error")) return "dirección inválida / inentregable";
  if (e.includes("sin email") || e.includes("cliente sin email")) return "cliente sin email cargado";
  if (e.includes("bounce") || e.includes("rebot")) return "rebote del destinatario";
  if (e.includes("rate") || e.includes("too many")) return "límite de envío del proveedor";
  if (e.includes("no configurado") || e.includes("resend_api_key") || e.includes("sin proveedor")) return "proveedor de correo no configurado";
  if (e.includes("plantilla")) return "plantilla no disponible";
  return "otro";
}

function tabla(filas: Array<[string, string | number]>, ancho = 46): string {
  return filas.map(([k, v]) => `  ${k.padEnd(ancho, ".")} ${v}`).join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en las variables de entorno");
  const mostrarTodos = process.argv.includes("--todos");
  const csvIdx = process.argv.indexOf("--csv");
  const csvPath = csvIdx >= 0 ? process.argv[csvIdx + 1] : null;
  const htmlIdx = process.argv.indexOf("--html");
  const htmlPath = htmlIdx >= 0 ? process.argv[htmlIdx + 1] : null;
  const LIMITE = mostrarTodos ? Number.POSITIVE_INFINITY : 15;

  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client);
  const ahora = new Date();

  const filas = await db.select().from(clientes);
  const hallazgos = filas.flatMap((c) => revisarCliente(c, ahora));

  console.log("═".repeat(72));
  console.log("AUDITORÍA DE DATOS — CLIENTES");
  console.log("═".repeat(72));
  console.log(
    tabla([
      ["Clientes en la base", filas.length],
      ["Clientes con al menos un problema", new Set(hallazgos.map((h) => h.clienteId)).size],
      ["Hallazgos totales", hallazgos.length],
      ["  · severidad alta", hallazgos.filter((h) => h.severidad === "alta").length],
      ["  · severidad media", hallazgos.filter((h) => h.severidad === "media").length],
      ["  · severidad baja", hallazgos.filter((h) => h.severidad === "baja").length],
      ["Sin teléfono", filas.filter((c) => !(c.telefono || "").trim()).length],
      ["Sin email", filas.filter((c) => !(c.email || "").trim()).length],
      ["Sin teléfono NI email (incontactables)", filas.filter((c) => !(c.telefono || "").trim() && !(c.email || "").trim()).length],
    ])
  );

  const porCampo = agrupar(hallazgos, (h) => h.campo);
  console.log("\n" + "─".repeat(72));
  console.log("HALLAZGOS POR CAMPO");
  console.log("─".repeat(72));
  const ordenSeveridad: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  for (const [campo, delCampo] of [...porCampo.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n■ ${campo} — ${delCampo.length} hallazgo(s)`);
    const porChequeo = [...agrupar(delCampo, (h) => h.chequeo).entries()].sort(
      (a, b) => ordenSeveridad[a[1][0].severidad] - ordenSeveridad[b[1][0].severidad] || b[1].length - a[1].length
    );
    for (const [chequeo, items] of porChequeo) {
      const h0 = items[0];
      console.log(`\n  [${h0.severidad.toUpperCase()}] ${chequeo} — ${items.length}`);
      // Un motivo por línea con su conteo cuando el grupo mezcla varios: el
      // detalle del primero solo describe a todo el grupo si es el único.
      const detalles = [...agrupar(items, (h) => h.detalle).entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [detalle, its] of detalles) console.log(`  ${detalle}${detalles.length > 1 ? ` (${its.length})` : ""}`);
      for (const h of items.slice(0, LIMITE)) {
        console.log(`    ${h.patente.padEnd(8)} ${(h.nombre || "—").slice(0, 26).padEnd(26)} ${h.valor === "" ? "(vacío)" : h.valor}`);
      }
      if (items.length > LIMITE) console.log(`    … y ${items.length - LIMITE} más (correr con --todos para verlos)`);
    }
  }

  // Los dominios mal escritos se repiten muchísimo (el mismo error tipeado
  // cientos de veces), así que verlos agrupados por dominio dice más que la
  // lista de correos: cada línea es un arreglo masivo de una sola vez.
  // Se cuenta sobre TODOS los clientes con el dominio mal escrito, no sobre
  // los hallazgos email-dominio-typo: el chequeo de relleno corre antes, así
  // que "noquieredsrcorreo@gmsil.com" sale de la tabla y el UPDATE masivo
  // dejaría fichas sin tocar. La columna "de relleno" avisa cuáles de esas
  // direcciones no hay que corregir sino borrar.
  const conDominioMalo = filas.filter((c) => {
    const email = (c.email || "").trim();
    return isValidEmail(email) && Boolean(sugerirDominio(email.split("@").at(-1)!.toLowerCase()));
  });
  const typosPorDominio: Array<[string, number, string, number]> = [...agrupar(conDominioMalo, (c) => c.email!.toLowerCase().split("@").at(-1)!).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([dom, cs]) => [dom, cs.length, sugerirDominio(dom) || "?", cs.filter((c) => pareceRelleno(c.email!, "email")).length]);
  if (typosPorDominio.length) {
    console.log("\n■ Dominios mal escritos, por frecuencia");
    for (const [dom, n, sug, relleno] of typosPorDominio) {
      console.log(`    @${dom.padEnd(28)} ${String(n).padStart(4)} cliente(s)  →  @${sug}${relleno ? `   (${relleno} de esas son de relleno: se borran, no se corrigen)` : ""}`);
    }
  }

  // --- Duplicados: no son un campo "malo" en sí, pero son error de carga ---
  console.log("\n" + "─".repeat(72));
  console.log("DUPLICADOS ENTRE CLIENTES");
  console.log("─".repeat(72));
  const conEmail = filas.filter((c) => (c.email || "").trim() && isValidEmail(c.email));
  const emailsDup = [...agrupar(conEmail, (c) => c.email!.trim().toLowerCase()).entries()].filter(([, v]) => v.length > 1);
  const conTel = filas.filter((c) => (c.telefono || "").trim() && /^\+569\d{8}$/.test(formatTelefono(c.telefono)));
  const telsDup = [...agrupar(conTel, (c) => formatTelefono(c.telefono)).entries()].filter(([, v]) => v.length > 1);
  console.log(`\n■ Emails repetidos en más de un cliente: ${emailsDup.length}`);
  console.log("  (puede ser legítimo — flota o familia — pero también carga duplicada)");
  for (const [email, cs] of emailsDup.sort((a, b) => b[1].length - a[1].length).slice(0, LIMITE)) {
    console.log(`    ${email.padEnd(38)} ${cs.length} clientes: ${cs.map((c) => c.patente).join(", ")}`);
  }
  if (emailsDup.length > LIMITE) console.log(`    … y ${emailsDup.length - LIMITE} más`);
  console.log(`\n■ Teléfonos repetidos en más de un cliente: ${telsDup.length}`);
  for (const [tel, cs] of telsDup.sort((a, b) => b[1].length - a[1].length).slice(0, LIMITE)) {
    console.log(`    ${tel.padEnd(38)} ${cs.length} clientes: ${cs.map((c) => c.patente).join(", ")}`);
  }
  if (telsDup.length > LIMITE) console.log(`    … y ${telsDup.length - LIMITE} más`);

  // Fichas casi iguales: mismo email o mismo teléfono y patentes que difieren
  // en un solo carácter (GDGX90 / GGDGX90, HRRY61 / HRRI61). Es el patrón de
  // la patente mal tipeada al crear la ficha: quedan dos clientes, cada uno
  // con la mitad de las visitas y del historial de pagos, y el que tiene la
  // patente inventada nunca vuelve a aparecer en un escaneo.
  // Se agrupa por cada señal que puede delatar al mismo cliente (email real,
  // teléfono real, nombre) y dentro de cada grupo se comparan las patentes.
  // El email/teléfono de relleno queda fuera a propósito: si entrara, los 361
  // clientes con "+569" caerían todos en el mismo grupo y cualquier par de
  // patentes parecidas entre ellos saldría como duplicado sin serlo.
  const casiIguales = new Map<string, { a: Cliente; b: Cliente; senal: string }>();
  const emailReal = (c: Cliente) => (isValidEmail(c.email) && !pareceRelleno(c.email!, "email") ? c.email!.trim().toLowerCase() : "");
  const telReal = (c: Cliente) => {
    const t = formatTelefono(c.telefono);
    const d = t.replace(/\D/g, "");
    return /^\+569\d{8}$/.test(t) && !tieneRepeticionSospechosa(d) ? t : "";
  };
  const senales: Array<[string, (c: Cliente) => string]> = [
    ["mismo email", emailReal],
    ["mismo teléfono", telReal],
    ["mismo nombre", (c) => (tokenizar(c.nombre).length >= 6 && !pareceRelleno(c.nombre) ? tokenizar(c.nombre) : "")],
  ];
  for (const [senal, clave] of senales) {
    for (const [k, grupo] of agrupar(filas, clave)) {
      if (!k || grupo.length < 2 || grupo.length > 50) continue;
      for (let i = 0; i < grupo.length; i++) {
        for (let j = i + 1; j < grupo.length; j++) {
          if (!distanciaUno(normPlate(grupo[i].patente), normPlate(grupo[j].patente))) continue;
          const id = [grupo[i].id, grupo[j].id].sort().join("|");
          if (!casiIguales.has(id)) casiIguales.set(id, { a: grupo[i], b: grupo[j], senal });
        }
      }
    }
  }
  console.log(`\n■ Fichas duplicadas por patente mal tipeada: ${casiIguales.size}`);
  console.log("  Patentes que difieren en un carácter y comparten email, teléfono o nombre: casi seguro es el mismo cliente dos veces.");
  for (const { a, b, senal } of [...casiIguales.values()].slice(0, LIMITE)) {
    console.log(`    ${a.patente.padEnd(7)} ↔ ${b.patente.padEnd(7)} (${senal.padEnd(14)}) ${a.nombre.slice(0, 18).padEnd(18)} / ${b.nombre.slice(0, 18).padEnd(18)} ${a.email || telReal(a) || ""}`);
  }
  if (casiIguales.size > LIMITE) console.log(`    … y ${casiIguales.size - LIMITE} más (correr con --todos para verlas)`);

  // Que un correo o un teléfono se repita en varias patentes NO se cuenta como
  // problema: es lo normal en flotas, empresas y familias, y el dueño del
  // negocio lo confirmó. Las direcciones compartidas que sí eran un problema
  // (invitado@gmail.com y compañía) ya caen por email-relleno, que es lo que
  // realmente las delata. Queda el conteo como dato de contexto, sin alarma.
  const compartidos = emailsDup.filter(([, cs]) => cs.length >= 3);

  // --- Correos que no se pudieron enviar ---
  console.log("\n" + "═".repeat(72));
  console.log("CORREOS QUE NO SE PUDIERON ENVIAR");
  console.log("═".repeat(72));

  const enviosError = await db.select().from(correosAutomaticos).where(eq(correosAutomaticos.estado, "error"));
  const enviosTotales = await db.select({ id: correosAutomaticos.id, creadoEn: correosAutomaticos.creadoEn }).from(correosAutomaticos);
  const disparosError = await db.select().from(disparosReglaCorreo).where(eq(disparosReglaCorreo.estado, "error"));
  const disparosTotales = await db.select({ id: disparosReglaCorreo.id, creadoEn: disparosReglaCorreo.creadoEn }).from(disparosReglaCorreo);
  // Emails que el motor de correo ya borró de la ficha por inentregables (ver
  // limpiarEmailCliente): fallos pasados que hoy no se ven en `clientes`
  // porque justamente el campo quedó vacío.
  const limpiezas = await db
    .select()
    .from(auditoria)
    .where(and(eq(auditoria.tabla, "clientes"), eq(auditoria.usuario, "correo-automatico")));

  const desde = (fechas: string[]) => (fechas.length ? fechas.sort()[0].slice(0, 10) : "—");
  const desdeEnvios = desde(enviosTotales.map((e) => String(e.creadoEn)));
  const desdeDisparos = desde(disparosTotales.map((d) => String(d.creadoEn)));
  console.log(
    tabla([
      ["Historia disponible desde (bandeja de salida)", desdeEnvios],
      ["Historia disponible desde (disparos de reglas)", desdeDisparos],
      ["Correos registrados en la bandeja de salida", enviosTotales.length],
      ["  · fallidos (estado = error)", enviosError.length],
      ["  · % de fallo", enviosTotales.length ? `${((enviosError.length / enviosTotales.length) * 100).toFixed(1)}%` : "—"],
      ["Disparos de reglas de correo", disparosTotales.length],
      ["  · fallidos (estado = error)", disparosError.length],
      ["  · % de fallo", disparosTotales.length ? `${((disparosError.length / disparosTotales.length) * 100).toFixed(1)}%` : "—"],
      ["Emails ya borrados por inentregables (auditoría)", limpiezas.length],
    ])
  );

  console.log("\n■ Fallos de la bandeja de salida por causa");
  for (const [causa, items] of [...agrupar(enviosError, (e) => clasificarError(e.error || "")).entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${causa.padEnd(40)} ${items.length}`);
  }

  const causasDisparos: Array<[string, number]> = [...agrupar(disparosError, (d) => clasificarError(d.error || "")).entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([causa, items]) => [causa, items.length]);
  console.log("\n■ Fallos de disparos de reglas por causa");
  for (const [causa, n] of causasDisparos) {
    console.log(`    ${causa.padEnd(40)} ${n}`);
  }

  // Direcciones concretas que fallaron, con cuántas veces y si el cliente
  // todavía las tiene cargadas (= sigue siendo un correo que se va a intentar
  // mandar y va a volver a fallar) o si ya se le borró el email.
  const porDireccion = agrupar(enviosError, (e) => e.para.trim().toLowerCase());
  const emailsVigentes = new Map(filas.filter((c) => (c.email || "").trim()).map((c) => [c.email!.trim().toLowerCase(), c]));
  const clientesPorId = new Map(filas.map((c) => [c.id, c]));

  const direcciones = [...porDireccion.entries()]
    .map(([dir, envios]) => {
      const clienteActual = emailsVigentes.get(dir);
      const clienteRef = clienteActual || (envios.find((e) => e.clienteId) ? clientesPorId.get(envios.find((e) => e.clienteId)!.clienteId!) : undefined);
      return {
        dir,
        intentos: envios.length,
        ultimo: envios.map((e) => String(e.creadoEn)).sort().at(-1) || "",
        motivo: clasificarError(envios[0].error || ""),
        vigente: Boolean(clienteActual),
        patente: clienteRef?.patente || "—",
        nombre: clienteRef?.nombre || "—",
      };
    })
    .sort((a, b) => b.intentos - a.intentos);

  const vigentes = direcciones.filter((d) => d.vigente);
  console.log(
    "\n" +
      tabla([
        ["Direcciones distintas que fallaron", direcciones.length],
        ["  · que el cliente TODAVÍA tiene cargadas", vigentes.length],
        ["  · ya borradas del cliente (o de un no-cliente)", direcciones.length - vigentes.length],
        ["Intentos fallidos totales", enviosError.length],
      ])
  );

  if (vigentes.length) {
    console.log("\n■ Direcciones malas que siguen cargadas en la ficha (van a volver a fallar)");
    for (const d of vigentes.slice(0, LIMITE)) {
      console.log(`    ${d.patente.padEnd(8)} ${d.nombre.slice(0, 22).padEnd(22)} ${d.dir.padEnd(38)} ${d.intentos} intento(s) · ${d.motivo}`);
    }
    if (vigentes.length > LIMITE) console.log(`    … y ${vigentes.length - LIMITE} más (correr con --todos para verlas)`);
  }

  console.log("\n■ Direcciones con más intentos fallidos");
  for (const d of direcciones.slice(0, LIMITE)) {
    console.log(`    ${d.dir.padEnd(40)} ${String(d.intentos).padStart(3)} intento(s) · ${d.vigente ? "VIGENTE" : "ya limpiada"} · ${d.motivo}`);
  }
  if (direcciones.length > LIMITE) console.log(`    … y ${direcciones.length - LIMITE} más`);

  // Clientes sin email al momento del disparo: no es una dirección mala, es un
  // correo que directamente no se pudo intentar. Va aparte para no mezclarlo
  // con los rechazos del proveedor.
  const sinEmail = disparosError.filter((d) => clasificarError(d.error || "") === "cliente sin email cargado");
  const patentesSinEmail = [...new Set(sinEmail.map((d) => d.patente || d.clienteId || "—"))];
  console.log(
    "\n" +
      tabla([
        ["Disparos que ni se intentaron por falta de email", sinEmail.length],
        ["  · clientes distintos afectados", patentesSinEmail.length],
      ])
  );
  if (patentesSinEmail.length) console.log(`    ${patentesSinEmail.slice(0, LIMITE).join(", ")}${patentesSinEmail.length > LIMITE ? ` … +${patentesSinEmail.length - LIMITE}` : ""}`);

  const rechazados = disparosError.filter((d) => clasificarError(d.error || "") !== "cliente sin email cargado");
  if (rechazados.length) {
    console.log("\n■ Disparos rechazados por la dirección (no por falta de email)");
    for (const d of rechazados.slice(0, LIMITE)) {
      const c = d.clienteId ? clientesPorId.get(d.clienteId) : undefined;
      console.log(`    ${(d.patente || "—").padEnd(8)} ${(c?.email || "(email ya borrado)").padEnd(38)} ${String(d.creadoEn).slice(0, 10)} · ${d.error}`);
    }
    if (rechazados.length > LIMITE) console.log(`    … y ${rechazados.length - LIMITE} más`);
  }

  if (limpiezas.length) {
    console.log("\n■ Emails que el motor ya borró de la ficha por inentregables");
    for (const a of limpiezas.slice(0, LIMITE)) {
      const anterior = (a.datosAnteriores as { email?: string } | null)?.email || "—";
      const motivo = (a.datosNuevos as { motivo?: string } | null)?.motivo || "—";
      const c = clientesPorId.get(a.registroId);
      console.log(`    ${(c?.patente || a.registroId).padEnd(8)} ${anterior.padEnd(38)} ${String(a.creadoEn).slice(0, 10)} · ${motivo}`);
    }
    if (limpiezas.length > LIMITE) console.log(`    … y ${limpiezas.length - LIMITE} más`);
  }

  // Lo anterior es historia (lo que ya falló); esto es la foto de HOY: a
  // cuántos clientes NO les llegaría un correo si el motor corriera ahora
  // mismo. Es el número que importa para decidir cuánto vale limpiar esto,
  // porque el registro histórico solo cubre desde que existen las reglas.
  console.log("\n" + "─".repeat(72));
  console.log("PROYECCIÓN: A QUIÉNES NO LES LLEGARÍA UN CORREO HOY");
  console.log("─".repeat(72));
  const conEmailCargado = filas.filter((c) => (c.email || "").trim());
  const noEnviables = conEmailCargado.filter((c) => !esEmailEnviable(c.email));
  const conRelleno = conEmailCargado.filter((c) => esEmailEnviable(c.email) && pareceRelleno(c.email!, "email"));
  const conTypo = conEmailCargado.filter((c) => {
    const dom = c.email!.trim().toLowerCase().split("@").at(-1) || "";
    return esEmailEnviable(c.email) && !pareceRelleno(c.email!, "email") && Boolean(sugerirDominio(dom));
  });
  const perdidos = new Set([...noEnviables, ...conRelleno, ...conTypo].map((c) => c.id));
  console.log(
    tabla([
      ["Clientes con email cargado", conEmailCargado.length],
      ["Clientes SIN email (el correo ni se intenta)", filas.length - conEmailCargado.length],
      ["Emails que el proveedor rechaza de plano", noEnviables.length],
      ["Emails de relleno (van a un buzón que no es del cliente)", conRelleno.length],
      ["Emails con el dominio mal escrito (rebotan)", conTypo.length],
      ["→ Clientes con email que NO les va a llegar", perdidos.size],
      ["→ Total sin canal de correo útil", filas.length - conEmailCargado.length + perdidos.size],
      ["   como % de la base", `${(((filas.length - conEmailCargado.length + perdidos.size) / filas.length) * 100).toFixed(1)}%`],
    ])
  );

  // --- Mismo diagnóstico, pero por quién cargó la ficha ---
  //
  // `clientes.creadoPor` guarda el nombre del perfil que creó la ficha, no el
  // del que la editó después: esto responde "quién cargó mal el dato al
  // registrar", no "quién es responsable del estado actual de la ficha" (un
  // teléfono corregido más tarde por otra persona sigue contando acá para el
  // que la creó). Las fichas de la web y las migradas de WooCommerce no
  // tienen operador — van juntas en su propia línea para no ensuciar el
  // ranking de la gente del local.
  console.log("\n" + "═".repeat(72));
  console.log("MISMO DIAGNÓSTICO, POR OPERADOR QUE CREÓ LA FICHA");
  console.log("═".repeat(72));

  const etiquetaOperador = (c: Cliente) => (c.creadoPor || "").trim() || (c.origen === "WEB" ? "(web / migración)" : "(sin registrar)");
  const porOperador = agrupar(filas, etiquetaOperador);
  const hallazgosPorCliente = agrupar(hallazgos, (h) => h.clienteId);
  const clientesSinCanal = new Set([...perdidos, ...filas.filter((c) => !(c.email || "").trim()).map((c) => c.id)]);
  const disparosFallidosPorCliente = agrupar(
    disparosError.filter((d) => d.clienteId),
    (d) => d.clienteId!
  );

  // El % de toda la historia arrastra episodios ya cerrados (los "+569" de
  // julio, por ejemplo), así que el de los últimos 30 días va aparte: ese es
  // el que dice cómo se está cargando HOY.
  // Comparar Date contra Date y NO texto contra texto: creadoEn viene como
  // "2026-07-18 14:47:11+00" (con espacio) y toISOString() da "2026-07-18T00:…"
  // (con T). Como ' ' < 'T', comparar los strings dejaba fuera de la ventana
  // todas las fichas del primer día sin importar la hora.
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000);
  const resumen = [...porOperador.entries()]
    .map(([operador, fichas]) => {
      const conProblema = fichas.filter((c) => hallazgosPorCliente.has(c.id));
      const total = fichas.flatMap((c) => hallazgosPorCliente.get(c.id) || []);
      const fechas = fichas.map((c) => String(c.creadoEn)).sort();
      const recientes = fichas.filter((c) => new Date(c.creadoEn) >= hace30);
      const recientesMalas = recientes.filter((c) => hallazgosPorCliente.has(c.id));
      return {
        operador,
        fichas: fichas.length,
        conProblema: conProblema.length,
        pct: (conProblema.length / fichas.length) * 100,
        recientes: recientes.length,
        pctRecientes: recientes.length ? (recientesMalas.length / recientes.length) * 100 : null,
        hallazgos: total,
        altas: total.filter((h) => h.severidad === "alta").length,
        sinCanal: fichas.filter((c) => clientesSinCanal.has(c.id)).length,
        fallidos: fichas.reduce((n, c) => n + (disparosFallidosPorCliente.get(c.id)?.length || 0), 0),
        desde: fechas[0]?.slice(0, 10) || "—",
        hasta: fechas.at(-1)?.slice(0, 10) || "—",
      };
    })
    .sort((a, b) => b.hallazgos.length - a.hallazgos.length);

  const fila = (cols: Array<[string, number]>) => "  " + cols.map(([v, w]) => (w < 0 ? v.slice(0, -w).padEnd(-w) : v.padStart(w))).join(" ");
  console.log("\n■ Ranking (ordenado por cantidad de hallazgos)\n");
  console.log(
    fila([
      ["Operador", -20],
      ["Fichas", 7],
      ["C/prob.", 8],
      ["%", 6],
      ["Hallaz.", 8],
      ["Altas", 6],
      ["30d", 5],
      ["% 30d", 6],
      ["Sin correo útil", 16],
      ["Correos fallidos", 17],
    ])
  );
  console.log(fila([["─".repeat(20), -20], ["─".repeat(7), 7], ["─".repeat(8), 8], ["─".repeat(6), 6], ["─".repeat(8), 8], ["─".repeat(6), 6], ["─".repeat(5), 5], ["─".repeat(6), 6], ["─".repeat(16), 16], ["─".repeat(17), 17]]));
  for (const r of resumen) {
    console.log(
      fila([
        [r.operador, -20],
        [String(r.fichas), 7],
        [String(r.conProblema), 8],
        [r.pct.toFixed(1) + "%", 6],
        [String(r.hallazgos.length), 8],
        [String(r.altas), 6],
        [String(r.recientes), 5],
        [r.pctRecientes === null ? "—" : r.pctRecientes.toFixed(1) + "%", 6],
        [String(r.sinCanal), 16],
        [String(r.fallidos), 17],
      ])
    );
  }
  const recientesTodos = filas.filter((c) => new Date(c.creadoEn) >= hace30);
  console.log(
    fila([
      ["TOTAL", -20],
      [String(filas.length), 7],
      [String(hallazgosPorCliente.size), 8],
      [((hallazgosPorCliente.size / filas.length) * 100).toFixed(1) + "%", 6],
      [String(hallazgos.length), 8],
      [String(hallazgos.filter((h) => h.severidad === "alta").length), 6],
      [String(recientesTodos.length), 5],
      [recientesTodos.length ? ((recientesTodos.filter((c) => hallazgosPorCliente.has(c.id)).length / recientesTodos.length) * 100).toFixed(1) + "%" : "—", 6],
      [String(clientesSinCanal.size), 16],
      [String(disparosError.length), 17],
    ])
  );
  console.log(`\n  «30d» = fichas creadas desde el ${hace30.toISOString().slice(0, 10)}; «% 30d», cuántas de esas traen algún problema.`);
  console.log("  «Sin correo útil» = fichas de ese operador sin email o con un email que no va a llegar.");
  console.log("  «Correos fallidos» = disparos de reglas en error sobre fichas que creó (el registro arranca el 15-ago-2026).");

  console.log("\n■ Detalle por operador");
  for (const r of resumen) {
    console.log(`\n  ${r.operador} — ${r.fichas} ficha(s) creadas entre ${r.desde} y ${r.hasta}`);
    if (!r.hallazgos.length) {
      console.log("    Sin hallazgos.");
      continue;
    }
    const porChequeo = [...agrupar(r.hallazgos, (h) => h.chequeo).entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [chequeo, items] of porChequeo) {
      const rango = [...new Set(items.map((h) => (clientesPorId.get(h.clienteId) ? String(clientesPorId.get(h.clienteId)!.creadoEn).slice(0, 7) : "")))].sort();
      const cuando = rango.length === 1 ? rango[0] : `${rango[0]}…${rango.at(-1)}`;
      console.log(`    [${items[0].severidad.toUpperCase().padEnd(5)}] ${chequeo.padEnd(26)} ${String(items.length).padStart(4)}   (${cuando})`);
    }
  }

  // --- Listado ficha por ficha ---
  const fichas = armarFichas(hallazgos, clientesPorId, etiquetaOperador);
  console.log("\n" + "═".repeat(72));
  console.log("LISTADO DE FICHAS CON PROBLEMAS");
  console.log("═".repeat(72));
  console.log(`  ${fichas.length} fichas, agrupadas por gravedad y tipo de problema.\n`);
  const tope = mostrarTodos ? fichas.length : 40;
  let firmaPrevia = "";
  for (const [i, f] of fichas.slice(0, tope).entries()) {
    if (f.firma !== firmaPrevia) {
      console.log(`\n  ── ${f.hallazgos.map((h) => h.chequeo).join(" + ")} ──`);
      firmaPrevia = f.firma;
    }
    const datos = f.hallazgos.map((h) => `${h.campo}=${h.valor === "" ? "(vacío)" : h.valor}`).join(" · ");
    console.log(
      `  ${String(i + 1).padStart(4)}. ${f.cliente.patente.padEnd(17)} ${(f.cliente.nombre || "—").slice(0, 24).padEnd(24)} ${f.operador.slice(0, 14).padEnd(14)} ${String(f.cliente.creadoEn).slice(0, 10)}  ${datos}`
    );
  }
  if (fichas.length > tope) console.log(`\n  … y ${fichas.length - tope} fichas más (correr con --todos para verlas todas)`);

  if (csvPath) {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;

    // Segundo CSV, una fila por ficha: el de hallazgos sirve para contar y
    // filtrar por tipo de problema, este para repasar cliente por cliente sin
    // tener que ir juntando a mano las filas de una misma patente.
    const csvFichas = csvPath.replace(/\.csv$/i, "") + "-por-ficha.csv";
    const lineasFichas = [
      ["patente", "nombre", "operador", "creado_en", "telefono", "email", "vehiculo", "plan", "gravedad", "problemas", "datos_en_cuestion"].join(","),
      ...fichas.map((f) =>
        [
          f.cliente.patente,
          f.cliente.nombre,
          f.operador,
          String(f.cliente.creadoEn).slice(0, 10),
          f.cliente.telefono || "",
          f.cliente.email || "",
          f.cliente.vehiculo || "",
          f.cliente.plan || "",
          f.severidad,
          f.hallazgos.map((h) => h.chequeo).join(" | "),
          f.hallazgos.map((h) => `${h.campo}=${h.valor === "" ? "(vacío)" : h.valor}`).join(" | "),
        ]
          .map(esc)
          .join(",")
      ),
    ];
    writeFileSync(csvFichas, "﻿" + lineasFichas.join("\n"), "utf8");
    console.log(`\nCSV con las ${fichas.length} fichas escrito en ${csvFichas}`);

    const lineas = [
      ["cliente_id", "patente", "nombre", "operador", "creado_en", "campo", "valor", "chequeo", "severidad", "detalle"].join(","),
      ...hallazgos.map((h) => {
        const c = clientesPorId.get(h.clienteId);
        return [h.clienteId, h.patente, h.nombre, c ? etiquetaOperador(c) : "—", c ? String(c.creadoEn).slice(0, 10) : "—", h.campo, h.valor, h.chequeo, h.severidad, h.detalle]
          .map(esc)
          .join(",");
      }),
    ];
    // BOM: sin esto Excel abre el CSV en ANSI y rompe las tildes.
    writeFileSync(csvPath, "﻿" + lineas.join("\n"), "utf8");
    console.log(`\nCSV con los ${hallazgos.length} hallazgos escrito en ${csvPath}`);
  }

  if (htmlPath) {
    const rellenoHallazgos = hallazgos.filter((h) => h.chequeo === "email-relleno");
    const mesDe = (h: Hallazgo) => String(clientesPorId.get(h.clienteId)?.creadoEn || "").slice(0, 7);
    const mesesRelleno = [...new Set(rellenoHallazgos.map(mesDe))].filter(Boolean).sort();
    const rellenoPorOperador: Array<[string, Record<string, number>, number]> = [...agrupar(rellenoHallazgos, (h) => {
      const c = clientesPorId.get(h.clienteId);
      return c ? etiquetaOperador(c) : "—";
    }).entries()]
      .map(([op, items]) => {
        const porMes: Record<string, number> = {};
        for (const h of items) porMes[mesDe(h)] = (porMes[mesDe(h)] || 0) + 1;
        return [op, porMes, items.length] as [string, Record<string, number>, number];
      })
      .sort((a, b) => b[2] - a[2]);

    const html = renderInforme({
      fecha: ahora,
      totalClientes: filas.length,
      hallazgos,
      fichas,
      clientesConProblema: hallazgosPorCliente.size,
      sinTelefono: filas.filter((c) => !(c.telefono || "").trim()).length,
      sinEmail: filas.length - conEmailCargado.length,
      incontactables: filas.filter((c) => !(c.telefono || "").trim() && !(c.email || "").trim()).length,
      typosPorDominio,
      emailsDup,
      telsDup,
      compartidos,
      casiIguales: [...casiIguales.values()],
      envios: { total: enviosTotales.length, error: enviosError.length, desde: desdeEnvios },
      disparos: { total: disparosTotales.length, error: disparosError.length, desde: desdeDisparos, porCausa: causasDisparos },
      rechazados: rechazados.map((d) => ({
        patente: d.patente || "—",
        email: (d.clienteId ? clientesPorId.get(d.clienteId)?.email : "") || "(correo ya borrado)",
        fecha: String(d.creadoEn).slice(0, 10),
        error: d.error || "—",
      })),
      limpiezas: limpiezas.length,
      proyeccion: {
        conEmail: conEmailCargado.length,
        sinEmail: filas.length - conEmailCargado.length,
        noEnviables: noEnviables.length,
        relleno: conRelleno.length,
        typo: conTypo.length,
        perdidos: perdidos.size,
        sinCanal: clientesSinCanal.size,
      },
      operadores: resumen,
      mesesRelleno,
      rellenoPorOperador,
      desde30: hace30.toISOString().slice(0, 10),
    });
    writeFileSync(htmlPath, html, "utf8");
    console.log(`\nInforme HTML escrito en ${htmlPath}`);
    console.log("Para el PDF: chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=<salida.pdf> <ruta html>");
  }

  console.log("\nSolo lectura: no se modificó ningún dato.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
