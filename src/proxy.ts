import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// "/" sirve la landing pública (zplash.cl). El panel admin vive físicamente
// en /admin, pero el equipo lo sigue viendo en la raíz de su propio
// subdominio (admin.zplash.cl): acá reescribimos esa raíz de forma
// transparente para no romper el bookmark que ya usan a diario.
// ADMIN_HOST es configurable porque el hostname difiere entre preview
// deployments de Vercel y producción.
const ADMIN_HOST = process.env.ADMIN_HOST || "admin.zplash.cl";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0];
  if (host === ADMIN_HOST) {
    return NextResponse.rewrite(new URL("/admin", request.url));
  }
}

export const config = {
  matcher: "/",
};
