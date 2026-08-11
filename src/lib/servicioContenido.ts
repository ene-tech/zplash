// Contenido de marketing por servicio para la landing de producto en
// /servicios/[id] (banner + "Cómo funciona"). No vive en la tabla `servicios`
// porque es copy editorial, no dato operativo — se edita acá a mano, igual
// que los textos fijos de FaqTab/VentaEmpresaInfoTab. Lavado Full Tunnel y
// Plan Mensual tienen su propia landing (/servicios/full-tunnel,
// /servicios/plan-mensual) con copy propio, así que no están acá.
export interface ServicioContenido {
  descripcion: string;
  videoUrl?: string; // TODO: reemplazar por el video real del banner cuando esté listo
}

export const SERVICIO_CONTENIDO: Record<string, ServicioContenido> = {
  "detailing-mediano": {
    descripcion:
      "Limpieza completa por dentro y por fuera: carrocería, llantas, vidrios, interior aspirado y detallado. Precio según el tamaño de tu vehículo. Se agenda con horario para asegurar tu cupo.",
  },
  tapiz: {
    descripcion:
      "Lavado profundo de los asientos (2 corridas) con máquina extractora e inyección de agua caliente, que remueve manchas y olores que la aspiradora no saca.",
  },
  alfombra: {
    descripcion: "Lavado profundo de la alfombra del piso con máquina extractora, dejándola libre de manchas y olores.",
  },
  techo: {
    descripcion: "Limpieza profunda de la tapicería del techo interior, removiendo manchas y restos de humedad u olores.",
  },
  motor: {
    descripcion:
      "Desengrasado y lavado del compartimento del motor, cuidando los componentes eléctricos. Mejora la apariencia y ayuda a detectar filtraciones a tiempo.",
  },
  chasis: {
    descripcion: "Lavado a presión del chasis y bajos del vehículo, sacando barro y tierra acumulada.",
  },
  "chasis-grafitado": {
    descripcion:
      "Lavado del chasis a presión más aplicación de grafito protector en los bajos del vehículo, para prevenir corrosión y darle un terminado uniforme.",
  },
};

const CONTENIDO_DEFAULT: ServicioContenido = {
  descripcion: "Servicio disponible en ZPlash. Consulta más detalles en el local o por WhatsApp.",
};

export function obtenerContenidoServicio(id: string): ServicioContenido {
  return SERVICIO_CONTENIDO[id] ?? CONTENIDO_DEFAULT;
}
