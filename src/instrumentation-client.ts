import { analiticaDisponible, iniciarAnalitica, leerConsentimiento } from "@/lib/analitica";

// PostHog arranca acá solo si el visitante ya aceptó las cookies en una
// visita anterior. Si no ha decidido, el aviso (AvisoCookies) lo inicia
// cuando acepta; si rechazó, no se carga. Ver @/lib/analitica.
if (analiticaDisponible() && leerConsentimiento() === "aceptado") {
  iniciarAnalitica();
}
