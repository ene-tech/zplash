import { NextResponse } from "next/server";
import { tieneAlgunModulo } from "@/lib/session";
import { pdfFactura } from "@/lib/simplefactura";

// PDF de una factura emitida, para el link de la pestaña Facturas. No se
// guarda copia: se le pide a SimpleFactura cada vez (ver pdfFactura).
// ?tipo=61 baja la nota de crédito con ese folio en vez de la factura.
export async function GET(request: Request, ctx: { params: Promise<{ folio: string }> }) {
  if (!(await tieneAlgunModulo(["empresas_facturacion", "cierre", "arqueo", "permisos"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { folio } = await ctx.params;
  if (!/^\d+$/.test(folio)) return NextResponse.json({ error: "Folio inválido" }, { status: 400 });
  const notaCredito = new URL(request.url).searchParams.get("tipo") === "61";
  const nombre = `${notaCredito ? "Nota-de-credito" : "Factura"}-${folio}.pdf`;
  try {
    const pdf = await pdfFactura(Number(folio), notaCredito ? 61 : 33);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${nombre}"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    console.error("Error bajando PDF de factura", folio, notaCredito ? "NC" : "", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
