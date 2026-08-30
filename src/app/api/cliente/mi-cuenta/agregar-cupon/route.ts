import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cupones } from "@/db/schema";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { generarCodigoCupon, normPlate, uid } from "@/lib/helpers";
import { clienteIp, rateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const LIMITE_IP = 15;
const VENTANA_MS = 10 * 60 * 1000;

// Suma a la cuenta un código que el cliente recibió por fuera: un ticket de un
// Pack Empresa o un cupón de descuento de una promo. NO lo canjea — consumirlo
// sigue siendo del operador (ver canjearCupon en useOperadorScanPanel) — solo
// lo ata a esta cuenta:
//   - guarda el email de la sesión, así el código queda listado en "Mis
//     tickets y cupones" (mismo GET /api/empresa/tickets que ya usa esa
//     sección) en vez de vivir solo en un papel o un correo suelto;
//   - si es "descuento" y todavía no tiene patente asignada, además lo ata a un
//     vehículo de la cuenta, para que el operador lo aplique con solo leer la
//     patente, sin tipear el código (ver cuponDescuentoVigente en
//     useOperadorFoundResult).
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }
  // Un código son 6 caracteres: sin límite, la cuenta sirve de oráculo para
  // adivinar tickets ajenos a fuerza bruta.
  if (rateLimited(`agregar-cupon:${clienteIp(request)}`, LIMITE_IP, VENTANA_MS)) {
    return NextResponse.json({ ok: false, error: "Demasiados intentos, espera unos minutos" }, { status: 429 });
  }

  let body: { codigo?: unknown; patente?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const codigo = (typeof body.codigo === "string" ? body.codigo : "").trim().toUpperCase();
  if (!codigo) {
    return NextResponse.json({ ok: false, error: "Ingresa el código" }, { status: 400 });
  }

  try {
    const db = getDb();
    const [cupon] = await db.select().from(cupones).where(eq(cupones.codigo, codigo)).limit(1);
    if (!cupon) {
      return NextResponse.json({ ok: false, error: "No encontramos ese código" }, { status: 404 });
    }
    if (cupon.usado) {
      return NextResponse.json({ ok: false, error: "Ese código ya fue usado" }, { status: 409 });
    }
    if (new Date(cupon.fechaCaducidad) < new Date()) {
      return NextResponse.json({ ok: false, error: "Ese código está vencido" }, { status: 409 });
    }

    const email = sesion.email.trim().toLowerCase();
    // Antes de cualquier consulta y antes de la rama de la promo: un código
    // que ya tiene dueño no se toca por ningún camino.
    if (cupon.email && cupon.email.trim().toLowerCase() !== email) {
      return NextResponse.json({ ok: false, error: "Ese código ya está en otra cuenta" }, { status: 409 });
    }

    // normPlate y no la patente "tal cual la ficha": todo lo que se compara y
    // escribe después (patentesUsadas, patenteAsignada) viaja normalizado —
    // ver normPlate/marcarDescuentoUsado—, y una patente guardada con guion
    // no volvería a matchear ni acá ni en cuponDescuentoDePatente.
    const patentes = (await getClientesByIds(sesion.clienteIds)).map((c) => normPlate(c.patente));
    const elegida = normPlate(typeof body.patente === "string" ? body.patente : "");
    if (elegida && !patentes.includes(elegida)) {
      return NextResponse.json({ ok: false, error: "Esa patente no es de tu cuenta" }, { status: 400 });
    }
    if (cupon.tipo === "descuento" && cupon.patenteAsignada && !patentes.includes(normPlate(cupon.patenteAsignada))) {
      return NextResponse.json({ ok: false, error: `Ese descuento es de la patente ${cupon.patenteAsignada}` }, { status: 409 });
    }
    // Toda patente de la cuenta tiene ficha, y un descuento con patente
    // asignada se aplica SOLO por patente, sin pasar por resolverDescuento —
    // que es el único que controla esta regla. Atarlo acá sería saltársela.
    if (cupon.tipo === "descuento" && cupon.soloClientesNuevos && patentes.length) {
      return NextResponse.json({ ok: false, error: "Ese descuento es solo para clientes nuevos" }, { status: 409 });
    }

    // Promo abierta de "un uso por patente" (un código que circula en redes o
    // volantes): la fila compartida no se toca — atarle email/patenteAsignada
    // se la sacaría a todos los demás, porque patenteAsignada es justo lo que
    // resolverDescuento usa para rechazar a otra patente. Guardarla en la
    // cuenta es gastar el uso de ESTA patente y emitirle a cambio un cupón
    // propio equivalente, que ya es un descuento normal: sale en "Mis tickets
    // y cupones", rebaja el precio en Mi Cuenta y lo aplica el mesón con solo
    // leer la patente (ver cuponDescuentoDePatente).
    // La marca es de descuentos (ver resolverDescuento): si aparece en un
    // "vale" no se guarda en la cuenta, porque el UPDATE del final le
    // estamparía el email de esta cuenta a una fila que es de todos.
    if (cupon.unUsoPorPatente && cupon.tipo !== "descuento") {
      return NextResponse.json(
        { ok: false, error: "Ese código es una promoción abierta: no se guarda en la cuenta, lo aplicamos al llegar al local." },
        { status: 409 }
      );
    }

    if (cupon.tipo === "descuento" && cupon.unUsoPorPatente) {
      const patente = elegida || (patentes.length === 1 ? patentes[0] : "");
      if (!patente) {
        return NextResponse.json(
          { ok: false, error: "Ese código es una promoción por patente: agrega tu vehículo antes de guardarlo." },
          { status: 400 }
        );
      }
      const existentes = await db.select({ codigo: cupones.codigo }).from(cupones);
      const propio = {
        id: uid(),
        codigo: generarCodigoCupon(new Set(existentes.map((r) => r.codigo))),
        nombreLote: cupon.nombreLote,
        valor: cupon.valor,
        fechaCaducidad: cupon.fechaCaducidad,
        creadoPor: `Portal Cliente (${cupon.codigo})`,
        tipo: "descuento",
        esPorcentaje: cupon.esPorcentaje,
        patenteAsignada: patente,
        canal: cupon.canal,
        email,
      };
      // El append va en SQL y no reescribiendo la lista completa: dos patentes
      // guardando la misma promo a la vez no pueden pisarse un uso. El NOT @>
      // en el WHERE es además lo que hace idempotente el doble click: si la
      // patente ya estaba, no se emite un segundo cupón propio.
      //
      // to_jsonb(...::text) y no '["AB1234"]'::jsonb: el parámetro sale
      // codificado como JSON otra vez y la lista termina con el texto del
      // array adentro (["[\"AB1234\"]"]), que ningún @> vuelve a encontrar.
      const usadaPor = sql`to_jsonb(${patente}::text)`;
      const propioEmitido = await db.transaction(async (tx) => {
        const [quemado] = await tx
          .update(cupones)
          .set({ patentesUsadas: sql`coalesce(${cupones.patentesUsadas}, '[]'::jsonb) || ${usadaPor}` })
          .where(and(eq(cupones.id, cupon.id), sql`not coalesce(${cupones.patentesUsadas}, '[]'::jsonb) @> ${usadaPor}`))
          .returning({ id: cupones.id });
        if (!quemado) return null;
        await tx.insert(cupones).values(propio);
        return propio;
      });
      if (!propioEmitido) {
        return NextResponse.json({ ok: false, error: "Esa patente ya usó este descuento" }, { status: 409 });
      }
      return NextResponse.json({ ok: true, tipo: "descuento", patenteAsignada: patente, codigo: propioEmitido.codigo });
    }

    let patenteAsignada = cupon.patenteAsignada;
    if (cupon.tipo === "descuento") {
      if (!patenteAsignada) {
        // Con un solo vehículo no se le pregunta nada al cliente; con varios el
        // formulario manda cuál. Sin vehículos el descuento igual se guarda en
        // la cuenta: queda "abierto" y el operador lo aplica tipeando el código
        // (ver resolverDescuento).
        patenteAsignada = elegida || (patentes.length === 1 ? patentes[0] : null);
      }
    }

    await db.update(cupones).set({ email, patenteAsignada }).where(eq(cupones.id, cupon.id));

    return NextResponse.json({ ok: true, tipo: cupon.tipo, patenteAsignada });
  } catch (error) {
    console.error("Error agregando cupón a la cuenta", error);
    return NextResponse.json({ ok: false, error: "Error de servidor" }, { status: 500 });
  }
}
