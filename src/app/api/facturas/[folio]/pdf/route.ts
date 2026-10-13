import { NextResponse } from "next/server";
import { tieneAlgunModulo } from "@/lib/session";
import { pdfFactura } from "@/lib/simplefactura";

// PDF de una factura emitida, para el link de la pestaña Facturas. No se
// guarda copia: se le pide a SimpleFactura cada vez (ver pdfFactura).
export async function GET(_request: Request, ctx: { params: Promise<{ folio: string }> }) {
  if (!(await tieneAlgunModulo(["empresas_facturacion", "cierre", "arqueo", "permisos"]))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { folio } = await ctx.params;
  if (!/^\d+$/.test(folio)) return NextResponse.json({ error: "Folio inválido" }, { status: 400 });
  try {
    const pdf = await pdfFactura(Number(folio));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Factura-${folio}.pdf"`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e) {
    console.error("Error bajando PDF de factura", folio, e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
