import { NextResponse } from "next/server";
import { cerrarSesionCliente } from "@/lib/auth/clienteSession";

export const runtime = "nodejs";

export async function POST() {
  await cerrarSesionCliente();
  return NextResponse.json({ ok: true });
}
