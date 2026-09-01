import type { Cliente, Cupon } from "@/types";
import { findClient } from "./clientes";
import { fmtCLP } from "./precios";
import { limpiarRut, normPlate } from "./validadores";

/** Alfabeto sin 0/O ni 1/I para evitar confusiones al leer o tipear el código. */
const ALFABETO_CUPON = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// getRandomValues y no Math.random(): un código de cupón es canjeable por un
// lavado (ver canjearCupon), así que vale plata. Math.random() en V8 es
// xorshift128+ — observando unos pocos códigos emitidos se puede reconstruir
// su estado y predecir los siguientes, y los lotes de Pack Empresa se emiten
// justamente de a decenas seguidas. Web Crypto y no crypto.randomInt de Node
// porque este módulo entra en el barrel de @/lib/helpers, que también se
// importa desde componentes del navegador.
//
// El alfabeto tiene 32 caracteres y 256 % 32 === 0, así que `byte % 32` no
// introduce sesgo (con un largo que no divida a 256 habría que descartar los
// bytes del último tramo incompleto en vez de tomar el módulo).
export function generarCodigoCupon(existentes: Set<string>): string {
  let codigo: string;
  do {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    codigo = Array.from(bytes, (b) => ALFABETO_CUPON[b % ALFABETO_CUPON.length]).join("");
  } while (existentes.has(codigo));
  return codigo;
}

/** true si esta patente ya gastó el descuento. Un descuento normal es de un
 * solo uso global (`usado`); uno de "un uso por patente" (promo abierta que
 * circula pública) sigue vivo hasta caducar y lleva en `patentesUsadas` las
 * que ya lo canjearon. */
export function descuentoGastadoPor(cupon: Pick<Cupon, "usado" | "unUsoPorPatente" | "patentesUsadas">, patente: string): boolean {
  if (!cupon.unUsoPorPatente) return cupon.usado;
  const p = normPlate(patente);
  return (cupon.patentesUsadas || []).some((x) => normPlate(x) === p);
}

/** true si el descuento se puede cobrar por este canal. Un cupón sin `canal`
 * (los emitidos antes del campo) o con "ambos" vale en los dos, así que el
 * default nunca restringe nada que hoy funcione.
 *
 * Único lugar donde se decide: lo consultan las DOS puertas por las que entra
 * un descuento a un cobro — resolverDescuento (código tipeado en el mesón) y
 * cuponDescuentoDePatente (el que se aplica solo con leer la patente, tanto en
 * el mesón como en los cobros web). */
export function cuponValeEnCanal(cupon: Pick<Cupon, "canal">, canal: "web" | "local"): boolean {
  return !cupon.canal || cupon.canal === "ambos" || cupon.canal === canal;
}

/** Valida un código de descuento (tipo "descuento") para una patente dada, antes de aplicarlo a una venta.
 * Si el cupón no tiene patenteAsignada, es "abierto": lo puede usar cualquier patente.
 *
 * `clientes` va obligatorio (y no con default `[]`) a propósito: es lo que
 * decide la restricción "solo clientes nuevos", y una lista vacía por omisión
 * la apagaría en silencio justo donde se calcula un precio a cobrar. */
export function resolverDescuento(
  codigoCrudo: string,
  patente: string,
  cupones: Cupon[],
  clientes: Cliente[]
): { ok: true; cupon: Cupon } | { ok: false; msg: string } {
  const codigo = codigoCrudo.trim().toUpperCase();
  const cupon = cupones.find((c) => c.codigo === codigo);
  if (!cupon) return { ok: false, msg: "Código de descuento no encontrado" };
  if (cupon.tipo !== "descuento") return { ok: false, msg: "Este código no es un descuento válido" };
  if (descuentoGastadoPor(cupon, patente)) {
    return { ok: false, msg: cupon.unUsoPorPatente ? "Esta patente ya usó este descuento" : "Este descuento ya fue usado" };
  }
  if (new Date(cupon.fechaCaducidad) < new Date()) return { ok: false, msg: "Este descuento está caducado" };
  if (cupon.patenteAsignada && cupon.patenteAsignada !== patente) {
    return { ok: false, msg: "Este descuento fue asignado a otra patente" };
  }
  // El canal va fijo en "local": los tres caminos que llaman acá son del
  // perfil operador (mesón). La web nunca pide tipear un código — aplica el
  // descuento por patente vía cuponDescuentoDePatente, que filtra por su
  // cuenta.
  if (!cuponValeEnCanal(cupon, "local")) {
    return { ok: false, msg: "Este descuento es solo para pagos por la web" };
  }
  // "Cliente nuevo" = patente sin ficha, la misma definición que usa el
  // descuento de bienvenida (/api/cliente/descuento-bienvenida): es lo único
  // que el mesón puede verificar con el auto delante.
  if (cupon.soloClientesNuevos && findClient(clientes, patente)) {
    return { ok: false, msg: "Este descuento es solo para clientes nuevos" };
  }
  return { ok: true, cupon };
}

