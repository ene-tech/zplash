import FaqAccordion from "./FaqAccordion";

export const PREGUNTAS: { q: string; a: string | string[] }[] = [
  {
    q: "¿Qué incluye el Plan X5?",
    a: [
      "5 lavados Full Túnel durante los 30 días desde la contratación.",
      "Máximo 1 ingreso cada 24 horas.",
      "Uso ilimitado de las máquinas aspiradoras autoservicio.",
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
  {
    q: "¿Puedo comprar lavados para mi empresa?",
    a: [
      "Sí, vendemos lotes de tickets de lavado, desde 10.",
      "Con boleta o factura.",
      "Revisa la sección \"Tipo de Lavados\" para comprarlos.",
    ],
  },
  {
    q: "¿Necesito reservar hora?",
    a: [
      "Lavado túnel: no se necesita reserva.",
      "Lavado Completo Detailing y servicios adicionales: se recomienda agendar con anticipación por WhatsApp para asegurar tu horario.",
    ],
  },
];

export default function FaqTab() {
  return <FaqAccordion preguntas={PREGUNTAS} />;
}
