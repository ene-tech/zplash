// Reglas de calidad de datos de la tabla `clientes`: qué se considera un dato
// mal cargado y por qué. Vive acá y no dentro de un script porque la usan dos
// procesos que TIENEN que coincidir — si la auditoría marca un correo como
// relleno y la limpieza usa otro criterio, se borra lo que no correspondía:
//
//   - scripts/auditar-datos-clientes.ts  (diagnóstico, solo lectura)
//   - scripts/limpiar-datos-clientes.ts  (corrige y borra, con auditoría)
//
// No está en src/lib/helpers a propósito: son criterios de saneamiento de
// datos históricos, no reglas de negocio que la app aplique en caliente (las
// de la app son isValidTelefono/isValidEmail/esEmailEnviable en
// @/lib/helpers/validadores, que esto reusa).

import type { clientes } from "@/db/schema";
import { esEmailEnviable, formatTelefono, isValidEmail, isValidPatente, isValidRut, limpiarRut, normPlate, PLANES } from "@/lib/helpers";

export { formatTelefono, normPlate };

export type Cliente = typeof clientes.$inferSelect;

export type Severidad = "alta" | "media" | "baja";

export type Hallazgo = {
  clienteId: string;
  patente: string;
  nombre: string;
  campo: string;
  valor: string;
  chequeo: string;
  severidad: Severidad;
  detalle: string;
};

