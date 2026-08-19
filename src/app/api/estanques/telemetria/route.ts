import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  cargarEstanques,
  cerrarValvulasAutomatico,
  insertLecturas,
  sincronizarConfirmaciones,
} from "@/lib/dataAccess";
import { aperturaCaducada, debeCerrarPorLleno, uid } from "@/lib/helpers";

export const runtime = "nodejs";

// Único punto de contacto con el hardware del local: el controlador (ESP32 /
// Shelly) hace POST acá cada ~60s con lo que leyeron los sensores, y en la
// MISMA respuesta recibe qué válvulas debe tener abiertas. Un solo viaje para
// telemetría y comando — sin broker MQTT, sin conexión persistente, sin abrir
// ningún puerto hacia el local (mismo criterio que /api/camara/fila).
//
// Autenticación por secreto compartido en un header: no hay sesión de usuario
// detrás, es una máquina. Ojo con lo que esta ruta NO puede hacer: solo
// escribe lecturas y confirmaciones. Abrir una válvula es siempre una acción
// de un operador con sesión (ver setValvula en @/lib/serverActions), así que
// filtrar el secreto no le da a nadie la llave del agua.
//
// El controlador debe cerrar sus válvulas por su cuenta si este endpoint deja
// de responder — un dispositivo que se queda con la última orden y pierde el
// WiFi con la llave abierta inunda el local. La otra mitad de ese riesgo la
// cubre acá aperturaCaducada().
const MAX_ITEMS = 50;

function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.ESTANQUES_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

interface Cuerpo {
  lecturas?: { estanqueId?: unknown; crudo?: unknown }[];
  valvulas?: { id?: unknown; abierta?: unknown }[];
}

export async function POST(request: NextRequest) {
  if (!secretoValido(request.headers.get("x-estanques-secret"))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: Cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 });
  }

  const { estanques, valvulas } = await cargarEstanques();
  const ahora = Date.now();

  // Se filtra en vez de rechazar el lote completo: si un sensor de cuatro
  // devuelve basura, los otros tres igual deben quedar registrados. El id se
  // valida contra los estanques que existen y no solo por tipo — es una sola
  // fila de INSERT para todo el lote, así que un id desconocido reventaría la
  // FK y se llevaría también las lecturas buenas.
  const conocidos = new Map(estanques.map((e) => [e.id, e]));
  const lecturas = (Array.isArray(cuerpo.lecturas) ? cuerpo.lecturas : [])
    .slice(0, MAX_ITEMS)
    .filter((l) => typeof l?.crudo === "number" && Number.isFinite(l.crudo) && conocidos.has(l.estanqueId as string))
    .map((l) => ({
      // uid() y no `l${Date.now()}${i}`: dos POST en el mismo milisegundo
      // (dos controladores, o un reintento) generaban ids idénticos y el
      // choque de clave primaria se llevaba el lote entero en silencio.
      id: uid(),
      estanqueId: l.estanqueId as string,
      crudo: l.crudo as number,
    }));

  const reportadas = (Array.isArray(cuerpo.valvulas) ? cuerpo.valvulas : [])
    .slice(0, MAX_ITEMS)
    .filter((v) => typeof v?.id === "string" && typeof v?.abierta === "boolean")
    .map((v) => ({ id: v.id as string, abierta: v.abierta as boolean }));

  await insertLecturas(lecturas);

  // El estado real reportado se compara contra el pedido: coincide → queda
  // confirmada; no coincide (relé trabado, controlador que cerró por su
  // cuenta) → se le quita la confirmación y la pantalla lo muestra.
  const pedido = new Map(valvulas.map((v) => [v.id, v.abierta]));
  const confirmadas = reportadas.filter((r) => pedido.get(r.id) === r.abierta).map((r) => r.id);
  const discrepantes = reportadas.filter((r) => pedido.has(r.id) && pedido.get(r.id) !== r.abierta).map((r) => r.id);
  await sincronizarConfirmaciones(confirmadas, discrepantes);

  // Cierres que decide el servidor. Se escriben de verdad (no se enmascara la
  // respuesta) para que queden enganchados y visibles: ver debeCerrarPorLleno.
  const recien = new Map(lecturas.map((l) => [l.estanqueId, l.crudo]));
  const llenos = new Set(
    estanques.filter((e) => debeCerrarPorLleno(e, recien.get(e.id) ?? null)).map((e) => e.id)
  );
  const aCerrar = valvulas.filter(
    (v) =>
      v.abierta &&
      // Una válvula dada de baja no puede quedarse abierta: antes se la
      // sacaba de la respuesta y el controlador, que solo aplica los ids que
      // recibe, se quedaba con la última orden y seguía echando agua.
      (!v.activo || aperturaCaducada(v, ahora) || (v.estanqueId && llenos.has(v.estanqueId)))
  );
  if (aCerrar.length) {
    await cerrarValvulasAutomatico(
      aCerrar.map((v) => v.id),
      "sistema"
    );
  }

  const cerradas = new Set(aCerrar.map((v) => v.id));
  return NextResponse.json({
    ok: true,
    // Van TODAS las válvulas, incluidas las inactivas: el controlador tiene
    // que recibir la orden de cerrar, no dejar de recibir órdenes.
    valvulas: valvulas.map((v) => ({ id: v.id, abierta: v.abierta && !cerradas.has(v.id) })),
  });
}
