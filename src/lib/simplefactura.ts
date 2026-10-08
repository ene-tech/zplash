import "server-only";

import type { Venta } from "@/types";

// Emisión de facturas electrónicas (DTE 33) vía SimpleFactura
// (https://documentacion.simplefactura.cl). El ambiente (certificación o
// producción) lo define la cuenta en el portal, no el request.

const API = "https://api.simplefactura.cl";

export interface ReceptorFactura {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion?: string;
  email?: string;
}

// ponytail: cache por instancia del server. SimpleFactura da 10 tokens por
// hora por usuario; con ~100 facturas al mes alcanza de sobra. Si se pasa,
// guardar el token en la base.
let tokenCache: { token: string; vence: number } | null = null;

async function token(): Promise<string> {
  if (tokenCache && tokenCache.vence > Date.now()) return tokenCache.token;
  const res = await fetch(`${API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // trim: un espacio o salto de línea pegado en Vercel da 401 sin más pista.
    body: JSON.stringify({ email: process.env.SIMPLEFACTURA_EMAIL?.trim(), password: process.env.SIMPLEFACTURA_PASSWORD?.trim() }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.accessToken) throw new Error(`SimpleFactura no entregó token (${res.status}): ${json?.message ?? ""}`);
  // Vence a las 24 h; se renueva una hora antes.
  tokenCache = { token: json.accessToken, vence: Date.now() + (json.expiresIn - 3600) * 1000 };
  return tokenCache.token;
}

// SimpleFactura no completa el emisor desde la cuenta: el SII exige estos
// campos en el XML y en este orden (RUTEmisor, RznSoc, GiroEmis, Acteco...).
const EMISOR = {
  RznSoc: "Servicio e Inversiones Las Aguilas Spa",
  GiroEmis: "Lavado de vehículos",
  Acteco: [452001],
  DirOrigen: "Prieto Norte 71",
  CmnaOrigen: "Temuco",
};

/** Arma el JSON de invoiceV2 para una factura afecta. Los precios de las
 * ventas ya traen IVA, por eso va MntBruto=1 y el neto se despeja del total. */
export function armarFactura(ventas: Venta[], receptor: ReceptorFactura, fecha: string, rutEmisor: string) {
  const total = ventas.reduce((s, v) => s + v.precio, 0);
  const neto = Math.round(total / 1.19);
  const pagada = ventas.every((v) => !v.estadoPago || v.estadoPago === "pagado");
  // No hay campo comuna en la ficha: se toma lo que venga después de la
  // última coma de la dirección ("Av. X 123, Las Condes"). Sin coma, el SII
  // igual exige comuna: se usa la del local, donde están casi todos.
  const comuna = (receptor.direccion?.includes(",") && receptor.direccion.split(",").pop()!.trim()) || "Temuco";
  return {
    Documento: {
      Encabezado: {
        IdDoc: { TipoDTE: 33, FchEmis: fecha, FmaPago: pagada ? 1 : 2, MntBruto: 1 },
        Emisor: { RUTEmisor: rutEmisor, ...EMISOR },
        Receptor: {
          RUTRecep: receptor.rut.replace(/\./g, "").toUpperCase(),
          RznSocRecep: receptor.razonSocial.slice(0, 100),
          GiroRecep: receptor.giro.slice(0, 40),
          DirRecep: receptor.direccion?.slice(0, 70),
          CmnaRecep: comuna.slice(0, 20),
          CorreoRecep: receptor.email,
        },
        Totales: { MntNeto: neto, TasaIVA: 19, IVA: total - neto, MntTotal: total },
      },
      Detalle: ventas.map((v, i) => ({
        NroLinDet: i + 1,
        NmbItem: [v.tipo, v.patente].filter(Boolean).join(" - ").slice(0, 80),
        DscItem: v.fecha.slice(0, 10),
        QtyItem: 1,
        PrcItem: v.precio,
        MontoItem: v.precio,
      })),
    },
  };
}

/** Emite la factura y devuelve el folio asignado por el SII. */
export async function emitirFactura(ventas: Venta[], receptor: ReceptorFactura, fecha: string): Promise<number> {
  const rutEmisor = process.env.SIMPLEFACTURA_RUT_EMISOR;
  if (!rutEmisor || !process.env.SIMPLEFACTURA_EMAIL || !process.env.SIMPLEFACTURA_PASSWORD) {
    throw new Error("Falta configurar SimpleFactura (SIMPLEFACTURA_EMAIL, SIMPLEFACTURA_PASSWORD, SIMPLEFACTURA_RUT_EMISOR)");
  }
  const sucursal = (process.env.SIMPLEFACTURA_SUCURSAL || "Casa Matriz").replace(/ /g, "_");
  const res = await fetch(`${API}/invoiceV2/${encodeURIComponent(sucursal)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify(armarFactura(ventas, receptor, fecha, rutEmisor)),
  });
  const json = await res.json().catch(() => null);
  const folio = json?.data?.folio;
  if (!res.ok || typeof folio !== "number") {
    throw new Error(json?.errors?.join("; ") || json?.message || `SimpleFactura respondió ${res.status}`);
  }
  return folio;
}
