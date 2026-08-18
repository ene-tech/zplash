// Un módulo = una vista principal de la app. Determina qué ve cada perfil
// una vez que inició sesión (ver PerfilPublico.modulos).
export type Modulo =
  | "operador"
  | "servicios"
  | "clientes"
  | "suscripciones"
  | "ingresos"
  | "cierre"
  | "empresa"
  | "empresas_facturacion"
  | "perfiles"
  | "stats"
  | "config"
  | "contabilidad"
  | "permisos"
  | "arqueo"
  | "agenda"
  | "web_settings"
  | "inventario"
  | "mantencion"
  | "mensajes"
  | "correo";

// Lo que el cliente sí puede cargar: nombre y módulos permitidos, nunca la
// contraseña. La clave solo se consulta/valida server-side, dentro de las
// rutas /api/perfiles/*.
export interface PerfilPublico {
  id: string;
  nombre: string;
  modulos: Modulo[];
  icono?: string;
}
