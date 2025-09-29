import { ensureDeviceRegistration } from "./serviceWorker";
import { handleInstall, handlePush, resetRuntimeState } from "./swRuntime";

const globalAny = globalThis as any;

const getRegistry = (): Record<string, Function[]> => {
  if (!globalAny.__listeners) {
    globalAny.__listeners = {};
  }
  return globalAny.__listeners as Record<string, Function[]>;
};

type ListenerEvent = "install" | "push" | "activate";

const registerListener = (event: ListenerEvent, handler: any) => {
  const registry = getRegistry();
  if (!registry[event]) registry[event] = [];
  registry[event].push(handler);

  const scope: ServiceWorkerGlobalScope | undefined = typeof self !== "undefined" ? (self as any) : undefined;
  if (scope?.addEventListener) {
    scope.addEventListener(event, handler as EventListener);
  }
};

const readStorageValue = (key: string): Promise<any> => {
  const chromeStorage = globalAny.chrome?.storage?.local;
  if (!chromeStorage?.get) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    chromeStorage.get(key, (result: Record<string, unknown>) => {
      resolve(result?.[key]);
    });
  });
};

const writeStorageValue = (key: string, value: unknown): Promise<void> => {
  const chromeStorage = globalAny.chrome?.storage?.local;
  if (!chromeStorage?.set) return Promise.resolve();
  return new Promise((resolve) => {
    chromeStorage.set({ [key]: value }, () => resolve());
  });
};

const createRegistrationDeps = () => ({
  fetch: globalAny.fetch.bind(globalThis),
  crypto: globalAny.crypto,
  storage: {
    get: readStorageValue,
    set: writeStorageValue
  },
  getSubscription: async () => {
    if (typeof globalAny.__getPushSubscription === "function") {
      return globalAny.__getPushSubscription();
    }
    const registration = globalAny.registration;
    if (registration?.pushManager?.getSubscription) {
      const existing = await registration.pushManager.getSubscription();
      if (existing) return existing;
    }
    if (registration?.pushManager?.subscribe) {
      return registration.pushManager.subscribe({ userVisibleOnly: true });
    }
    throw new Error("Push subscription unavailable");
  }
});

registerListener("install", (event: ExtendableEvent) => {
  const promise = (async () => {
    const config = await readStorageValue("beam.config");
    if (!config?.apiBaseUrl || !config?.deviceName) {
      throw new Error("Missing beam.config");
    }
    return handleInstall({
      storage: {
        get: readStorageValue
      },
      ensureDeviceRegistration: ({ apiBaseUrl, deviceName }) =>
        ensureDeviceRegistration(createRegistrationDeps(), { apiBaseUrl, deviceName })
    });
  })().catch((error) => {
    console.error("Beam install failed", error);
    throw error;
  });

  event.waitUntil(promise);
});

const buildPushDeps = () => ({
  storage: {
    get: readStorageValue
  },
  fetch: globalAny.fetch.bind(globalThis),
  tabsCreate: (createProperties: { url: string; active?: boolean }) => {
    const tabs = globalAny.chrome?.tabs;
    if (!tabs?.create) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = tabs.create(createProperties, () => resolve(undefined));
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.then(() => resolve(undefined)).catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  },
  now: () => Date.now()
});

registerListener("push", (event: PushEvent) => {
  const payload = event.data?.json?.() ?? {};
  Promise.resolve(handlePush(buildPushDeps(), payload)).catch((error) => {
    console.error("Beam push handling failed", error);
  });
});

registerListener("activate", () => {
  resetRuntimeState();
});

export {};
