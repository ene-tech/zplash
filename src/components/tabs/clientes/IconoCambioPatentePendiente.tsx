import { ArrowLeftRight } from "lucide-react";

// Indicador visual de que el cliente tiene una solicitud de cambio de
// patente pendiente (ver ClientModal → SolicitudCambioPatenteAdmin): se
// aplicará recién cuando el plan renueve a un período nuevo, ver
// resolverPatentePendiente en @/lib/helpers.
export function IconoCambioPatentePendiente({ patentePendiente }: { patentePendiente: string }) {
  return (
    <span
      className="inline-flex shrink-0"
      title={`Cambio de patente pendiente a ${patentePendiente}`}
      aria-label={`Cambio de patente pendiente a ${patentePendiente}`}
    >
      <ArrowLeftRight size={13} style={{ color: "var(--blue)" }} />
    </span>
  );
}
