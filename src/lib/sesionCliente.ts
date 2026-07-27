export interface VehiculoSesion {
  patente: string;
  plan: string;
  estado: { label: string; cls: "ok" | "warn" | "bad" };
  vencimiento: string | null;
}

// La sesión real (ver @/lib/auth/clienteSession y @/app/api/cliente) vive en
// una cookie httpOnly firmada, no acá — este tipo es solo lo que devuelve
// GET /api/cliente/sesion para pintar el Portal Cliente. `email` es el de
// alguna de las filas de `clientes` resueltas por teléfono, si la tienen
// cargada (usado por TicketsEmpresaSection); puede no haber ninguna.
export interface SesionCliente {
  telefono: string;
  email: string | null;
  vehiculos: VehiculoSesion[];
}
