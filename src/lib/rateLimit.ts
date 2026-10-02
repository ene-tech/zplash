import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";

/**
 * Límite de tasa compartido entre todas las instancias, en Postgres (tabla
 * rate_limits, ver supabase/rate-limits-2026-10-02.sql): ventana fija por
 * clave. Antes vivía solo en memoria, y en Vercel cada instancia serverless
 * tenía su propio contador, así que los límites de OTP, login y pagos se
 * multiplicaban por la cantidad de instancias que levantara el tráfico.
 *
 * Si la base falla (o la tabla todavía no existe porque el SQL se aplica a
 * mano después del deploy) cae al límite en memoria de siempre: un rate limit
 * nunca debería tumbar el login.
 */
export async function rateLimited(key: string, limite: number, ventanaMs: number): Promise<boolean> {
  try {
    // ponytail: las filas no se borran nunca (una por IP/clave); con el
    // tráfico de un solo local son pocas — agregar un delete de vencidas si
    // la tabla crece.
    const [fila] = await getDb().execute<{ golpes: number }>(sql`
      insert into rate_limits (clave, golpes, reinicia_en)
      values (${key}, 1, now() + ${ventanaMs} * interval '1 millisecond')
      on conflict (clave) do update set
        golpes = case when rate_limits.reinicia_en <= now() then 1 else rate_limits.golpes + 1 end,
        reinicia_en = case when rate_limits.reinicia_en <= now() then excluded.reinicia_en else rate_limits.reinicia_en end
      returning golpes`);
    return Number(fila.golpes) > limite;
  } catch (error) {
    console.error("Rate limit en Postgres no disponible, uso el de memoria", error);
    return rateLimitedEnMemoria(key, limite, ventanaMs);
  }
}

/** Respaldo por instancia (ventana deslizante) para cuando la base no responde. */
const golpes = new Map<string, number[]>();

export function rateLimitedEnMemoria(key: string, limite: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const historial = (golpes.get(key) || []).filter((t) => ahora - t < ventanaMs);
  if (historial.length >= limite) {
    golpes.set(key, historial);
    return true;
  }
  historial.push(ahora);
  golpes.set(key, historial);
  return false;
}

/**
 * IP del cliente para armar la key del límite de tasa.
 *
 * `x-real-ip` primero y `x-forwarded-for` solo como respaldo: el proxy de
 * Vercel setea el primero con la IP real de la conexión, mientras que el
 * segundo es una lista a la que el cliente puede ANTEPONER lo que quiera. Al
 * leer `x-forwarded-for.split(",")[0]` como se hacía antes, mandar
 * "X-Forwarded-For: <lo que sea>" daba una key distinta en cada request y
 * todos los límites de la app (login, OTP, consulta de tickets, el costo por
 * lectura de Plate Recognizer) quedaban en la práctica desactivados.
 *
 * Del `x-forwarded-for` de respaldo se toma la ÚLTIMA entrada, no la primera:
 * es la que agrega el proxy más cercano y la única que el cliente no controla.
 */
export function clienteIp(request: NextRequest): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const partes = forwardedFor.split(",");
    return partes[partes.length - 1].trim();
  }
  return "desconocido";
}
