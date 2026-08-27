import "server-only";

import { enviarCorreo } from "./enviar";
import { envolverHtmlBase } from "@/lib/mailing/plantillaBase";
import type { ResultadoEnvioCorreo } from "@/types";

// Código de acceso a Mi Cuenta (ver @/app/api/cliente/otp) enviado por el
// buzón propio (SMTP Banahost, ver @/lib/buzon/cliente) en vez de una
// plantilla de WhatsApp: mismo mecanismo que el resto del Gestor de correo,
// sin costo por envío. Va con la shell de marca (logo arriba, footer de
// contacto) igual que los correos automáticos, pero sin el botón "Ir a Mi
// Cuenta": el único CTA de este correo es el código mismo.
export async function enviarCodigoOtpCliente(email: string, codigo: string): Promise<ResultadoEnvioCorreo> {
  return enviarCorreo({
    para: [email],
    asunto: `${codigo} es tu código de acceso a Mi Cuenta`,
    html: envolverHtmlBase(
      `
      <p style="margin:0 0 20px;">Tu código de acceso a <strong>Mi Cuenta</strong> es:</p>
      <p style="margin:0 0 20px; font-size:32px; font-weight:bold; letter-spacing:8px; color:#262320;">${codigo}</p>
      <p style="margin:0;">Vence en 5 minutos. Si no lo solicitaste, ignora este correo.</p>
      `,
      { boton: false }
    ),
  });
}
