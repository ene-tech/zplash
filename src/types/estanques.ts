// Sensores de nivel de estanques y válvulas remotas. A diferencia del resto
// de los dominios, esto NO entra en AppData: `lecturas_estanque` es una serie
// de tiempo que crece sola y no tendría sentido cargarla entera al iniciar
// sesión (ver el comentario de performance en loadAll). La vista se carga y
// se refresca sola vía cargarEstanques() en @/lib/serverActions.
export interface Estanque {
  id: string;
  nombre: string;
  contenido?: string;
  capacidadLitros: number;
  /** Ver el comentario de calibración en @/db/schema/estanques. */
  offsetCrudo: number;
  litrosPorUnidad: number;
  umbralBajoLitros?: number;
  activo: boolean;
  /** Posición en la lista, a mano desde la configuración. Ver el comentario
   *  en @/db/schema/estanques. */
  orden: number;
  creadoEn: string;
  creadoPor?: string;
}

export interface LecturaEstanque {
  crudo: number;
  medidoEn: string;
}

export interface EstanqueConLectura extends Estanque {
  ultima: LecturaEstanque | null;
}

export interface Valvula {
  id: string;
  nombre: string;
  estanqueId?: string;
  /** Estado pedido desde la app, no el real: ver `confirmadaEn`. */
  abierta: boolean;
  cambiadoEn: string;
  cambiadoPor?: string;
  confirmadaEn?: string;
  activo: boolean;
}