/** Quema el descuento para esta patente. Único lugar donde se decide CÓMO se
 * quema, porque son dos formas distintas: el descuento normal muere entero
 * (`usado`), y el de "un uso por patente" solo suma la patente a la lista y
 * sigue vigente para el resto.
 *
 * ponytail: la lista se reescribe entera en el commit del mesón, así que dos
 * cajas cobrando el MISMO código en el mismo instante pueden pisarse y perder
 * un uso (la segunda patente podría volver a canjearlo). Misma ventana que ya
 * tiene `usado` hoy y son segundos de riesgo con un solo mesón; si algún día
 * hay varias cajas en paralelo, el append va server-side en SQL
 * (`patentes_usadas || to_jsonb(patente)` con el NOT @> en el WHERE, igual que
 * el `usado = false` de consumirCupon). */
export function marcarDescuentoUsado(cupon: Cupon, patente: string, operador: string | undefined, ahora: string): Cupon {
  const p = normPlate(patente);
  if (cupon.unUsoPorPatente) {
    return { ...cupon, patentesUsadas: [...(cupon.patentesUsadas || []), p] };
  }
  return { ...cupon, usado: true, patenteUso: p, fechaUso: ahora, operadorUso: operador || "" };
}

/** Monto a descontar del precio base: si el cupón es de porcentaje, se calcula sobre precioBase; si no, es el monto fijo.
 * Recibe solo los dos campos que usa (no el Cupon completo) para que también sirva sobre un cupón que aún no
 * existe en BD — ver montoDescuento/montoAPagar en construirVariables (@/lib/whatsapp/reglas/motor). */
export function montoDescuento(cupon: Pick<Cupon, "esPorcentaje" | "valor">, precioBase: number): number {
  return cupon.esPorcentaje ? Math.round((precioBase * cupon.valor) / 100) : cupon.valor;
}

/** Cupón "descuento" sin usar, vigente y atado a esta patente: el que se aplica
 * con solo leer la patente, sin que nadie tipee un código. Si hay varios, el
 * que vence antes (si no, un cupón lejano tapa a uno que caduca mañana).
 *
 * Mismo criterio en los cuatro sitios que lo cobran — mesón (sobre `data.cupones`
 * ya cargado) y los tres caminos de cobro web, que primero lo buscan en la base
 * (ver buscarCuponDescuentoPlan en @/lib/pagos). `canal` va obligatorio (y no
 * con default) justo porque son esos dos mundos: un default dejaría pasar en
 * silencio un descuento "solo local" a un cobro por web. */
export function cuponDescuentoDePatente(
  lista: Cupon[],
  patente: string,
  canal: "web" | "local",
  ahora: Date = new Date()
): Cupon | undefined {
  return lista
    .filter(
      (c) =>
        c.tipo === "descuento" &&
        !c.usado &&
        c.patenteAsignada === patente &&
        new Date(c.fechaCaducidad) > ahora &&
        cuponValeEnCanal(c, canal)
    )
    .sort((a, b) => new Date(a.fechaCaducidad).getTime() - new Date(b.fechaCaducidad).getTime())[0];
}

/** Todos los códigos vivos de un cliente, del más nuevo al más viejo: los
 * descuentos atados a su patente, los tickets ("vale") cuyo lote la autoriza
 * —los dos que emite el atajo "Entregar cupón" de la ficha de cliente— y los
 * de un Pack Empresa comprado con su correo o su RUT, que no traen patente y
 * hasta ahora solo se veían en el portal ("Mis tickets y cupones", ver
 * cuponesDeLaCuenta en /api/cliente/mi-cuenta). El correo también ata los
 * códigos que el propio cliente sumó desde el portal (ver /agregar-cupon).
 *
 * Un "vale" SIN patentes, correo ni RUT es un lote abierto (cualquiera lo
 * canjea, ver patenteAutorizadaParaCupon): no es de este cliente y no se
 * muestra en su ficha, si no cada ficha listaría el pack empresa entero. */
export function cuponesVigentesDeCliente(
  lista: Cupon[],
  cliente: Pick<Cliente, "patente" | "email" | "rut">,
  ahora: Date = new Date()
): Cupon[] {
  const p = normPlate(cliente.patente);
  const email = (cliente.email || "").trim().toLowerCase();
  const rut = limpiarRut(cliente.rut);
  return lista
    .filter(
      (c) =>
        !c.usado &&
        new Date(c.fechaCaducidad) > ahora &&
        (normPlate(c.patenteAsignada || "") === p ||
          (c.tipo === "vale" && !!c.patentesAutorizadas?.length && patenteAutorizadaParaCupon(c, p)) ||
          (!!email && (c.email || "").trim().toLowerCase() === email) ||
          (!!rut && limpiarRut(c.rut) === rut))
    )
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
}

