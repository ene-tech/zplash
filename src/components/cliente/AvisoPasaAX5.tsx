import { PASES_INCLUIDOS_X5, PLANES, fmtFecha } from "@/lib/helpers";

/**
 * Lo que hay que decirle al cliente que todavía figura con el ilimitado viejo
 * ANTES de que pague, no después: ese plan dejó de ofrecerse y cualquier pago
 * web (renovación anticipada, reactivación o plan vencido) lo deja en el X5
 * — ver renovarPlan en @/lib/logic y aplicarPagoAprobado en @/lib/pagos, que
 * escriben PLANES[0] pase lo que pase. Es el mismo aviso que el operador da
 * en el mesón (AvisoPasaAX5 en OperadorFoundOfertas), redactado para el
 * cliente.
 *
 * `vencimiento` solo cuando el plan sigue vigente: renovar antes de vencer no
 * le quita el mes sin tope que ya tenía pagado (ver ilimitadoHastaAlRenovar),
 * el X5 le rige recién desde el ciclo siguiente.
 */
export function AvisoPasaAX5({ plan, vencimiento }: { plan?: string | null; vencimiento?: string | null }) {
  if (!plan || plan === PLANES[0] || plan === "Sin plan") return null;
  return (
    <div style={{ color: "var(--gold)", fontSize: 12.5, lineHeight: 1.5, marginTop: 10, marginBottom: 12 }}>
      <b>Tu {plan} ya no se ofrece.</b> Lo que contratas acá es el {PLANES[0]}: {PASES_INCLUIDOS_X5} lavados Full Túnel
      al mes (uno cada 24 horas, con aspirado incluido después de cada uno).
      {vencimiento
        ? ` El mes sin tope que ya tienes pagado se te respeta hasta el ${fmtFecha(vencimiento)} — el ${PLANES[0]} empieza a correr después.`
        : ""}{" "}
      <a href="/politicas" target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
        Ver las políticas del plan
      </a>
      .
    </div>
  );
}
