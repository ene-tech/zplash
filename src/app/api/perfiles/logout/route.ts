import { NextRequest, NextResponse } from "next/server";
import { cerrarSesion } from "@/lib/session";
import { origenValido } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!origenValido(request)) {
    return NextResponse.json({ ok: false, error: "Origen no permitido" }, { status: 403 });
  }
  await cerrarSesion();
  return NextResponse.json({ ok: true });
}
