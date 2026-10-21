"use client";

// Puente al POS Integrado de Transbank (traído de ZUPER), vía el SDK oficial
// `transbank-pos-sdk-web` v5: la página se conecta por socket.io al AGENTE
// Transbank que corre en el PC de la caja (default http://localhost:8090) y el
// agente habla por serial/USB con el terminal. El agente se instala desde
// transbankdevelopers.cl y debe quedar corriendo al inicio de Windows. NO es
// el API REST de POS (deprecado).
//
// SIN VERIFICAR CONTRA HARDWARE: no hay terminal físico todavía. El flujo es
// el mismo de ZUPER; la primera venta real con el terminal es la prueba.
//
// Estado module-level a propósito (no React): la conexión con el agente es
// una por pestaña y la comparte cualquier modal de pago que la use.

/** Lo que se usa del SDK (ver dist/pos.d.ts del paquete). Tipado local para
 * que el repo compile aunque la dependencia todavía no esté instalada. */
interface RespuestaPos {
  responseCode?: number;
  responseMessage?: string;
  operationNumber?: number | string | null;
  authorizationCode?: string | null;
  last4Digits?: number | string | null;
  cardBrand?: string | null;
}
interface SdkPos {
  isConnected: boolean;
  connect(url?: string, options?: { reconnectionAttempts?: number }): Promise<boolean>;
  autoconnect(): Promise<string | boolean>;
  loadKeys(): Promise<unknown>;
  doSale(amount: number, ticket: string, callback?: (status: { responseMessage?: string }) => void): Promise<RespuestaPos>;
}

let puertoAbierto: string | null = null;

async function sdk(): Promise<SdkPos> {
  // Import dinámico: el SDK abre sockets y toca `window`, solo se carga al
  // cobrar con terminal. @ts-ignore (y no @ts-expect-error) para que compile
  // con y sin el paquete instalado.
  // @ts-ignore -- dependencia opcional hasta correr npm install
  const mod = await import("transbank-pos-sdk-web");
  return (mod.default ?? mod.POS) as SdkPos;
}

export function posIntegradoConectado(): boolean {
  return puertoAbierto !== null;
}

/** Conecta con el agente local y abre el puerto del terminal (autoconnect
 * prueba todos los puertos serial hasta que el POS responde). Carga llaves
 * best-effort: Transbank la pide al menos una vez al día. */
export async function conectarPosIntegrado(
  url = "http://localhost:8090"
): Promise<{ ok: true; puerto: string } | { ok: false; error: string }> {
  try {
    const POS = await sdk();
    if (!POS.isConnected) await POS.connect(url, { reconnectionAttempts: 2 });
    const puerto = await POS.autoconnect();
    if (typeof puerto !== "string" || !puerto) {
      return { ok: false, error: "No se encontró el terminal. Revisa el cable USB y que el Agente Transbank esté corriendo." };
    }
    puertoAbierto = puerto;
    try {
      await POS.loadKeys();
    } catch {
      // No fatal: si las llaves ya estaban cargadas hoy, algunos agentes
      // responden error igual. La venta real acusará si de verdad faltan.
    }
    return { ok: true, puerto };
  } catch (error) {
    console.error("No se pudo conectar al POS Integrado", error);
    puertoAbierto = null;
    return { ok: false, error: "No se pudo conectar con el Agente Transbank (¿está instalado y corriendo en este computador?)" };
  }
}

/** Manda el monto al terminal y espera que el cliente pase la tarjeta.
 * `onEstado` recibe los mensajes intermedios del terminal ("Acerque su
 * tarjeta…", "Procesando…"). Aprobada = responseCode 0; el voucher resume
 * nº de operación, código de autorización, últimos 4 y marca. */
export async function ventaPosIntegrado(
  monto: number,
  ticket: string,
  onEstado?: (mensaje: string) => void
): Promise<{ aprobada: true; voucher: string } | { aprobada: false; error: string }> {
  try {
    const POS = await sdk();
    const r = await POS.doSale(Math.round(monto), ticket.slice(0, 20), (s) => {
      if (s?.responseMessage) onEstado?.(s.responseMessage);
    });
    if (r?.responseCode !== 0) {
      return { aprobada: false, error: r?.responseMessage || "Transacción rechazada por el terminal" };
    }
    const partes = [
      r.operationNumber != null ? `op ${r.operationNumber}` : null,
      r.authorizationCode ? `aut ${r.authorizationCode}` : null,
      r.last4Digits != null ? `****${r.last4Digits}` : null,
      r.cardBrand || null,
    ].filter(Boolean);
    return { aprobada: true, voucher: partes.join(" · ") || "aprobada (sin detalle)" };
  } catch (error) {
    console.error("Error cobrando en el POS Integrado", error);
    puertoAbierto = null;
    // Sin respuesta NO es lo mismo que rechazada: el terminal pudo haber
    // cobrado igual. Se pide mirar la pantalla del terminal antes de reintentar.
    return {
      aprobada: false,
      error:
        "El terminal no respondió. Mira su pantalla: si dice APROBADA, cobra con Tarjeta (manual) anotando el voucher; si no, reintenta.",
    };
  }
}
