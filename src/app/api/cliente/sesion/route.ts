import { NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds } from "@/lib/dataAccess/clientes";
import { planStatus } from "@/lib/helpers";
import type { SesionCliente } from "@/lib/sesionCliente";

export const runtime = "nodejs";

export async function GET() {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const respuesta: SesionCliente = {
    email: sesion.email,
    vehiculos: clientesEncontrados.map((c) => {
      const estado = planStatus(c);
      return {
        patente: c.patente,
        plan: c.plan || "Sin plan",
        estado: { label: estado.label, cls: estado.cls },
        vencimiento: c.vencimiento || null,
        patentePendiente: c.patentePendiente || null,
        patentePendienteDesde: c.patentePendienteDesde || null,
        // Datos de facturación vigentes (ver DatosFacturacion en @/types):
        // los usa DatosFacturacionSection para mostrar/editar la empresa
        // inscrita para Factura en vez de Boleta.
        tipoDocumento: c.tipoDocumento,
        razonSocial: c.razonSocial,
        rut: c.rut,
        direccion: c.direccion,
        giro: c.giro,
      };
    }),
  };
  return NextResponse.json(respuesta);
}
