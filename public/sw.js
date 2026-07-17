/* SmartDoc — service worker kill-switch
 *
 * A stale SW was registered against /sw.js (now missing), which caused:
 *   "Failed to convert value to 'Response'"
 *   "FetchEvent for ... resulted in a network error"
 *
 * This file restores a valid SW that never breaks navigation, clears caches,
 * and unregisters itself so the app runs without a SW in development.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("navigate" in client) {
          try {
            await client.navigate(client.url);
          } catch {
            /* ignore */
          }
        }
      }
    })()
  );
});

// Always proxy to the network — never return undefined/null Response
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response("Offline", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
    )
  );
});