// Texto comparable: minúsculas, sin tildes y sin nada que no sea a-z0-9. Así
// "No Quiere Dar Mail", "no-quiere-darmail" y "NOQUIEREDARMAIL@gmail.com"
// colapsan al mismo token y un solo patrón los agarra a todos.
export function tokenizar(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Frases de relleno: son inequívocas, así que se buscan como substring del
// token completo. Ninguna aparece por casualidad dentro de un dato real, y
// tienen que matchear pegadas a cualquier cosa ("noquieredarcorreo@gmail.com",
// "noquiere@darcorreo.gmsil.com"). "quieredar" cubre también los tipeos con
// la primera letra cambiada ("moquieredarcorrw@...").
export const RELLENO_FRASE = [
  "noquiere",
  "quieredar",
  "darcorreo",
  "noquiso",
  "nodamail",
  "nodacorreo",
  "nomail",
  "nocorreo",
  "sinmail",
  "sincorreo",
  "sinemail",
  "sindato",
  "sintelefono",
  "sinfono",
  "sinnumero",
  "notiene",
  "noaplica",
  "noinforma",
  "nosabe",
  "consumidorfinal",
];

// Palabras cortas y ambiguas: existen dentro de datos reales por pura
// casualidad ("teleservise" contiene "test", "nadiela" contiene "nadie",
// "jcarstestoro" contiene "test"), así que NO se buscan como substring sino
// como segmento completo del valor — separando por puntos, guiones y espacios,
// y descartando los dígitos del final para que "invitado23" siga cayendo.
export const RELLENO_PALABRA = ["nadie", "ninguno", "desconocido", "pendiente", "prueba", "test", "asdf", "qwerty", "xxxx", "aaaa", "generico", "anonimo"];

// Rellenos que solo aplican al email: como nombre son datos legítimos del
// negocio ("Invitado" es como se registra al que pasa una sola vez), pero como
// dirección de correo son buzones inventados o el correo interno del local
// puesto para poder guardar la ficha.
// Raíces cortas, no palabras completas: el mismo relleno vuelve con tipeos y
// abreviaciones ("notienw@", "noselosabe@", "invitado.co@") y la raíz los cubre
// sin ir agregándolos de a uno. Solo se buscan en la parte local del correo.
export const RELLENO_EMAIL_FRASE = [
  "invit",
  "notien",
  "nosab",
  "noselo",
  "limpiezaxx",
  "limpiezacompleta",
  "lavadoxx",
  "lavadotunel",
  "pasadotunel",
  "pasadatunel",
];
export const RELLENO_EMAIL_PALABRA = ["invitado"];

// El dominio del propio negocio en la ficha de un cliente significa que el
// operador puso el correo del local para poder guardar: lo que se le mande al
// cliente le llega al local.
export const DOMINIO_PROPIO = "zplash.cl";

export function segmentos(v: string): string[] {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .map((s) => s.replace(/\d+$/, ""))
    .filter(Boolean);
}

export function pareceRelleno(v: string, campo: "email" | "otro" = "otro"): string | null {
  const t = tokenizar(v);
  if (!t) return null;
  const frases = campo === "email" ? [...RELLENO_FRASE, ...RELLENO_EMAIL_FRASE] : RELLENO_FRASE;
  // En un correo se busca por separado en la parte local y en el dominio, no
  // en la concatenación: pegados, "bruno@mail.com" contiene "nomail" y
  // "cortes@teleservise.cl" contenía "test" a caballo entre los dos lados.
  const partes = campo === "email" && v.includes("@") ? [tokenizar(v.slice(0, v.lastIndexOf("@"))), tokenizar(v.slice(v.lastIndexOf("@") + 1))] : [t];
  const frase = frases.find((p) => partes.some((parte) => parte.includes(p)));
  if (frase) return frase;
  // En un correo, la palabra suelta solo cuenta si está en la parte local: el
  // dominio de una dirección real puede contenerla sin que eso diga nada del
  // dato (juan.cortes@teleservise.cl no es un correo de prueba).
  const base = campo === "email" && v.includes("@") ? v.slice(0, v.lastIndexOf("@")) : v;
  const segs = new Set(segmentos(base));
  const palabras = campo === "email" ? [...RELLENO_PALABRA, ...RELLENO_EMAIL_PALABRA] : RELLENO_PALABRA;
  return palabras.find((p) => segs.has(p)) || null;
}

// Dominios mal escritos que se repiten en cargas manuales. La clave es lo que
// vino, el valor lo que casi seguro se quiso escribir — sirve para que el
// operador confirme la dirección en vez de pedirla de cero.
export const DOMINIOS_TYPO: Record<string, string> = {
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cl": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.comm": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmsil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.es": "gmail.com",
  "gmail.copm": "gmail.com",
  "gmaill.com": "gmail.com",
  "gemail.com": "gmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmail.cm": "hotmail.com",
  "hotmail.om": "hotmail.com",
  "hormail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yahoo.con": "yahoo.com",
  "yaho.com": "yahoo.com",
  "icloud.con": "icloud.com",
  "live.con": "live.com",
};

// Dominios que sí existen y concentran casi todo el correo personal en Chile.
// Cualquier dominio a un solo carácter de distancia de uno de estos (gmsil,
// gamil, hotmial) es un typo, no un proveedor real — atraparlos por distancia
// evita tener que enumerarlos todos en el mapa de arriba.
export const DOMINIOS_COMUNES = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "yahoo.es", "hotmail.es", "me.com", "mail.com"];

export function sugerirDominio(dominio: string): string | null {
  if (!dominio || DOMINIOS_COMUNES.includes(dominio)) return null;
  if (DOMINIOS_TYPO[dominio]) return DOMINIOS_TYPO[dominio];
  return DOMINIOS_COMUNES.find((d) => distanciaUno(dominio, d)) || null;
}

// RUTs "de relleno" que pasan el formato pero no son de nadie.
export const RUTS_FALSOS = new Set(["111111111", "11111111", "123456785", "123456789", "19", "10", "00", "222222222", "999999999"]);

export function digitos(v: string): string {
  return v.replace(/\D/g, "");
}

export function esSecuencia(d: string): boolean {
  if (d.length < 6) return false;
  let sube = true;
  let baja = true;
  for (let i = 1; i < d.length; i++) {
    if (Number(d[i]) !== Number(d[i - 1]) + 1) sube = false;
    if (Number(d[i]) !== Number(d[i - 1]) - 1) baja = false;
  }
  return sube || baja;
}

// OJO: se evalúa el CUERPO de 8 dígitos (lo que va después de +569), no la
// cadena completa. Sobre la cadena completa el "9" del prefijo se suma a la
// racha y +56999997710 parece tener cinco nueves cuando en el cuerpo hay
// cuatro.
export function cuerpoTelefono(tel: string | null | undefined): string {
  const t = formatTelefono(tel);
  return /^\+569\d{8}$/.test(t) ? t.slice(4) : "";
}

