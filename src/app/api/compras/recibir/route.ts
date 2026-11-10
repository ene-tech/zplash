import { NextRequest, NextResponse } from "next/server";
import { rechazoSiNoEsCron } from "@/lib/cron";
import { recibirDocumentosCompra } from "@/lib/comprasRecepcion";

export const runtime = "nodejs";

// Cron de Vercel (vercel.json): baja las facturas de compra que llegaron a
// facturascompra@zplash.cl. GET porque así invoca Vercel. El botón "Revisar
// correo" de la pestaña Facturas de compra hace lo mismo al instante.
export async function GET(request: NextRequest) {
  const rechazo = rechazoSiNoEsCron(request);
  if (rechazo) return rechazo;
  const resultado = await recibirDocumentosCompra();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
