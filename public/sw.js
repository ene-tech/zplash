// Service worker de toda la app (Operador, Admin, Portal Cliente, etc.),
// registrado desde RegisterServiceWorker.tsx en el layout raíz.
//
// A propósito NO cachea HTML, JS/CSS ni respuestas de API: los bundles de
// Next.js quedan servidos por Vercel, y cachear la navegación o los chunks a
// mano (sin una herramienta de precache como next-pwa/workbox) es la forma
// clásica de dejar a un usuario con JS viejo después de un deploy — ver la
// discusión que originó este archivo. Lo único que cachea son las imágenes
// de marca fijas (logo/íconos), con stale-while-revalidate: sirve la copia
// cacheada al toque y la refresca en segundo plano, así un logo desactualizado
// se autocorrige en la carga siguiente sin arriesgar nada del resto del sitio.

const CACHE_NAME = "zplash-static-v1";
const ASSETS_CACHEABLES = ["/logo.png", "/icon-192.png", "/icon-512.png", "/icon.png", "/apple-icon.png"];

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !ASSETS_CACHEABLES.includes(url.pathname)) {
    return; // deja pasar todo lo demás (HTML, JS, API) directo a la red
  }
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cacheada = await cache.match(event.request);
      const enRed = fetch(event.request)
        .then((respuesta) => {
          if (respuesta.ok) cache.put(event.request, respuesta.clone());
          return respuesta;
        })
        .catch(() => cacheada);
      return cacheada || enRed;
    })
  );
});

self.addEventListener("push", (event) => {
  let datos = { title: "ZPlash", body: "" };
  try {
    if (event.data) datos = event.data.json();
  } catch {
    // sin payload JSON válido, se usa el default de arriba
  }
  event.waitUntil(
    self.registration.showNotification(datos.title || "ZPlash", {
      body: datos.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: datos.url || "/cliente" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/cliente";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