export function rachaMaxima(cuerpo: string): number {
  let max = 0;
  let actual = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    actual = i > 0 && cuerpo[i] === cuerpo[i - 1] ? actual + 1 : 1;
    max = Math.max(max, actual);
  }
  return max;
}

export function tieneRepeticionSospechosa(d: string): boolean {
  return /(\d)\1{4,}/.test(d);
}

/**
 * ¿El número es inventado, sospechoso o normal? Distinguirlos importa porque
 * el inventado se borra y el sospechoso no: 00000000 o 99999999 no son de
 * nadie, pero +569 6300 0008 (cinco ceros en medio de un cuerpo con cuatro
 * dígitos distintos) es un celular perfectamente posible, y de hecho dos
 * operadores distintos lo cargaron para la misma persona en días distintos.
 *
 * "inventado" exige poca variedad de dígitos, no una racha larga:
 *  - 2 o menos dígitos distintos en el cuerpo (00000000, 11111111, 87878787)
 *  - 3 distintos con una racha de 5 o más (99999397)
 *  - 3 distintos cuando además el nombre o el correo de esa misma ficha son de
 *    relleno (87878686 en la ficha "NO QUIERE"): el relleno de un campo
 *    confirma el del otro.
 */
export function calidadTelefono(cuerpo: string, fichaConRelleno: boolean): "inventado" | "sospechoso" | "ok" {
  if (!cuerpo) return "ok";
  const distintos = new Set(cuerpo).size;
  const racha = rachaMaxima(cuerpo);
  if (distintos <= 2) return "inventado";
  if (distintos === 3 && (racha >= 5 || fichaConRelleno)) return "inventado";
  if (distintos <= 3 || racha >= 4) return "sospechoso";
  return "ok";
}

// Quita tildes y ñ dejando el resto igual: "andrés.arredondo" →
// "andres.arredondo". Sirve para proponer la dirección que el cliente
// seguramente tiene de verdad, porque ningún proveedor transaccional entrega
// a una dirección con caracteres no-ASCII.
export function transliterar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N");
}

// Dígito verificador del RUT (módulo 11). isValidRut solo mira el formato —
// para saneamiento de datos históricos interesa además si el número existe.
export function dvCorrecto(rutLimpio: string): boolean {
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1).toUpperCase();
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

// Nombres que son un marcador y no una persona. "Invitado" es legítimo para
// el que pasa una sola vez, así que solo se reporta cuando el cliente tiene
// plan vigente: a un abonado se le manda correo y se le habla por su nombre.
const NOMBRES_PLACEHOLDER = new Set(["invitado", "invitada", "cliente", "clienteweb", "clientesinnombre", "sinnombre", "nn", "sn"]);

export const ANIO_MIN = 2015;

