import type { DatosFacturacion } from "@/types";

export interface VehiculoSesion extends DatosFacturacion {
  patente: string;
  plan: string;
  estado: { label: string; cls: "ok" | "warn" | "bad" };
  vencimiento: string | null;
  patentePendiente: string | null;
  patentePendienteDesde: string | null;
  // Sigue en el ilimitado viejo y todavía no acepta pasar al X5: los botones
  // de Mi Cuenta tienen que decirle que lo que contrata es el Plan X5, no que
  // "renueva su plan" (ver requiereValidacionX5).
  requiereValidacionX5: boolean;
}

// La sesión real (ver @/lib/auth/clienteSession y @/app/api/cliente) vive en
// una cookie httpOnly firmada, no acá — este tipo es solo lo que devuelve
// GET /api/cliente/sesion para pintar el Portal Cliente. `email` es el
// correo con el que se hizo login (usado también por TicketsEmpresaSection).
export interface SesionCliente {
  email: string;
  vehiculos: VehiculoSesion[];
}
