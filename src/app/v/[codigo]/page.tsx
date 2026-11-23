import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { clienteIp, rateLimited } from "@/lib/rateLimit";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import Patente from "@/components/cliente/Patente";
import PagoLinkSms from "@/components/cliente/linkSms/PagoLinkSms";
import { fmtCaducidad, fmtCLP } from "@/lib/helpers";
import { ofertaLinkSms, resolverLinkSms } from "@/lib/linkSms";

// Link personal de un SMS de campaña (ver @/lib/linkSms): la patente, el
// descuento y la tarjeta guardada ya vienen cargados, sin escribir nada. Abrir
// el link no cobra nada (los teléfonos lo abren solos para la vista previa):
// cobra el botón.
export const metadata: Metadata = { title: "Tu lavado | ZPlash", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NOTA_LOCAL = "¿Prefieres pagar en el local? Solo di tu patente.";

// Aperturas por conexión cada 5 minutos: frena a quien prueba códigos al azar
// para ver patentes y tarjetas ajenas (revisión de seguridad, nov-2026). Alto
// a propósito: en el celular muchos clientes comparten la IP de la compañía
// (CGNAT) y abren el SMS masivo a la vez; con códigos de 8 caracteres, 100
// intentos por IP no alcanzan para adivinar uno.
const LIMITE_APERTURAS = 100;
const VENTANA_MS = 5 * 60 * 1000;

export default async function LinkSmsPage({ params }: { params: Promise<{ codigo: string }> }) {
  if (await rateLimited(`link-sms-ver:${clienteIp({ headers: await headers() })}`, LIMITE_APERTURAS, VENTANA_MS)) {
    return (
      <div id="app">
        <ClienteHeader titulo="Tu lavado" />
        <div className="content link-sms">
          <h2>Demasiados intentos</h2>
          <p className="hint">Espera unos minutos y vuelve a abrir el link de tu SMS.</p>
        </div>
      </div>
    );
  }
  const link = await resolverLinkSms((await params).codigo);
  const oferta = link && !link.nonGrato ? await ofertaLinkSms(link) : null;
  const saludo = link?.nombre && link.nombre !== "Cliente Web" ? `Hola ${link.nombre.split(" ")[0]}, ` : "Hola, ";

  return (
    <div id="app">
      <ClienteHeader titulo="Tu lavado" />
      <div className="content link-sms">
        {!link || !oferta ? (
          <>
            <h2>Este link ya no está disponible</h2>
            <p className="hint">Puedes comprar tu lavado en la web o pagarlo en el local con tu patente.</p>
            <Link href="/pagar?item=lavado_unico" className="btn">
              Comprar un lavado
            </Link>
          </>
        ) : oferta.yaPagado ? (
          <>
            <h2>Tu lavado ya está pagado</h2>
            <p className="hint">Quedó cargado a tu patente. En el local solo di tu patente.</p>
            <Patente patente={link.patente} grande />
          </>
        ) : (
          <>
            <p className="hint">{saludo}esto es para tu auto</p>
            <Patente patente={link.patente} grande />
            <div className="card link-sms-oferta">
              <h3>Lavado Full Túnel</h3>
              {oferta.cuponSoloLocal ? (
                <>
                  <div className="link-sms-precio">
                    <strong>{fmtCLP(oferta.cuponSoloLocal.precio)}</strong>
                  </div>
                  <span className="hint">Válido hasta el {fmtCaducidad(oferta.cuponSoloLocal.caduca)} (incluido)</span>
                </>
              ) : (
                <>
                  <div className="link-sms-precio">
                    <strong>{fmtCLP(oferta.precioWeb)}</strong>
                    {oferta.precioWeb < oferta.precioLista && <s>{fmtCLP(oferta.precioLista)}</s>}
                  </div>
                  {oferta.cuponWeb && <span className="hint">Válido hasta el {fmtCaducidad(oferta.cuponWeb.caduca)} (incluido)</span>}
                </>
              )}
            </div>
            {oferta.cuponSoloLocal ? (
              <p className="link-sms-local">
                <strong>Este descuento se usa en el local.</strong> Solo di tu patente: ya está cargado.
              </p>
            ) : (
              <>
                <PagoLinkSms codigo={link.codigo} patente={link.patente} precio={oferta.precioWeb} tarjeta={oferta.tarjeta} />
                <p className="link-sms-local">{oferta.cuponWeb ? `${NOTA_LOCAL} El descuento ya está cargado.` : NOTA_LOCAL}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