/** Precio final tras aplicar el cupón (nunca baja de $0). Se usa tanto para
 * PINTAR el precio como para COBRARLO, en el mesón y en la web: la pantalla no
 * puede anunciar un monto distinto del que se termina cobrando (mismo principio
 * que documenta /api/pagos/estado).
 *
 * ponytail: si el descuento cubre el total el precio queda en $0 — el mesón lo
 * soporta (no pide método de pago), pero Webpay/Oneclick no pueden cobrar $0 y
 * el pago se rechaza con "El monto a cobrar debe ser mayor a $0". Con los
 * montos reales (descuentos de $2.000-$3.000 contra planes de $20.000+) no
 * pasa; si algún día se emiten cupones de 100%, hay que decidir ahí si el plan
 * se entrega sin pasar por Transbank. */
export function precioConCupon(precio: number, cupon: Pick<Cupon, "esPorcentaje" | "valor"> | undefined | null): number {
  if (!cupon) return precio;
  return Math.max(0, precio - montoDescuento(cupon, precio));
}

/** true si la patente puede canjear este cupón: los cupones tipo "vale" de un
 * pack empresa pueden traer una lista de patentes autorizadas (la flota para
 * la que se contrató el lote); sin lista (vacía/undefined) el cupón queda
 * abierto, cualquier patente puede canjearlo (comportamiento original). */
export function patenteAutorizadaParaCupon(cupon: Pick<Cupon, "patentesAutorizadas">, patente: string): boolean {
  if (!cupon.patentesAutorizadas || cupon.patentesAutorizadas.length === 0) return true;
  return cupon.patentesAutorizadas.includes(normPlate(patente));
}

/** Regla "un cupón por patente" del lote (packs de cortesía, canjes de un
 * evento publicitario): cada patente puede canjear un solo cupón del lote,
 * para que la promoción llegue a clientes distintos en vez de que un mismo
 * auto la queme entera. Devuelve el cupón del lote que esa patente ya canjeó
 * — quien llama lo usa para mostrarle el código al operador — o undefined si
 * puede canjear.
 *
 * El lote se identifica por `nombreLote` (la misma agrupación que ve el admin
 * en B2B/Tickets, no hay id de lote) y se cruzan solo cupones que también
 * llevan la regla: así dos lotes homónimos sin ella —ej. los "WhatsApp -
 * Primera vez" del bot, que comparten nombre entre todos los clientes— nunca
 * bloquean un canje. Dos lotes con el mismo nombre y ambos con la regla sí
 * cuentan como uno solo, que es lo esperable si se repite la misma promo. */
export function cuponDelLoteUsadoPorPatente(
  cupon: Pick<Cupon, "id" | "nombreLote" | "unCuponPorPatente">,
  patente: string,
  cupones: Cupon[]
): Cupon | undefined {
  if (!cupon.unCuponPorPatente) return undefined;
  const p = normPlate(patente);
  return cupones.find(
    (c) => c.id !== cupon.id && c.unCuponPorPatente && c.nombreLote === cupon.nombreLote && c.usado && normPlate(c.patenteUso || "") === p
  );
}

/** Qué gana quien tiene el cupón, dicho en sus términos: lo usa el Portal
 * Cliente ("Mis tickets y cupones") y el operador al validar un código a mano.
 * Distinto de valorCupon (@/components/tabs/ventaEmpresa/useCuponesList), que
 * es la vista del admin y muestra lo que costó el cupón: un "vale" de un pack
 * pagado sigue siendo un lavado gratis para quien lo canjea. */
export function beneficioCupon(c: Pick<Cupon, "tipo" | "valor" | "esPorcentaje">): string {
  if (c.tipo !== "descuento") return "Lavado gratis";
  return c.esPorcentaje ? `${c.valor}% de descuento` : `${fmtCLP(c.valor)} de descuento`;
}

export type EstadoCupon = { label: string; cls: "ok" | "warn" | "bad" };

/** Estado a mostrar de un cupón: usado, caducado o disponible — compartido
 * entre el panel admin (VentaEmpresaTab) y la consulta pública de tickets por
 * RUT (/api/empresa/tickets), para no duplicar el criterio en ambos lados. */
export function estadoCupon(c: Pick<Cupon, "usado" | "fechaCaducidad">): EstadoCupon {
  if (c.usado) return { label: "Usado", cls: "ok" };
  if (new Date(c.fechaCaducidad) < new Date()) return { label: "Caducado", cls: "bad" };
  return { label: "Disponible", cls: "warn" };
}

/** Separa un texto de patentes por coma, espacio o salto de línea — se usa
 * tanto en la compra web de Packs Empresa como en el generador manual de
 * cupones del admin (B2B/Tickets), para que el cliente/admin pueda pegarlas
 * de un Excel o escribirlas una por línea. */
export function parsearPatentes(texto: string): string[] {
  return texto
    .split(/[\s,;]+/)
    .map((p) => normPlate(p))
    .filter((p, i, arr) => p && arr.indexOf(p) === i);
}
