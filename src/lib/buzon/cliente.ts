import "server-only";

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

// Buzón info@zplash.cl, hosting Banahost (cPanel, Dovecot/Exim estándar —
// nada de OAuth). Vercel es serverless: no hay forma de mantener una
// conexión IMAP persistente entre invocaciones, así que cada operación abre
// su propia conexión y la cierra al terminar (ver conConexionImap) en vez de
// poolear un cliente compartido.
interface ConfigBuzon {
  host: string;
  imapPort: number;
  smtpPort: number;
  usuario: string;
  password: string;
}

function config(): ConfigBuzon {
  const host = process.env.MAIL_IMAP_HOST;
  const imapPort = process.env.MAIL_IMAP_PORT;
  const smtpHost = process.env.MAIL_SMTP_HOST;
  const smtpPort = process.env.MAIL_SMTP_PORT;
  const usuario = process.env.MAIL_USER;
  const password = process.env.MAIL_PASSWORD;
  if (!host || !imapPort || !smtpHost || !smtpPort || !usuario || !password) {
    throw new Error("Faltan variables de entorno del buzón (MAIL_IMAP_HOST/MAIL_IMAP_PORT/MAIL_SMTP_HOST/MAIL_SMTP_PORT/MAIL_USER/MAIL_PASSWORD)");
  }
  return { host, imapPort: Number(imapPort), smtpPort: Number(smtpPort), usuario, password };
}

// Abre una conexión IMAP, corre `fn` y la cierra pase lo que pase (incluso
// si `fn` lanza) — patrón "usar y soltar" para no dejar conexiones
// colgando entre invocaciones serverless.
export async function conConexionImap<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const cfg = config();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.imapPort,
    secure: true,
    auth: { user: cfg.usuario, pass: cfg.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export function transporteSmtp() {
  const cfg = config();
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.smtpPort,
    secure: true,
    auth: { user: cfg.usuario, pass: cfg.password },
  });
}

export function usuarioBuzon(): string {
  return config().usuario;
}
