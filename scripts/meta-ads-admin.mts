// Administra las campañas de Meta Ads (Facebook/Instagram) de Zplash desde la
// terminal. Lo que cambia algo en Meta NO se manda sin --confirmar: sin esa
// bandera solo muestra lo que haría. Para bajar el histórico a CSV está
// scripts/meta-ads-campanas.mts (solo lectura).
//
// Uso (npx tsx --env-file=.env.local scripts/meta-ads-admin.mts <comando> ...):
//   estado                         token, permisos, cuenta, página y WhatsApp
//   listar [--dias 7]              campañas y conjuntos con estado, presupuesto y gasto
//   pausar <id> [--confirmar]      campaña, conjunto o anuncio
//   reanudar <id> [--confirmar]    idem (lanzar una campaña creada = reanudarla)
//   presupuesto <id> <pesos> [--confirmar]   presupuesto diario de un conjunto o campaña
//   crear --nombre "..." [--reels id,id] [--videos a.mp4,b.mp4] [--imagenes a.jpg]
//         [--texto "..."] [--presupuesto 2000] [--radio 8] [--edad-min 18] [--edad-max 65] [--confirmar]
//         Crea campaña Click-to-WhatsApp: un conjunto (Temuco, radio en km) con un
//         anuncio por reel/video/imagen, TODO EN PAUSA. Se lanza con `reanudar <campaña>`.
//         Los reels son ids de Instagram y usan su propio texto; videos e imágenes
//         subidos necesitan --texto.
//   agregar <conjunto> [--reels ...] [--videos ...] [--imagenes ...] [--texto "..."] [--confirmar]
//         Suma anuncios a un conjunto que ya existe.
//   medir [--desde 2026-10-23]     conversaciones y ventas a ≤30 días por anuncio
//                                  (cruza conversaciones_whatsapp.anuncio_origen; solo lectura)
//
// Necesita en .env.local:
//  - META_ADS_TOKEN       token de usuario del sistema (no vence) con ads_management,
//                         ads_read, business_management, pages_show_list,
//                         pages_read_engagement, pages_manage_ads
//  - META_ADS_ACCOUNT_ID  id de la cuenta publicitaria, con o sin "act_"
//  - META_ADS_PAGE_ID     opcional: si falta se usa la primera página de la cuenta
//  - META_WHATSAPP_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID para el número de destino
//  - DATABASE_URL         solo para `medir`
//
// En CLP los montos van en pesos enteros (el peso no tiene centavos en Meta).
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import postgres from "postgres";

const API = "https://graph.facebook.com/v25.0";
// Prieto Norte 71, Temuco (dirección de la landing).
const LOCAL = { lat: -38.7365, lng: -72.596 };

const token = process.env.META_ADS_TOKEN;
const cuentaRaw = process.env.META_ADS_ACCOUNT_ID;
const [comando, ...resto] = process.argv.slice(2);
const confirmar = resto.includes("--confirmar");
const arg = (nombre: string) => {
  const i = resto.indexOf(nombre);
  return i >= 0 ? resto[i + 1] : undefined;
};
// --confirmar es la única bandera sin valor; el resto se come el argumento siguiente.
const posicionales = resto.filter((a, i) => !a.startsWith("--") && !(resto[i - 1]?.startsWith("--") && resto[i - 1] !== "--confirmar"));

if (comando !== "medir" && (!token || !cuentaRaw)) {
  console.error("Falta META_ADS_TOKEN o META_ADS_ACCOUNT_ID en .env.local");
  process.exit(1);
}
const cuenta = cuentaRaw?.startsWith("act_") ? cuentaRaw : `act_${cuentaRaw}`;

type Fila = Record<string, unknown>;
class Salir extends Error {}

function explicar(e: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string }): never {
  console.error(`Meta respondió: ${e.error_user_msg ?? e.message ?? JSON.stringify(e)}`);
  if (e.code === 190) console.error("-> El token venció o no es válido: genera uno de usuario del sistema con vencimiento \"Nunca\".");
  if (e.code === 200 || e.code === 10) console.error("-> Al token le falta un permiso (ads_management/pages_manage_ads) o acceso a la cuenta/página.");
  if (e.code === 100) console.error("-> Algún id o parámetro no es válido.");
  // throw y no process.exit: salir con un fetch abierto revienta node en Windows.
  throw new Salir();
}

