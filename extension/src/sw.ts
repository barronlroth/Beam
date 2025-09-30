import { ensureDeviceRegistration, rotateDeviceKey } from "./serviceWorker";
import { handleInstall, handlePush, handleStartup, resetRuntimeState } from "./swRuntime";
import { scheduleCatchUp, resetRuntimeState as resetAlarmState } from "./swAlarms";

const globalAny = globalThis as any;

const NOTIFICATION_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

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

const performRegistration = async () => {
  await handleInstall({
    storage: {
      get: readStorageValue
    },
    ensureDeviceRegistration: ({ apiBaseUrl, deviceName }) =>
      ensureDeviceRegistration(createRegistrationDeps(), { apiBaseUrl, deviceName })
  });
  scheduleCatchUp(5);
  return readStorageValue("beam.device");
};

const rotateKeyWithConfig = async () => {
  const config = await readStorageValue("beam.config");
  const deviceName = config?.deviceName;
  const result = await rotateDeviceKey(createRegistrationDeps(), {
    deviceName: typeof deviceName === "string" ? deviceName : undefined
  });
  return {
    result,
    device: await readStorageValue("beam.device")
  };
};

registerListener("install", (event: ExtendableEvent) => {
  const promise = (async () => {
    try {
      await performRegistration();
    } catch (error) {
      if (error instanceof Error && /beam\.config/i.test(error.message)) {
        console.warn("Beam Lite: missing config during install; complete setup in options page");
        return;
      }
      throw error;
    }
  })().catch((error) => {
    console.error("Beam install failed", error);
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
  now: () => Date.now(),
  notify: ({ title, message, url }: { title: string; message: string; url: string }) => {
    const notifications = globalAny.chrome?.notifications;
    const runtime = globalAny.chrome?.runtime;
    if (!notifications?.create) return Promise.resolve();
    const notificationId = `beam-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const iconUrl = runtime?.getURL ? runtime.getURL("icon128.png") : NOTIFICATION_ICON_DATA_URL;
    const options: chrome.notifications.NotificationOptions<true> = {
      type: "basic",
      iconUrl,
      title,
      message,
      contextMessage: url,
      priority: 0
    };
    return new Promise<void>((resolve) => {
      notifications.create(notificationId, options, () => resolve());
    });
  }
});

registerListener("push", (event: PushEvent) => {
  const payload = event.data?.json?.() ?? {};
  Promise.resolve(handlePush(buildPushDeps(), payload)).catch((error) => {
    console.error("Beam push handling failed", error);
  });
});

registerListener("activate", () => {
  resetRuntimeState();
  resetAlarmState();
});

const runtimeApi = globalAny.chrome?.runtime;
runtimeApi?.onMessage?.addListener((message: { type?: string } | undefined, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  if (message.type === "beam.register") {
    performRegistration()
      .then((device) => {
        sendResponse({ ok: true, device });
      })
      .catch((error: unknown) => {
        console.error("Beam manual registration failed", error);
        const messageText = error instanceof Error ? error.message : "Unknown registration error";
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  if (message.type === "beam.rotate-key") {
    rotateKeyWithConfig()
      .then(({ device, result }) => {
        sendResponse({ ok: true, device, result });
      })
      .catch((error: unknown) => {
        console.error("Beam key rotation failed", error);
        const messageText = error instanceof Error ? error.message : "Unknown rotation error";
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }

  return false;
});

runtimeApi?.onStartup?.addListener(() => {
  Promise.resolve(handleStartup(buildPushDeps())).catch((error) => {
    console.error("Beam startup catch-up failed", error);
  });
});

const alarmsApi = globalAny.chrome?.alarms;
alarmsApi?.onAlarm?.addListener((alarm: chrome.alarms.Alarm) => {
  if (alarm?.name !== "beam-catchup") return;
  Promise.resolve(handleStartup(buildPushDeps())).catch((error) => {
    console.error("Beam alarm catch-up failed", error);
  });
});

export {};
