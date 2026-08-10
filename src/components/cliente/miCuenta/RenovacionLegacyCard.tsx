// Tarjeta de solo lectura para un cliente cuya renovación automática todavía
// la cobra WooCommerce Subscriptions (sistema anterior, ver
// renovacionAutoWooDesde en db/schema/clientes.ts) — no se puede cancelar ni
// cambiar la tarjeta desde acá mientras esa migración siga en curso, por eso
// el link va a WhatsApp en vez de un botón.
const WHATSAPP_URL = "https://wa.me/56957969446?text=" + encodeURIComponent("Hola, quiero gestionar mi renovación automática");

export function RenovacionLegacyCard({ patente, desde }: { patente: string; desde: string }) {
  return (
    <div className="vehicle-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="plate-tag">{patente}</span>
        <span className="status-pill ok">Renovación automática activa</span>
      </div>
      <div className="plan-nombre">Gestionada por nuestro sistema anterior</div>
      <div style={{ color: "var(--gray)", fontSize: 12.5, marginBottom: 10 }}>
        Activa desde {new Date(desde).toLocaleDateString("es-CL")}
      </div>
      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", fontSize: 13 }}>
        Cambiar tarjeta o cancelar por WhatsApp →
      </a>
    </div>
  );
}
