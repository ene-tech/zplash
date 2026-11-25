import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import CanjeInstagram from "@/components/cliente/linkSms/CanjeInstagram";
import { resolverLinkInstagram } from "@/lib/instagram/cuponSeguidor";

// Link personal del descuento por seguirnos en Instagram (ver
// @/lib/instagram/cuponSeguidor). Ya activado, el pago vive en /v/[codigo].
export const metadata: Metadata = { title: "Tu descuento de Instagram | ZPlash", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function LinkInstagramPage({ params }: { params: Promise<{ codigo: string }> }) {
  const link = await resolverLinkInstagram((await params).codigo);
  if (link?.activadoEn) redirect(`/v/${link.codigo}`);

  return (
    <div id="app">
      <ClienteHeader titulo="Tu descuento" />
      <div className="content link-sms">
        {!link ? (
          <>
            <h2>Este link no existe</h2>
            <p className="hint">Síguenos en Instagram y escríbenos ZPLASH por mensaje directo para recibir el tuyo.</p>
          </>
        ) : (
          <CanjeInstagram codigo={link.codigo} />
        )}
      </div>
    </div>
  );
}
