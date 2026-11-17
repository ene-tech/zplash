"use client";

// Puente con la app nativa (Capacitor, carpeta app-movil/). La app carga este
// mismo sitio y le inyecta window.Capacitor con sus plugins, así que la web no
// necesita el paquete de Capacitor: si window.Capacitor no está, es un
// navegador normal y todo esto no hace nada.

type Listener = { remove: () => Promise<void> };

type PushNotificationsPlugin = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(evento: "registration", cb: (t: { value: string }) => void): Promise<Listener>;
  addListener(evento: "registrationError", cb: (e: unknown) => void): Promise<Listener>;
  addListener(evento: "pushNotificationActionPerformed", cb: (a: { notification: { data?: { url?: string } } }) => void): Promise<Listener>;
};

// Plugin propio (app-movil/android/.../GeocercaPlugin.java).
// "activa": vigilando la zona. "sin_permiso": negó la ubicación.
// "sin_permiso_fondo": dio ubicación solo "mientras se usa la app", que no
// alcanza para avisar con la app cerrada.
export type EstadoGeocerca = "activa" | "sin_permiso" | "sin_permiso_fondo" | "inactiva";

type GeocercaPlugin = {
  activar(opts: { lat: number; lng: number; radio: number; token: string; url: string; pedirPermiso: boolean }): Promise<{ estado: EstadoGeocerca }>;
  abrirAjustes(): Promise<void>;
};

type CapacitorGlobal = {
  isNativePlatform(): boolean;
  Plugins: { PushNotifications?: PushNotificationsPlugin; Geocerca?: GeocercaPlugin };
};

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return c?.isNativePlatform() ? c : null;
}

export function enAppNativa(): boolean {
  return !!capacitor();
}

/** Pide (si `pedirPermiso`) el permiso de notificaciones y devuelve el token
 * de Firebase del teléfono, o null si no hay permiso. */
async function tokenPush(pedirPermiso: boolean): Promise<string | null> {
  const push = capacitor()?.Plugins.PushNotifications;
  if (!push) return null;
  let { receive } = await push.checkPermissions();
  if (receive !== "granted" && pedirPermiso) ({ receive } = await push.requestPermissions());
  if (receive !== "granted") return null;
  return new Promise((resolve) => {
    const listeners: (Promise<Listener> | Listener | undefined)[] = [];
    // Si Firebase está mal configurado puede no llegar ningún evento: a los
    // 15 s se da por fallido para que el botón no quede pegado.
    const reloj = setTimeout(() => terminar(null), 15_000);
    const terminar = (t: string | null) => {
      clearTimeout(reloj);
      resolve(t);
      // Sin el paquete de Capacitor en la web, addListener del puente nativo
      // no siempre devuelve una promesa: se envuelve para no reventar acá.
      listeners.forEach((l) =>
        Promise.resolve(l)
          .then((x) => x?.remove?.())
          .catch(() => {}),
      );
    };
    listeners.push(push.addListener("registration", (t) => terminar(t.value)));
    listeners.push(push.addListener("registrationError", () => terminar(null)));
    Promise.resolve(push.register()).catch(() => terminar(null));
  });
}

export type EstadoAvisosApp = { push: boolean; geocerca: EstadoGeocerca };

/** Registra el teléfono para push en la cuenta de la sesión y prende la
 * geocerca con la zona configurada. Con `pedirPermiso` false solo refresca lo
 * ya autorizado (al abrir Mi Cuenta: el token de Firebase puede rotar). */
export async function activarAvisosApp(pedirPermiso: boolean): Promise<EstadoAvisosApp> {
  const token = await tokenPush(pedirPermiso);
  if (!token) return { push: false, geocerca: "inactiva" };
  const guardado = await fetch("/api/cliente/push/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fcmToken: token }),
  });
  // Sin el token guardado (sesión vencida, error de base) no llegaría ningún
  // aviso: no se da por activo.
  if (!guardado.ok) return { push: false, geocerca: "inactiva" };

  const geocerca = capacitor()?.Plugins.Geocerca;
  if (!geocerca) return { push: true, geocerca: "inactiva" };
  const zona = (await fetch("/api/app/geocerca").then((r) => r.json())) as { activa: boolean; lat?: number; lng?: number; radio?: number };
  if (!zona.activa || zona.lat == null || zona.lng == null || zona.radio == null) return { push: true, geocerca: "inactiva" };
  const { estado } = await geocerca.activar({
    lat: zona.lat,
    lng: zona.lng,
    radio: zona.radio,
    token,
    url: `${window.location.origin}/api/app/geocerca`,
    pedirPermiso,
  });
  return { push: true, geocerca: estado };
}

export function abrirAjustesApp(): void {
  capacitor()?.Plugins.Geocerca?.abrirAjustes();
}

/** Tocar una notificación abre la página que trae (ej. /cliente). */
export function escucharToquesPush(): void {
  capacitor()?.Plugins.PushNotifications?.addListener("pushNotificationActionPerformed", (a) => {
    const url = a.notification.data?.url;
    // Solo rutas del mismo sitio ("//otro.com" sería otro dominio).
    if (url?.startsWith("/") && !url.startsWith("//")) window.location.href = url;
  });
}
