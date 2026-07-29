import { NextRequest, NextResponse } from "next/server";
import { parsearCartolaPDF } from "@/lib/cartolaParser";
import { tieneModulo } from "@/lib/session";

// pdfjs-dist (vía @/lib/cartolaParser) necesita APIs de Node (Buffer, etc.)
// que no existen en el runtime Edge.
export const runtime = "nodejs";

// Recibe el PDF de la cartola y lo parsea server-side (ver @/lib/cartolaParser):
// evita bundlear pdfjs-dist para el navegador y todo el manejo de Worker que
// eso implicaría — en Node, pdfjs-dist corre el "worker" en el mismo proceso.
// Nada de esto se guarda acá: el resultado vuelve al cliente para que el
// usuario revise el preview antes de confirmar la importación (ver
// ConciliacionBancariaTab e importarCartola en @/lib/logic).
export async function POST(request: NextRequest) {
  try {
    if (!(await tieneModulo("contabilidad"))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo PDF" }, { status: 400 });
    }
    if (archivo.type !== "application/pdf" && !archivo.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "El archivo debe ser un PDF" }, { status: 400 });
    }

    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const resultado = await parsearCartolaPDF(bytes);
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Error en /api/conciliacion/parsear-cartola", error);
    return NextResponse.json({ error: "No se pudo leer el PDF. Verifica que sea una cartola válida." }, { status: 500 });
  }
}
