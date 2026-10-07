import type { Metadata } from "next";
import Link from "next/link";
import ClienteHeader from "@/components/cliente/ClienteHeader";
import { buscarClientePorCodigoBajaSms } from "@/lib/dataAccess";
import { confirmarBajaSms } from "./acciones";

// Link de baja que va al pie de cada SMS de campaña (ver pieBajaSms en
// @/lib/sms/texto). La baja se confirma con un botón y no al abrir el link,
// porque los teléfonos y las apps de mensajería abren los links solos para
// armar la vista previa.
export const metadata: Metadata = { title: "Dejar de recibir mensajes | ZPlash", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BajaSmsPage({ params }: { params: Promise<{ codigo: string }> }) {
  const codigo = (await params).codigo.toUpperCase();
  const cliente = /^[A-Z0-9]{6}$/.test(codigo) ? await buscarClientePorCodigoBajaSms(codigo) : null;

  return (
    <div id="app">
      <ClienteHeader titulo="Mensajes de ZPlash" />
      <div className="content" style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
        {!cliente ? (
          <p style={{ marginTop: 32 }}>Este link no es válido o ya no existe.</p>
        ) : cliente.yaDeBaja ? (
          <>
            <h2 style={{ marginTop: 32 }}>Listo</h2>
            <p>
              No te enviaremos más promociones para la patente terminada en <strong>{cliente.patente.slice(-2)}</strong>.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 32 }}>¿Dejar de recibir promociones?</h2>
            <p>
              No te enviaremos más mensajes promocionales ni avisos automáticos para la patente terminada en{" "}
              <strong>{cliente.patente.slice(-2)}</strong>.
            </p>
            <form action={confirmarBajaSms}>
              <input type="hidden" name="codigo" value={codigo} />
              <button type="submit" className="btn">
                Sí, no quiero recibir más mensajes
              </button>
            </form>
          </>
        )}
        <p style={{ marginTop: 24, fontSize: 13 }}>
          <Link href="/">Ir a zplash.cl</Link>
        </p>
      </div>
    </div>
  );
}
