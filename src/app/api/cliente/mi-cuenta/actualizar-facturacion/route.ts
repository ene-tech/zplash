import { NextRequest, NextResponse } from "next/server";
import { leerSesionCliente } from "@/lib/auth/clienteSession";
import { getClientesByIds, upsertClientes } from "@/lib/dataAccess/clientes";
import { RUT_FORMATO_MSG, formatRut, isValidRut, normPlate } from "@/lib/helpers";

export const runtime = "nodejs";

// Versión para el Portal Cliente de los campos de facturación que en el
// panel de operador/admin llena ClientModal (razonSocial/rut/direccion/giro,
// ver DatosFacturacion en @/types): acá el propio dueño del vehículo
// "inscribe su empresa" para que las próximas ventas de esa patente se
// emitan con Factura en vez de Boleta (ver el comentario sobre
// DatosFacturacion en @/types/clientes: las ventas copian estos campos del
// Cliente al momento de la venta). A diferencia de guardarClienteModal
// (@/lib/logic/clientes, solo para operador/admin), acá NO se da de alta la
// Empresa maestra (tabla `empresas`) automáticamente: ese directorio lo
// pobló siempre personal de confianza (ClientModal o EmpresasTab), y dejar
// que cualquier cliente autenticado por OTP escriba ahí directo permitiría
// registrar una empresa/RUT ajenos sin revisión. La forma de incorporarla
// sigue siendo que un admin corra "Sincronizar desde clientes" en
// EmpresasTab (ver empresasFaltantesDesdeClientes), que ya cubre este caso.
export async function POST(request: NextRequest) {
  const sesion = await leerSesionCliente();
  if (!sesion) {
    return NextResponse.json({ ok: false, error: "Sin sesión" }, { status: 401 });
  }

  let body: {
    patente?: string;
    tipoDocumento?: "Boleta" | "Factura";
    razonSocial?: string;
    rut?: string;
    direccion?: string;
    giro?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const patente = normPlate(body.patente);
  const clientesEncontrados = await getClientesByIds(sesion.clienteIds);
  const objetivo = clientesEncontrados.find((c) => normPlate(c.patente) === patente);
  if (!objetivo) {
    return NextResponse.json({ ok: false, error: "Ese vehículo no está en tu cuenta" }, { status: 404 });
  }

  const tipoDocumento: "Boleta" | "Factura" = body.tipoDocumento === "Factura" ? "Factura" : "Boleta";

  let razonSocial = "";
  let rut = "";
  let direccion = "";
  let giro = "";
  if (tipoDocumento === "Factura") {
    razonSocial = (body.razonSocial || "").trim();
    direccion = (body.direccion || "").trim();
    giro = (body.giro || "").trim();
    const rutRaw = (body.rut || "").trim();
    if (!razonSocial || !direccion || !giro) {
      return NextResponse.json({ ok: false, error: "Completa Razón Social, RUT, Dirección y Giro para inscribir la empresa" }, { status: 400 });
    }
    if (!isValidRut(rutRaw)) {
      return NextResponse.json({ ok: false, error: RUT_FORMATO_MSG }, { status: 400 });
    }
    rut = formatRut(rutRaw);
  }
  // tipoDocumento === "Boleta": los 4 campos quedan vacíos, lo que
  // upsertClientes normaliza a null (ver clienteToRow) — así "volver a
  // boleta" también borra la empresa inscrita, no solo deja de usarla.

  const ok = await upsertClientes(
    [],
    [{ anterior: objetivo, patch: { id: objetivo.id, tipoDocumento, razonSocial, rut, direccion, giro } }]
  );
  if (!ok) {
    return NextResponse.json({ ok: false, error: "No se pudo guardar el cambio" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tipoDocumento, razonSocial, rut, direccion, giro });
}
