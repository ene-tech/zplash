import "server-only";

// Mensajes directos de Instagram por la API de Meta (Instagram conectado a la
// página de Facebook, el mismo camino que usa la publicación de
// /api/redes/publicar). Necesita el permiso instagram_manage_messages en la app
// de Meta.
//
// Token: INSTAGRAM_TOKEN (el de usuario del sistema que genera el caso de uso
// "API de Instagram" en Meta) o, si no está, META_ADS_TOKEN. Con él se pide el
// token de la página, que es el que manda los DM; si el token ya es de página,
// esa misma consulta lo devuelve. Queda en memoria mientras viva la función.

const API = "https://graph.facebook.com/v25.0";
const PAGINA = process.env.META_ADS_PAGE_ID || "469580279582351";

let tokenPaginaCache: string | null = null;

async function tokenPagina(): Promise<string> {
  if (tokenPaginaCache) return tokenPaginaCache;
  const base = process.env.INSTAGRAM_TOKEN || process.env.META_ADS_TOKEN;
  if (!base) throw new Error("Falta INSTAGRAM_TOKEN o META_ADS_TOKEN");
  const url = new URL(`${API}/${PAGINA}`);
  url.searchParams.set("fields", "access_token");
  const body = await (await fetch(url, { headers: { Authorization: `Bearer ${base}` } })).json();
  if (!body.access_token) throw new Error(`No se pudo obtener el token de la página: ${body.error?.message ?? "sin access_token"}`);
  tokenPaginaCache = body.access_token as string;
  return tokenPaginaCache;
}

export interface PerfilInstagram {
  usuario: string | null;
  /** La persona sigue a @zplash. */
  sigue: boolean;
}

/** Perfil de quien nos escribió. Solo funciona con alguien que ya nos mandó un
 * DM (Meta no deja consultar a cualquiera). */
export async function perfilInstagram(igId: string): Promise<PerfilInstagram> {
  const url = new URL(`${API}/${encodeURIComponent(igId)}`);
  url.searchParams.set("fields", "username,is_user_follow_business");
  const body = await (await fetch(url, { headers: { Authorization: `Bearer ${await tokenPagina()}` } })).json();
  if (body.error) throw new Error(`Perfil de Instagram ${igId}: ${body.error.message}`);
  return { usuario: body.username ?? null, sigue: body.is_user_follow_business === true };
}

export async function enviarDmInstagram(igId: string, texto: string): Promise<void> {
  const res = await fetch(`${API}/${PAGINA}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await tokenPagina()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igId }, message: { text: texto } }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`DM de Instagram a ${igId}: ${body.error.message}`);
}
