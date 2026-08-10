import Link from "next/link";

const MENSAJES: Record<string, { titulo: string; texto: string; cls: "ok" | "warn" | "bad"; volverHref: string; volverLabel: string }> = {
  ok: { titulo: "¡Pago exitoso!", texto: "Tu pago se procesó correctamente.", cls: "ok", volverHref: "/pagar", volverLabel: "Volver" },
  error: { titulo: "Pago rechazado", texto: "El pago no pudo procesarse. Puedes intentar de nuevo.", cls: "bad", volverHref: "/pagar", volverLabel: "Volver" },
  anulado: { titulo: "Pago cancelado", texto: "Cancelaste el pago antes de completarlo.", cls: "warn", volverHref: "/pagar", volverLabel: "Volver" },
  tarjeta_guardada: {
    titulo: "Tarjeta guardada",
    texto: "Tu tarjeta quedó registrada. Se usará para la renovación automática de tu plan cuando corresponda — no se hizo ningún cobro ahora.",
    cls: "ok",
    volverHref: "/cliente",
    volverLabel: "Volver a Mi Cuenta",
  },
  tarjeta_error: {
    titulo: "No se pudo guardar la tarjeta",
    texto: "Hubo un problema confirmando la inscripción. Intenta de nuevo desde Mi Cuenta.",
    cls: "bad",
    volverHref: "/cliente",
    volverLabel: "Volver a Mi Cuenta",
  },
  tarjeta_anulada: {
    titulo: "Inscripción cancelada",
    texto: "Cancelaste el proceso antes de completarlo. No se guardó ninguna tarjeta.",
    cls: "warn",
    volverHref: "/cliente",
    volverLabel: "Volver a Mi Cuenta",
  },
};

export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; buyOrder?: string }>;
}) {
  const { estado: estadoParam, buyOrder } = await searchParams;
  const estado = estadoParam || "error";
  const info = MENSAJES[estado] || MENSAJES.error;

  return (
    <div className="content" style={{ maxWidth: 480 }}>
      <Link href="/" className="landing-back">
        ← Volver a Inicio
      </Link>
      <div className={`result-card ${info.cls === "ok" ? "found" : "notfound"}`}>
        <div className="result-head">
          <strong>{info.titulo}</strong>
          <span className={`status-pill ${info.cls}`}>{estado.toUpperCase()}</span>
        </div>
        <p>{info.texto}</p>
        {buyOrder && (
          <p style={{ marginTop: 10, color: "var(--gray)", fontSize: 12.5 }}>N° de orden: {buyOrder}</p>
        )}
        <a href={info.volverHref} className="btn" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>
          {info.volverLabel}
        </a>
      </div>
    </div>
  );
}
