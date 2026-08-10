import "server-only";

import { enviarCorreo } from "./enviar";
import type { ResultadoEnvioCorreo } from "@/types";

// Código de acceso a Mi Cuenta (ver @/app/api/cliente/otp) enviado por el
// buzón propio (SMTP Banahost, ver @/lib/buzon/cliente) en vez de una
// plantilla de WhatsApp: mismo mecanismo que el resto del Gestor de correo,
// sin costo por envío.
export async function enviarCodigoOtpCliente(email: string, codigo: string): Promise<ResultadoEnvioCorreo> {
  return enviarCorreo({
    para: [email],
    asunto: `${codigo} es tu código de acceso a Mi Cuenta`,
    html: `
      <p>Tu código de acceso a <strong>Mi Cuenta</strong> es:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${codigo}</p>
      <p>Vence en 5 minutos. Si no lo solicitaste, ignora este correo.</p>
    `,
  });
}
