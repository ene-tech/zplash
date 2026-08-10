export interface VehiculoSesion {
  patente: string;
  plan: string;
  estado: { label: string; cls: "ok" | "warn" | "bad" };
  vencimiento: string | null;
  patentePendiente: string | null;
  patentePendienteDesde: string | null;
}

// La sesión real (ver @/lib/auth/clienteSession y @/app/api/cliente) vive en
// una cookie httpOnly firmada, no acá — este tipo es solo lo que devuelve
// GET /api/cliente/sesion para pintar el Portal Cliente. `email` es el
// correo con el que se hizo login (usado también por TicketsEmpresaSection).
export interface SesionCliente {
  email: string;
  vehiculos: VehiculoSesion[];
}
