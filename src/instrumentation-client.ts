import posthog from "posthog-js";

// Analítica de producto (embudos, grabaciones de sesión, mapas de calor)
// solo para el sitio público. La clave existe únicamente en el ambiente
// Production de Vercel: en local, en dev:pruebas y en previews no se carga
// nada y no se mezclan visitas de prueba con las reales.
//
// El panel interno (admin.zplash.cl, que por dentro es /admin, y el operador
// que vive ahí) queda fuera: ensucia los embudos y grabaría datos de
// clientes en pantalla.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const esPanelInterno =
  window.location.hostname.startsWith("admin.") || window.location.pathname.startsWith("/admin");

if (key && !esPanelInterno) {
  try {
    posthog.init(key, {
      api_host: "https://eu.i.posthog.com",
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      session_recording: {
        // Los inputs ya van enmascarados por defecto (patente, correo,
        // teléfono). En Mi Cuenta además se ve el correo/teléfono como texto
        // plano, así que bajo /cliente se enmascara todo el texto.
        maskAllInputs: true,
        maskTextSelector: "*",
        maskTextFn: (text) =>
          window.location.pathname.startsWith("/cliente") ? text.replace(/\S/g, "*") : text,
      },
    });
  } catch (error) {
    console.error("No se pudo iniciar PostHog", error);
  }
}
