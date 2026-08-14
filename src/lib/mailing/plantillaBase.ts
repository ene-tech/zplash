import "server-only";

// Escapa el texto plano que escribe el admin en PlantillaCorreo.cuerpo (ver
// WebSettingsMailTab.tsx: hoy es un <textarea> simple, no un editor de HTML)
// antes de insertarlo en el HTML del correo — variables como {{nombre}}
// vienen de datos reales del cliente y en teoría no deberían traer "<"/"&",
// pero un nombre con esos caracteres no debe romper el layout del correo.
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Convierte texto plano (líneas en blanco separan párrafos, igual que
// escribir un correo normal) a HTML seguro — el admin escribe texto corrido
// en el textarea, no HTML a mano.
function textoPlanoAHtml(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((parrafo) => parrafo.trim())
    .filter(Boolean)
    .map((parrafo) => `<p style="margin:0 0 16px;">${escapeHtml(parrafo).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Envuelve el cuerpo de una PlantillaCorreo (ya con las {{variables}}
// aplicadas, ver aplicarVariables en @/lib/helpers) en una plantilla base con
// diseño de marca — header con el logo, acento dorado y footer de contacto —
// para que un correo automático se vea profesional sin que el admin tenga
// que escribir HTML/CSS a mano en el textarea de Web Settings → Mail
// Templates. Fondo claro a propósito (no el negro del sitio): el modo oscuro
// del sitio se ve mal/impredecible en la mayoría de los clientes de correo,
// que a veces invierten o ignoran los colores del `body`.
//
// Layout basado en tablas con estilos inline (no <style> ni flexbox/grid):
// es el único patrón que renderiza consistente en Outlook de escritorio,
// que sigue usando el motor de Word para HTML y no soporta CSS moderno.
export function envolverCorreoBase(cuerpoPlano: string): string {
  const contenido = textoPlanoAHtml(cuerpoPlano);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background-color:#f5f5f0; font-family: Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:8px; overflow:hidden;">
          <tr>
            <td style="background-color:#2d2926; padding:24px; text-align:center;">
              <img src="https://zplash.cl/logo.png" alt="ZPlash" width="140" style="display:block; margin:0 auto; border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 16px; color:#2d2926; font-size:15px; line-height:1.6;">
              ${contenido}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px; text-align:center;">
              <a href="https://zplash.cl/cliente" style="display:inline-block; background-color:#ffc72c; color:#2d2926; font-weight:bold; font-size:14px; text-decoration:none; padding:12px 32px; border-radius:6px;">Ir a Mi Cuenta</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px;">
              <div style="height:1px; background-color:#e5e2d8; line-height:1px; font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px; color:#8a8780; font-size:12px; line-height:1.6; text-align:center;">
              ZPlash · Temuco, Chile<br>
              ¿Dudas? Escríbenos a <a href="mailto:info@zplash.cl" style="color:#8a8780;">info@zplash.cl</a><br>
              Este es un mensaje automático — no hace falta responder este correo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
