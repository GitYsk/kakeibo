export interface UpdateAPI {
  apply: () => void;
  check: () => Promise<void>;
}
export function registerUpdates(
  onReady: () => void,
  onOfflineReady: () => void,
): UpdateAPI {
  let registration: ServiceWorkerRegistration | undefined;
  let requested = false;
  let controlled = !!navigator.serviceWorker?.controller;
  const check = async () => {
    if (registration && navigator.onLine)
      await registration.update().catch(() => undefined);
    if (registration?.waiting) onReady();
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (requested) location.reload();
      else if (controlled) onReady();
      else {
        controlled = true;
        onOfflineReady();
      }
    });
    void navigator.serviceWorker
      .register(import.meta.env.BASE_URL + "sw.js", {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((r) => {
        registration = r;
        if (r.waiting) onReady();
        r.addEventListener("updatefound", () => {
          const worker = r.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") {
              if (navigator.serviceWorker.controller) onReady();
              else onOfflineReady();
            }
          });
        });
        void check();
      })
      .catch(() => undefined);
  }
  return {
    check,
    apply: () => {
      requested = true;
      if (registration?.waiting)
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      else location.reload();
    },
  };
}