export function revisarCliente(c: Cliente, ahora: Date): Hallazgo[] {
  const out: Hallazgo[] = [];
  const add = (campo: string, valor: string, chequeo: string, severidad: Severidad, detalle: string) =>
    out.push({ clienteId: c.id, patente: c.patente, nombre: c.nombre, campo, valor, chequeo, severidad, detalle });

  // Un campo de relleno hace más creíble que otro campo dudoso de la MISMA
  // ficha también lo sea: quien escribió "NO QUIERE DAR NOMBRE" no se tomó el
  // trabajo de pedir el teléfono real.
  const fichaConRelleno = Boolean(pareceRelleno(c.nombre) || (c.email && pareceRelleno(c.email, "email")));

  // --- Teléfono ---
  const tel = (c.telefono || "").trim();
  if (tel) {
    const d = digitos(tel);
    const relleno = pareceRelleno(tel);
    const normalizado = formatTelefono(tel);
    if (!d) {
      add("telefono", tel, "telefono-sin-digitos", "alta", "No contiene ningún dígito; es texto, no un teléfono");
    } else if (relleno) {
      add("telefono", tel, "telefono-relleno", "alta", `Texto de relleno detectado ("${relleno}")`);
    } else if (calidadTelefono(cuerpoTelefono(tel), fichaConRelleno) === "inventado") {
      const cuerpo = cuerpoTelefono(tel);
      add("telefono", tel, "telefono-inventado", "alta", `El cuerpo del número usa solo ${new Set(cuerpo).size} dígitos distintos (${cuerpo}): no es de nadie`);
    } else if (calidadTelefono(cuerpoTelefono(tel), fichaConRelleno) === "sospechoso") {
      add("telefono", tel, "telefono-sospechoso", "media", "Muy poca variedad de dígitos o una racha larga: puede ser real, hay que confirmarlo con el cliente antes de borrarlo");
    } else if (esSecuencia(d)) {
      add("telefono", tel, "telefono-secuencia", "alta", "Dígitos consecutivos (12345678): número inventado");
    } else if (!/^\+569\d{8}$/.test(normalizado)) {
      const motivo = d.length < 8 ? `solo ${d.length} dígitos` : d.length > 11 ? `${d.length} dígitos (de más)` : "no calza con el formato de celular chileno";
      add("telefono", tel, "telefono-invalido", "media", `No se puede normalizar a +569XXXXXXXX: ${motivo}`);
    } else if (normalizado !== tel) {
      add("telefono", tel, "telefono-sin-normalizar", "baja", `Guardado sin formato canónico; debería quedar como ${normalizado}`);
    }
  }

  // --- Email ---
  const email = (c.email || "").trim();
  if (email) {
    const relleno = pareceRelleno(email, "email");
    const dominio = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (!email.includes("@")) {
      add("email", email, "email-sin-arroba", "alta", "No tiene @: no es una dirección de correo");
    } else if (dominio === DOMINIO_PROPIO) {
      add("email", email, "email-del-local", "alta", "Es una casilla del propio negocio, no del cliente");
    } else if (relleno) {
      add("email", email, "email-relleno", "alta", `Texto de relleno detectado ("${relleno}")`);
    } else if (!isValidEmail(email)) {
      add("email", email, "email-invalido", "alta", "No pasa la validación de formato (falta dominio, espacios, doble @)");
    } else if (/^(.)\1*$/.test(email.slice(0, email.lastIndexOf("@"))) || email.lastIndexOf("@") <= 1) {
      // "aaa@gmail.com", "xxx@gmail.com", "a@gmail.com": pasan el formato y el
      // dominio es real, pero la parte local es un solo carácter repetido —
      // nadie tiene una dirección así, es relleno igual que "noquiere@".
      add("email", email, "email-local-absurdo", "alta", "La parte local es un solo carácter repetido: dirección inventada");
    } else if (/[^\x20-\x7E]/.test(email) && !/[^\x20-\x7E]$/.test(email.slice(0, email.lastIndexOf("@")))) {
      // Tildes o ñ EN MEDIO de la dirección: el proveedor la rebota siempre,
      // pero la casilla del cliente existe y es la misma sin el acento
      // (andrés.arredondo@ → andres.arredondo@). Se propone la versión
      // transliterada en vez de borrarla; si igual rebota, el motor de correo
      // la borra solo (ver limpiarEmailCliente). Distinto es cuando el
      // carácter raro está al FINAL de la parte local ("b2003danieñ@"): ahí no
      // es un acento mal tipeado sino otra letra, y adivinar no corresponde.
      add("email", email, "email-tildes", "media", `Tildes/ñ: inentregable como está, casi seguro es ${transliterar(email)}`);
    } else if (!esEmailEnviable(email)) {
      const motivo = /[^\x20-\x7E]/.test(email) ? "carácter no-ASCII al final de la parte local: es un tipeo, no un acento" : "punto al inicio/final de la parte local o dos puntos seguidos";
      add("email", email, "email-no-enviable", "alta", `Pasa el formato pero es inentregable: ${motivo}`);
    } else if (sugerirDominio(dominio)) {
      add("email", email, "email-dominio-typo", "media", `Dominio mal escrito; casi seguro es @${sugerirDominio(dominio)}`);
    } else if (!dominio.includes(".") || dominio.endsWith(".")) {
      add("email", email, "email-dominio-raro", "media", "El dominio no tiene una extensión válida");
    } else if (email !== email.toLowerCase()) {
      add("email", email, "email-mayusculas", "baja", "Guardado con mayúsculas; conviene normalizar a minúsculas para no duplicar clientes");
    }
  }

  // --- Nombre ---
  const nombre = (c.nombre || "").trim();
  const relleno = pareceRelleno(nombre);
  if (!nombre || nombre.toLowerCase() === "sin nombre") {
    add("nombre", c.nombre, "nombre-vacio", "media", "Sin nombre real (queda así cuando la carga por Excel no traía el dato)");
  } else if (relleno) {
    add("nombre", nombre, "nombre-relleno", "media", `Texto de relleno detectado ("${relleno}")`);
  } else if (normPlate(nombre) === normPlate(c.patente)) {
    add("nombre", nombre, "nombre-es-patente", "media", "El nombre es la patente repetida");
  } else if (nombre.length < 3) {
    add("nombre", nombre, "nombre-corto", "baja", "Menos de 3 caracteres");
  } else if (!/[a-záéíóúñ]/i.test(nombre)) {
    add("nombre", nombre, "nombre-sin-letras", "media", "No contiene letras");
  } else if (NOMBRES_PLACEHOLDER.has(tokenizar(nombre)) && c.vencimiento && new Date(c.vencimiento) > ahora) {
    // "Invitado" está bien para el que pasa una vez, pero este tiene plan
    // vigente: se le cobra todos los meses y se le manda correo empezando por
    // "Hola Invitado".
    add("nombre", nombre, "nombre-placeholder-abonado", "alta", "Cliente con plan vigente registrado con un nombre genérico");
  }

  // --- Patente ---
  // "SIN-PATENTE-<idPedido>" no es un dato mal cargado sino el marcador que
  // pone el webhook de WooCommerce cuando el pedido no trae patente (ver
  // /api/webhooks/woocommerce). Igual hay que arreglarlo —el cliente pagó y
  // no puede entrar porque el escaneo busca por patente— pero se separa del
  // resto para no mezclarlo con las patentes tipeadas mal.
  // El marcador viene en dos formas: "SIN-PATENTE-<idPedido>" del webhook y el
  // placeholder del formulario web ("INGRESA TU PATENTE") que quedó grabado
  // como patente en la migración. Ambas son fichas c-wc-*.
  const esMarcadorWoo = /^SIN-PATENTE-/i.test(c.patente) || (c.id.startsWith("c-wc-") && !/\d/.test(normPlate(c.patente)));
  if (esMarcadorWoo) {
    // La gravedad depende de si hay alguien esperando entrar: con el plan
    // vencido hace más de un año es una ficha histórica sobre la que no hay
    // nada que hacer, no un cliente bloqueado en la entrada.
    const vigente = Boolean(c.vencimiento && new Date(c.vencimiento) > ahora);
    add(
      "patente",
      c.patente,
      "patente-pendiente-woo",
      vigente ? "alta" : "baja",
      vigente
        ? "Compró por la web sin declarar patente y su plan está vigente: no lo puede escanear el operador hasta que la cargue"
        : "Compra web sin patente, con el plan ya vencido: registro histórico de la migración, sin acción posible"
    );
  } else if (!isValidPatente(c.patente)) {
    add("patente", c.patente, "patente-invalida", "alta", "No calza con el formato chileno (AB1234 o ABCD12)");
  }

  // --- RUT y datos de factura ---
  const rut = (c.rut || "").trim();
  if (rut) {
    if (RUTS_FALSOS.has(limpiarRut(rut))) {
      add("rut", rut, "rut-falso", "alta", "RUT de relleno conocido (11111111-1, 12345678-5, 1-9…)");
    } else if (!isValidRut(rut)) {
      add("rut", rut, "rut-invalido", "media", "No calza con el formato 12.345.678-9");
    } else if (!dvCorrecto(limpiarRut(rut))) {
      // El formato está bien pero el número no existe: con este RUT el SII
      // rechaza la factura.
      add("rut", rut, "rut-dv-invalido", "media", "El dígito verificador no corresponde al número: el SII va a rechazar la factura");
    }
  }
  if ((c.tipoDocumento || "").toLowerCase() === "factura") {
    if (!rut) add("rut", "", "factura-sin-rut", "alta", "Cliente marcado para Factura pero sin RUT");
    if (!(c.razonSocial || "").trim()) add("razonSocial", "", "factura-sin-razon-social", "media", "Cliente marcado para Factura pero sin razón social");
    if (!(c.giro || "").trim()) add("giro", "", "factura-sin-giro", "baja", "Cliente marcado para Factura pero sin giro");
    if (!(c.direccion || "").trim()) add("direccion", "", "factura-sin-direccion", "baja", "Cliente marcado para Factura pero sin dirección");
  }

  // --- Vehículo ---
  const vehiculo = (c.vehiculo || "").trim();
  if (vehiculo) {
    const rellenoVeh = pareceRelleno(vehiculo);
    if (rellenoVeh) add("vehiculo", vehiculo, "vehiculo-relleno", "baja", `Texto de relleno detectado ("${rellenoVeh}")`);
    else if (vehiculo.length > 60) add("vehiculo", vehiculo.slice(0, 60) + "…", "vehiculo-largo", "baja", `${vehiculo.length} caracteres: probablemente se pegó texto de más`);
  }

  // --- Plan ---
  const plan = (c.plan || "").trim();
  if (plan && !PLANES.includes(plan)) {
    add("plan", plan, "plan-desconocido", "media", `No está en el catálogo de planes (${PLANES.join(", ")})`);
  }

  // --- Fechas ---
  const fechas: Array<[string, Date | null]> = [
    ["vencimiento", c.vencimiento ? new Date(c.vencimiento) : null],
    ["fechaContratacion", c.fechaContratacion ? new Date(c.fechaContratacion) : null],
    ["ultimaVisita", c.ultimaVisita ? new Date(c.ultimaVisita) : null],
    ["ultimaRenovacion", c.ultimaRenovacion ? new Date(c.ultimaRenovacion) : null],
  ];
  for (const [campo, fecha] of fechas) {
    if (!fecha) continue;
    if (Number.isNaN(fecha.getTime())) {
      add(campo, String((c as unknown as Record<string, unknown>)[campo]), "fecha-invalida", "alta", "Fecha ilegible");
      continue;
    }
    const anio = fecha.getUTCFullYear();
    if (anio < ANIO_MIN) add(campo, fecha.toISOString().slice(0, 10), "fecha-antigua", "media", `Año ${anio}: anterior a que existiera el negocio`);
    // El vencimiento sí puede estar en el futuro (es su naturaleza); el resto no.
    else if (campo !== "vencimiento" && fecha.getTime() > ahora.getTime() + 86_400_000) {
      add(campo, fecha.toISOString().slice(0, 10), "fecha-futura", "media", "Fecha en el futuro para un campo que registra algo ya ocurrido");
    } else if (campo === "vencimiento" && anio > ahora.getUTCFullYear() + 3) {
      add(campo, fecha.toISOString().slice(0, 10), "fecha-futura", "media", `Vence en ${anio}: más de 3 años adelante`);
    }
  }
  if (c.ultimaVisita && c.visitas === 0) {
    add("visitas", "0", "visitas-inconsistente", "baja", "Tiene última visita registrada pero el contador de visitas está en 0");
  }

  return out;
}

// ¿Difieren en exactamente un carácter (sustitución) o en uno de más
// (inserción)? Levenshtein completo sería de más: acá solo interesa el typo
// de un dedo al tipear una patente de 6 caracteres.
export function distanciaUno(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  if (a.length === b.length) {
    let dif = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dif++;
    return dif === 1;
  }
  if (Math.abs(a.length - b.length) !== 1) return false;
  const corta = a.length < b.length ? a : b;
  const larga = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let saltos = 0;
  while (i < corta.length && j < larga.length) {
    if (corta[i] === larga[j]) i++;
    else if (++saltos > 1) return false;
    j++;
  }
  return true;
}
