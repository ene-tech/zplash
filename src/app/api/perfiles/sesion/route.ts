import { NextResponse } from "next/server";
import { tieneSesionValida } from "@/lib/session";

export const runtime = "nodejs";

// Ruta HTTP y no Server Action a propósito: la consulta AppContext justo
// cuando un commit falló, y una de las causas posibles es que la pestaña
// quedó vieja tras un deploy (sus Server Actions ya no existen del lado del
// servidor). Un fetch normal responde igual.
export async function GET() {
  return NextResponse.json({ ok: await tieneSesionValida() });
}
