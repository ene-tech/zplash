import type { Metadata } from "next";
import SiteNav from "@/components/cliente/SiteNav";
import SiteFooter from "@/components/cliente/SiteFooter";

// Política de privacidad del sitio y de la app (la exigen Google Play y la
// App Store). Ruta pública, como /politicas. La sección #eliminar-cuenta es la
// URL que se declara en Play Console para pedir el borrado de la cuenta.
//
// Si se suma un proveedor que recibe datos de clientes, o cambia lo que hace
// la app con la ubicación, hay que actualizar esto y la fecha de VERSION.
export const metadata: Metadata = {
  title: "Política de Privacidad | ZPlash",
  description: "Qué datos personales usa ZPlash en su sitio y su app, para qué, con quién se comparten y cómo pedir su eliminación.",
};

const VERSION = "17/11/2026";
const CORREO = "contacto@zplash.cl";

const SECCIONES: { id?: string; titulo: string; puntos: React.ReactNode[] }[] = [
  {
    titulo: "Quién es responsable de tus datos",
    puntos: [
      <>
        Servicio e Inversiones Las Águilas SpA, RUT 76.969.928-7, que opera ZPlash Car Wash en Prieto Norte 71, Temuco, Chile.
      </>,
      <>
        Para cualquier consulta sobre tus datos personales escríbenos a <a href={`mailto:${CORREO}`}>{CORREO}</a>.
      </>,
    ],
  },
  {
    titulo: "Qué datos usamos",
    puntos: [
      "Datos de tu cuenta: correo, nombre, teléfono y la patente de tus vehículos.",
      "Datos de facturación, solo si pides factura: RUT, razón social, giro y dirección de la empresa.",
      "Uso del servicio: compras, planes, tickets y cupones, y la fecha y hora de cada pasada por el túnel.",
      "Pagos: los procesa Transbank (Webpay y Oneclick). ZPlash no recibe ni guarda el número de tu tarjeta; solo el tipo de tarjeta, sus últimos 4 dígitos y el identificador que entrega Transbank para el cobro automático.",
      "App: un identificador de tu teléfono para enviarte notificaciones.",
      "Ubicación (solo en la app y solo si das el permiso): tu teléfono revisa si entras a una zona de unos 400 metros alrededor del local para avisarte si tienes un descuento. No recibimos ni guardamos tu ubicación ni tus recorridos: solo nos llega el aviso de que entraste a esa zona. Puedes quitar el permiso cuando quieras en los ajustes del teléfono.",
      "Foto de la fila: los clientes con plan vigente pueden ver una imagen de la entrada del local que se actualiza cada pocos segundos. No se usa para identificar personas.",
      "Analítica del sitio web: solo si la aceptas en el aviso de cookies, medimos cómo se usa el sitio (PostHog, con servidores en la Unión Europea). En Mi Cuenta los textos e ingresos de datos van ocultos en esas mediciones.",
    ],
  },
  {
    titulo: "Para qué los usamos",
    puntos: [
      "Prestarte el servicio: reconocer tu patente en el local, aplicar tu plan, tickets y descuentos.",
      "Cobrar tus compras y la renovación automática de tu plan, y emitir tu boleta o factura electrónica ante el SII.",
      "Avisarte por correo, SMS, WhatsApp o notificación de la app sobre tu plan, tus compras, tus cupones y promociones. Puedes pedir que no te enviemos mensajes promocionales.",
      "Responder tus consultas, incluido nuestro asistente automático de WhatsApp.",
      "Mejorar el sitio y la app.",
    ],
  },
  {
    titulo: "Con quién los compartimos",
    puntos: [
      "No vendemos tus datos. Los comparten solo los proveedores que necesitamos para operar, que los usan por cuenta nuestra:",
      "Supabase (base de datos) y Vercel (alojamiento del sitio).",
      "Transbank (pagos) y SimpleFactura (boletas y facturas electrónicas).",
      "Resend (correo), LabsMobile (SMS), Meta (WhatsApp) y Google Firebase (notificaciones de la app).",
      "Anthropic (inteligencia artificial del asistente de WhatsApp) y PostHog (analítica del sitio, si la aceptas).",
      "Autoridades, cuando la ley lo exige.",
    ],
  },
  {
    titulo: "Cuánto tiempo los guardamos",
    puntos: [
      "Mientras tengas tu cuenta. Las ventas, boletas y facturas se guardan el tiempo que exige la ley tributaria, aunque elimines tu cuenta.",
    ],
  },
  {
    titulo: "Tus derechos",
    puntos: [
      <>
        Puedes pedir acceso, corrección o eliminación de tus datos, u oponerte a su uso, escribiendo a <a href={`mailto:${CORREO}`}>{CORREO}</a>.
        Te respondemos en un máximo de 15 días hábiles.
      </>,
      "El servicio está dirigido a mayores de 18 años.",
    ],
  },
  {
    id: "eliminar-cuenta",
    titulo: "Eliminar tu cuenta",
    puntos: [
      "Desde la app: Cuenta → Eliminar mi cuenta.",
      <>
        Desde cualquier lugar: escríbenos a <a href={`mailto:${CORREO}`}>{CORREO}</a> desde el correo de tu cuenta, con el asunto
        &quot;Eliminar mi cuenta&quot;.
      </>,
      "Eliminamos tus datos de cuenta (correo, nombre, teléfono, vehículos, notificaciones y tarjeta guardada) en un máximo de 30 días. Si tienes un plan con cobro automático, se cancela. Solo conservamos las ventas, boletas y facturas que la ley obliga a guardar, sin usarlas para nada más.",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <div id="app">
      <SiteNav />

      <div className="content" style={{ maxWidth: 760 }}>
        <h2 className="section-title">Política de Privacidad</h2>
        <p style={{ color: "var(--gray)", fontSize: 13, textAlign: "center", marginBottom: 22 }}>Versión {VERSION}</p>

        {SECCIONES.map((s) => (
          <div className="card" key={s.titulo} id={s.id} style={{ marginBottom: 18, scrollMarginTop: 100 }}>
            <h3>{s.titulo}</h3>
            <ul className="faq-answer-list">
              {s.puntos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <SiteFooter />
    </div>
  );
}
