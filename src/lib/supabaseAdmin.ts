import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase con la service role key, que salta RLS. Existe solo
// para el bucket privado `camara-fila` (ver supabase/add-camara-fila.sql):
// el cliente anon de @/lib/supabase no sirve ahí, porque darle permiso de
// lectura a anon sería darle la foto a cualquiera con la anon key -- que es
// pública por definición (NEXT_PUBLIC_).
//
// Lazy como getDb(): construirlo al importar reventaría todas las rutas que
// lo tocan de refilón si la env var falta en un entorno donde no se usa.
let cliente: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cliente) return cliente;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
  cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  return cliente;
}