async function graph(ruta: string, params: Record<string, string> = {}, metodo: "GET" | "POST" = "GET", t = token): Promise<Fila> {
  const url = new URL(`${API}/${ruta}`);
  const init: RequestInit = { method: metodo, headers: { Authorization: `Bearer ${t}` } };
  if (metodo === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else init.body = new URLSearchParams(params);
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok || body.error) explicar(body.error ?? {});
  return body;
}

async function todas(ruta: string, params: Record<string, string>): Promise<Fila[]> {
  const filas: Fila[] = [];
  let pag = await graph(ruta, params);
  for (;;) {
    filas.push(...(pag.data as Fila[]));
    const next = (pag.paging as { next?: string } | undefined)?.next;
    if (!next) return filas;
    const res = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    pag = await res.json();
    if (pag.error) explicar(pag.error as Fila);
  }
}

const pesos = (v: unknown) => (v == null || v === "" ? "-" : `$${Number(v).toLocaleString("es-CL")}`);

async function pagina(): Promise<{ id: string; name: string }> {
  const paginas = (await graph(`${cuenta}/promote_pages`, { fields: "id,name" })).data as { id: string; name: string }[];
  const elegida = process.env.META_ADS_PAGE_ID ? paginas.find((p) => p.id === process.env.META_ADS_PAGE_ID) : paginas[0];
  if (!elegida) {
    console.error("La cuenta publicitaria no tiene una página asignada al token (o META_ADS_PAGE_ID no está entre ellas).");
    process.exit(1);
  }
  return elegida;
}

async function numeroWhatsapp(): Promise<string | undefined> {
  const id = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  if (!id || !process.env.META_WHATSAPP_TOKEN) return undefined;
  const n = await graph(id, { fields: "display_phone_number" }, "GET", process.env.META_WHATSAPP_TOKEN);
  return String(n.display_phone_number).replace(/\D/g, "");
}

async function estado() {
  const yo = await graph("me", { fields: "id,name" });
  const permisos = ((await graph("me/permissions")).data as { permission: string; status: string }[])
    .filter((p) => p.status === "granted").map((p) => p.permission);
  const c = await graph(cuenta, { fields: "name,account_status,currency,timezone_name,amount_spent,spend_cap" });
  console.log(`Token de: ${yo.name} (${yo.id})`);
  const faltan = ["ads_management", "ads_read", "pages_manage_ads", "pages_read_engagement"].filter((p) => !permisos.includes(p));
  console.log(`Permisos: ${permisos.join(", ")}${faltan.length ? `\n  FALTAN: ${faltan.join(", ")}` : ""}`);
  console.log(`Cuenta: ${c.name} (${cuenta}), estado ${c.account_status === 1 ? "activa" : c.account_status}, ${c.currency}, ${c.timezone_name}, gastado histórico ${pesos(c.amount_spent)}`);
  const p = await pagina();
  console.log(`Página: ${p.name} (${p.id})`);
  console.log(`WhatsApp de destino: ${(await numeroWhatsapp()) ?? "no se pudo leer (revisa META_WHATSAPP_*)"}`);
}

