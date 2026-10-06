import FaqAccordion, { type FaqPregunta } from "./FaqAccordion";

// Orden: primero el servicio y el local, después los tickets de empresa y al
// final el plan y lo genérico (pagos, descuentos).
export const PREGUNTAS: FaqPregunta[] = [
  {
    q: "¿En qué consiste el servicio?",
    a: [
      "Lavamos el exterior de tu auto en un túnel automático, en minutos: prelavado, jabón, cepillado, enjuague y secado en un solo pase.",
      "Después puedes usar la zona de aspirado autoservicio todo el tiempo que quieras para limpiar el interior.",
    ],
  },
  {
    q: "¿Necesito reservar hora?",
    a: ["No, el lavado en túnel no necesita reserva: llega directo al local."],
  },
  {
    q: "¿Dónde están y en qué horario atienden?",
    a: [
      "En Prieto Norte 71, Temuco.",
      "Lunes a viernes de 08:30 a 20:00.",
      "Sábado, domingo y festivos de 10:00 a 19:00.",
    ],
  },
  {
    q: "¿Cómo funciona la zona de aspirado?",
    a: [
      "Es autoservicio: tú mismo limpias el interior, con aspiradoras y pistolas de aire.",
      "Si lavaste en el túnel, la usas sin límite de tiempo después del lavado.",
      "También puedes pagar solo el uso de la zona de aspirado, sin lavar.",
    ],
  },
  {
    q: "¿El lavado de chasis viene incluido?",
    a: ["No, el Lavado de Chasis + Ducha Química se cobra aparte."],
  },
  {
    q: "¿Puedo comprar lavados para mi empresa?",
    a: [
      "Sí, vendemos packs de tickets de lavado, desde 10.",
      "Con boleta o factura.",
      "Los compras en la sección \"Tipo de Lavados\", en Pack de Tickets.",
      "Al comprar eliges si los tickets sirven para cualquier patente o solo para las patentes de tu flota.",
      { src: "/faq/comprar-pack.webp", alt: "Formulario de compra del Pack de Tickets con las patentes de la flota ingresadas" },
    ],
  },
  {
    q: "¿Dónde veo los tickets de mi empresa?",
    a: [
      "Entra a Mi Cuenta con el mismo correo que usaste al comprar: los tickets aparecen solos en \"Mis tickets y cupones\".",
      "Ahí ves el código de cada ticket, si está disponible o usado, y en qué patente se usó.",
      { src: "/faq/mis-tickets.webp", alt: "Sección Mis tickets y cupones de Mi Cuenta con tickets usados y disponibles" },
      "Si no tienes cuenta, también puedes consultarlos con el RUT de la compra en Pack de Tickets → \"¿Ya compraste? Consulta tus tickets\".",
    ],
  },
  {
    q: "¿Cómo usan los tickets mis choferes?",
    a: [
      "Si al comprar ingresaste las patentes de tu flota: llegan al local, leemos la patente y pasan, sin código.",
      "Si dejaste los tickets abiertos: el chofer da en caja el código de un ticket disponible (lo copias desde Mi Cuenta).",
      "Cada ticket es un lavado y queda marcado como usado con la patente que lo ocupó.",
      "Los tickets duran 45 días desde la compra.",
    ],
  },
  {
    q: "Me pasaron un código de ticket, ¿cómo lo agrego a mi cuenta?",
    a: [
      "En Mi Cuenta, en \"Mis tickets y cupones\", toca \"+ Agregar cupón o ticket\".",
      "Escribe el código y toca Agregar.",
      { src: "/faq/agregar-ticket.webp", alt: "Formulario para agregar un código de ticket en Mi Cuenta" },
      "Agregarlo no lo gasta: el ticket se usa recién cuando lo canjeas en el local.",
      "Los tickets caducados los puedes eliminar de la lista con el botón Eliminar.",
    ],
  },
  {
    q: "¿Qué incluye el Plan X5?",
    a: [
      "5 lavados Full Túnel durante el mes que va desde la contratación.",
      "Máximo 1 ingreso cada 24 horas.",
      "Aspirado autoservicio sin límite de tiempo, en cada uno de los 5 lavados, después de pasar por el túnel.",
      "Válido para una patente; puede cambiarse al término del período.",
      "Para vehículos de uso particular o empresa; prohibido para transporte público, taxi, Uber o colectivos.",
    ],
  },
  {
    q: "¿Cómo renuevo mi plan?",
    a: [
      "En el local.",
      "Desde la web, en la sección Pagar, ingresando tu patente.",
      "Ahí puedes pagar un período con tarjeta (Webpay Plus) o activar la renovación automática mensual.",
    ],
  },
  {
    q: "¿Qué pasa si mi plan vence?",
    a: [
      "Puedes seguir viniendo y pagar un lavado único.",
      "Puedes renovar tu plan apenas quieras.",
      "Te avisamos cuando esté por vencer.",
    ],
  },
  {
    q: "¿Qué medios de pago aceptan?",
    a: [
      "En el local: efectivo, tarjeta y transferencia bancaria.",
      "Desde la web: tarjetas de crédito o débito a través de Webpay Plus.",
      "Renovación automática con Oneclick.",
    ],
  },
  {
    q: "¿Tienen descuento para mi primera visita?",
    a: [
      "Sí. Escríbenos por WhatsApp con la palabra \"descuento\" seguida de tu patente.",
      "Te enviamos un código de descuento válido por 7 días.",
    ],
  },
];

export default function FaqTab() {
  return <FaqAccordion preguntas={PREGUNTAS} />;
}
