"use server";

import { redirect } from "next/navigation";
import { darDeBajaPorCodigoSms } from "@/lib/dataAccess";

// Pública a propósito (el cliente llega desde el link del SMS, sin sesión): solo
// sirve con un código que exista en mensajes_sms, y lo único que hace es
// apagar las comunicaciones automáticas de ese cliente.
export async function confirmarBajaSms(formData: FormData) {
  const codigo = String(formData.get("codigo") || "").toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) return;
  await darDeBajaPorCodigoSms(codigo);
  redirect(`/b/${codigo}`);
}