async function listar() {
  const dias = Number(arg("--dias") ?? 7);
  const hasta = new Date().toISOString().slice(0, 10);
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const rango = JSON.stringify({ since: desde, until: hasta });
  const campanas = await todas(`${cuenta}/campaigns`, { fields: "id,name,effective_status,objective,daily_budget,lifetime_budget", limit: "200" });
  const conjuntos = await todas(`${cuenta}/adsets`, { fields: "id,name,campaign_id,effective_status,daily_budget,lifetime_budget,end_time", limit: "200" });
  const gasto = await todas(`${cuenta}/insights`, { level: "adset", fields: "adset_id,spend,actions", time_range: rango, limit: "500" });
  const porConjunto = new Map(gasto.map((g) => [g.adset_id as string, g]));
  const conv = (g?: Fila) => (g?.actions as { action_type: string; value: string }[] | undefined)
    ?.find((a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? "0";
  console.log(`Gasto y conversaciones de los últimos ${dias} días (${desde} a ${hasta}):\n`);
  for (const c of campanas) {
    console.log(`[${c.effective_status}] ${c.name}  id ${c.id}  ${c.objective}${c.daily_budget ? `  ${pesos(c.daily_budget)}/día` : ""}`);
    for (const s of conjuntos.filter((s) => s.campaign_id === c.id)) {
      const g = porConjunto.get(s.id as string);
      const presupuesto = s.daily_budget ? `${pesos(s.daily_budget)}/día` : s.lifetime_budget ? `${pesos(s.lifetime_budget)} total` : "";
      console.log(`    [${s.effective_status}] ${s.name}  id ${s.id}  ${presupuesto}  gasto ${pesos(g?.spend ?? 0)}  conversaciones ${conv(g)}`);
    }
  }
  if (!campanas.length) console.log("La cuenta no tiene campañas.");
}

async function cambiar(id: string, cambios: Record<string, string>, descripcion: string) {
  const actual = await graph(id, { fields: "name,effective_status,daily_budget" });
  console.log(`${actual.name} (${id}), hoy ${actual.effective_status}${actual.daily_budget ? `, ${pesos(actual.daily_budget)}/día` : ""}`);
  if (!confirmar) {
    console.log(`Se haría: ${descripcion}. Agrega --confirmar para mandarlo.`);
    return;
  }
  await graph(id, cambios, "POST");
  console.log(`Hecho: ${descripcion}.`);
}

// Un anuncio sale de un reel ya publicado en Instagram (usa su video y su
// texto tal cual), de un video o de una imagen subidos con --texto.
type Fuente = { reel: string } | { video: string } | { imagen: string };

function fuentes(): Fuente[] {
  const lista = (n: string) => (arg(n) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return [
    ...lista("--reels").map((reel) => ({ reel })),
    ...lista("--videos").map((video) => ({ video })),
    ...lista("--imagenes").map((imagen) => ({ imagen })),
  ];
}

const describir = (f: Fuente) => ("reel" in f ? `reel de Instagram ${f.reel}` : "video" in f ? `video ${basename(f.video)}` : `imagen ${basename(f.imagen)}`);

// Botón "Enviar mensaje de WhatsApp". Meta exige el link aunque abra la app.
const BOTON_WSP = { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP", link: "https://api.whatsapp.com/send" } };

async function instagram(pageId: string): Promise<string> {
  const p = await graph(pageId, { fields: "instagram_business_account" });
  const ig = (p.instagram_business_account as { id?: string } | undefined)?.id;
  if (!ig) {
    console.error("La página no tiene una cuenta de Instagram conectada: no se pueden usar reels.");
    throw new Salir();
  }
  return ig;
}

// Sube el video y espera a que Meta lo procese: el creativo necesita su miniatura.
async function subirVideo(ruta: string): Promise<{ id: string; miniatura: string }> {
  const form = new FormData();
  form.set("source", new Blob([readFileSync(ruta)]), basename(ruta));
  const res = await fetch(`${API}/${cuenta}/advideos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const body = await res.json();
  if (!res.ok || body.error) explicar(body.error ?? {});
  for (let i = 0; i < 60; i++) {
    const v = await graph(body.id, { fields: "status" });
    const estado = (v.status as { video_status?: string }).video_status;
    if (estado === "ready") break;
    if (estado === "error") {
      console.error(`Meta no pudo procesar ${ruta}.`);
      throw new Salir();
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  const miniaturas = (await graph(`${body.id}/thumbnails`)).data as { uri: string; is_preferred: boolean }[];
  const miniatura = (miniaturas.find((m) => m.is_preferred) ?? miniaturas[0])?.uri;
  if (!miniatura) {
    console.error(`El video ${ruta} sigue procesándose en Meta: vuelve a intentar en unos minutos.`);
    throw new Salir();
  }
  return { id: body.id, miniatura };
}

async function crearAnuncio(adsetId: string, f: Fuente, pageId: string, nombre: string, texto: string | undefined): Promise<string> {
  let creativo: Record<string, string>;
  if ("reel" in f) {
    creativo = {
      object_id: pageId,
      instagram_user_id: await instagram(pageId),
      source_instagram_media_id: f.reel,
      call_to_action: JSON.stringify(BOTON_WSP),
    };
  } else if ("video" in f) {
    const v = await subirVideo(f.video);
    creativo = {
      object_story_spec: JSON.stringify({ page_id: pageId, video_data: { video_id: v.id, image_url: v.miniatura, message: texto, call_to_action: BOTON_WSP } }),
    };
  } else {
    const img = await graph(`${cuenta}/adimages`, { bytes: readFileSync(f.imagen).toString("base64") }, "POST");
    const hash = Object.values(img.images as Record<string, { hash: string }>)[0].hash;
    creativo = {
      object_story_spec: JSON.stringify({
        page_id: pageId,
        link_data: { message: texto, image_hash: hash, link: "https://api.whatsapp.com/send", call_to_action: BOTON_WSP },
      }),
    };
  }
  const cr = await graph(`${cuenta}/adcreatives`, { name: `${nombre} - ${describir(f)}`, ...creativo }, "POST");
  const a = await graph(`${cuenta}/ads`, { name: `${nombre} - ${describir(f)}`, adset_id: adsetId, creative: JSON.stringify({ creative_id: cr.id }), status: "ACTIVE" }, "POST");
  return String(a.id);
}

function validarFuentes(lista: Fuente[], texto: string | undefined) {
  if (!lista.length) {
    console.error("Falta al menos un --reels, --videos o --imagenes (separados por coma).");
    throw new Salir();
  }
  if (!texto && lista.some((f) => !("reel" in f))) {
    console.error("Los videos e imágenes subidos necesitan --texto (los reels usan su propio texto).");
    throw new Salir();
  }
}

async function crear() {
  const nombre = arg("--nombre");
  const texto = arg("--texto");
  const lista = fuentes();
  if (!nombre) {
    console.error('Falta --nombre. Ej: crear --nombre "Primera vez" --reels 1813...,1809...');
    throw new Salir();
  }
  validarFuentes(lista, texto);
  const presupuesto = Number(arg("--presupuesto") ?? 2000);
  const radio = Number(arg("--radio") ?? 8);
  const p = await pagina();
  const wsp = await numeroWhatsapp();

  const targeting = {
    geo_locations: { custom_locations: [{ latitude: LOCAL.lat, longitude: LOCAL.lng, radius: radio, distance_unit: "kilometer" }], location_types: ["home", "recent"] },
    age_min: Number(arg("--edad-min") ?? 18),
    age_max: Number(arg("--edad-max") ?? 65),
    // Sin Advantage+ (pedido del usuario, 26-oct-2026): ubicaciones elegidas a
    // mano (sin Audience Network ni Messenger), solo celular, y sin expandir el
    // público a similares ni a intereses.
    publisher_platforms: ["facebook", "instagram"],
    facebook_positions: ["feed", "story", "facebook_reels"],
    instagram_positions: ["stream", "story", "reels", "explore"],
    device_platforms: ["mobile"],
    targeting_relaxation_types: { lookalike: 0, custom_audience: 0 },
    targeting_automation: { advantage_audience: 0 },
  };

  console.log(`Página ${p.name}, WhatsApp ${wsp ?? "(el de la página)"}`);
  console.log(`Campaña: ${nombre}, ${pesos(presupuesto)}/día (~${pesos(presupuesto * 30)}/mes), radio ${radio} km de Prieto Norte 71, edad ${targeting.age_min}-${targeting.age_max}`);
  for (const f of lista) console.log(`  Anuncio: ${describir(f)}`);
  if (texto) console.log(`Texto: ${texto}`);
  if (!confirmar) {
    console.log("\nNo se creó nada. Agrega --confirmar para crearla (queda EN PAUSA, no gasta hasta `reanudar`).");
    return;
  }
  const c = await graph(`${cuenta}/campaigns`, {
    name: nombre,
    objective: "OUTCOME_ENGAGEMENT",
    status: "PAUSED",
    special_ad_categories: "[]",
    is_adset_budget_sharing_enabled: "false",
  }, "POST");
  // Conjunto y anuncios quedan activos dentro de la campaña pausada: basta
  // reanudar la campaña para lanzarla.
  const s = await graph(`${cuenta}/adsets`, {
    campaign_id: String(c.id),
    name: `${nombre} - Temuco ${radio} km`,
    daily_budget: String(presupuesto),
    billing_event: "IMPRESSIONS",
    optimization_goal: "CONVERSATIONS",
    destination_type: "WHATSAPP",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    promoted_object: JSON.stringify({ page_id: p.id, ...(wsp ? { whatsapp_phone_number: wsp } : {}) }),
    targeting: JSON.stringify(targeting),
    status: "ACTIVE",
  }, "POST");
  const anuncios = [];
  for (const f of lista) anuncios.push(await crearAnuncio(String(s.id), f, p.id, nombre, texto));
  console.log(`\nCreada EN PAUSA. Campaña ${c.id}, conjunto ${s.id}, anuncios ${anuncios.join(", ")}.`);
  console.log(`Sumar más videos: agregar ${s.id} --videos a.mp4,b.mp4 --texto "..." --confirmar`);
  console.log(`Lanzarla: reanudar ${c.id} --confirmar`);
}

async function agregar() {
  const adsetId = posicionales[0];
  const texto = arg("--texto");
  const lista = fuentes();
  if (!adsetId) {
    console.error("Uso: agregar <id del conjunto> --reels ... | --videos ... | --imagenes ... [--texto ...] [--confirmar]");
    throw new Salir();
  }
  validarFuentes(lista, texto);
  const s = await graph(adsetId, { fields: "name,campaign{name}" });
  console.log(`Conjunto ${s.name} (${adsetId})`);
  for (const f of lista) console.log(`  Anuncio nuevo: ${describir(f)}`);
  if (!confirmar) {
    console.log("\nNo se creó nada. Agrega --confirmar para sumarlos (entran a rotar cuando Meta los aprueba, si la campaña está activa).");
    return;
  }
  const p = await pagina();
  const nombre = (s.campaign as { name: string }).name;
  for (const f of lista) console.log(`Anuncio ${await crearAnuncio(adsetId, f, p.id, nombre, texto)}: ${describir(f)}`);
}

async function medir() {
  const desde = arg("--desde") ?? "2026-10-23";
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const filas = await sql.begin(async (tx) => {
      await tx.unsafe("set transaction read only");
      return tx.unsafe(`
        select coalesce(cw.anuncio_origen->>'source_id', '?') as anuncio,
               max(cw.anuncio_origen->>'headline') as titulo,
               count(*) as conversaciones,
               count(cl.id) as con_ficha,
               count(cl.id) filter (where cl.creado_en < cw.anuncio_origen_en) as ya_eran_clientes,
               count(distinct v.cliente_id) as compraron_30d,
               coalesce(sum(v.precio), 0) as ventas_30d
        from conversaciones_whatsapp cw
        left join clientes cl on cl.id = cw.cliente_id
        left join ventas v on v.cliente_id = cl.id
             and v.fecha >= cw.anuncio_origen_en
             and v.fecha < cw.anuncio_origen_en + interval '30 days'
        where cw.anuncio_origen is not null
          and cw.anuncio_origen_en >= ($1::date at time zone 'America/Santiago')
        group by 1 order by conversaciones desc`, [desde]);
    });
    // Cupones del flujo que abre el anuncio (LOTE_ANUNCIO en src/lib/whatsapp/router.ts).
    const [cupones] = await sql`
      select count(*)::int as emitidos, count(*) filter (where usado)::int as usados
      from cupones where nombre_lote = 'WhatsApp - Anuncio Meta'
        and creado_en >= (${desde}::date at time zone 'America/Santiago')`;
    console.log(`Cupones de $2.000 del anuncio: ${cupones.emitidos} entregados, ${cupones.usados} usados en el local.`);
    if (!filas.length) console.log(`Ninguna conversación vino de un anuncio desde el ${desde}.`);
    else console.table(filas);
    console.log("ventas_30d suma ventas.precio (incluye renovaciones de quien ya era cliente: mira ya_eran_clientes).");
  } finally {
    await sql.end();
  }
}

try {
  switch (comando) {
    case "estado": await estado(); break;
    case "listar": await listar(); break;
    case "pausar": await cambiar(posicionales[0], { status: "PAUSED" }, "pausar"); break;
    case "reanudar": await cambiar(posicionales[0], { status: "ACTIVE" }, "activar"); break;
    case "presupuesto": {
      const [id, monto] = posicionales;
      if (!id || !Number(monto)) {
        console.error("Uso: presupuesto <id> <pesos por día> [--confirmar]");
        process.exit(1);
      }
      await cambiar(id, { daily_budget: String(Math.round(Number(monto))) }, `dejar el presupuesto en ${pesos(monto)}/día`);
      break;
    }
    case "crear": await crear(); break;
    case "agregar": await agregar(); break;
    case "medir": await medir(); break;
    default:
      console.log("Comandos: estado | listar | pausar <id> | reanudar <id> | presupuesto <id> <pesos> | crear ... | agregar <conjunto> ... | medir. Ver cabecera del script.");
  }
} catch (e) {
  if (!(e instanceof Salir)) throw e;
  process.exitCode = 1;
}
