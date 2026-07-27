// Service worker del Portal Cliente PWA (src/app/cliente). Solo maneja
// notificaciones push (ver @/lib/push/enviar) — no cachea nada offline
// todavía, así que no hay evento "fetch" acá.

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
