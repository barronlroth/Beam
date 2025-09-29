import type { RegistrationResult } from "./serviceWorker";

export interface InstallDeps {
  storage: {
    get: (key: string) => Promise<any>;
  };
  ensureDeviceRegistration: (payload: { apiBaseUrl: string; deviceName: string }) => Promise<RegistrationResult>;
}

export interface PushPayload {
  itemId: string;
  url: string;
  sentAt?: string;
}

export interface PushDeps {
  storage: {
    get: (key: string) => Promise<any>;
  };
  fetch: typeof fetch;
  tabsCreate: (createProperties: { url: string; active?: boolean }) => Promise<unknown> | unknown;
  now: () => number;
  delay?: (ms: number, cb: () => void) => unknown;
}

interface DeviceRecord {
  deviceId: string;
  inboxKey: string;
  apiBaseUrl: string;
  name?: string;
}

const RECENT_URL_WINDOW_MS = 60_000;
const STORM_WINDOW_MS = 1_000;
const MAX_TABS_PER_WINDOW = 3;

let cachedDevice: DeviceRecord | null = null;
const recentUrls = new Map<string, number>();
const openTimestamps: number[] = [];
const tabQueue: Array<{ payload: PushPayload; device: DeviceRecord }> = [];
let scheduled = false;
let processing = false;

const defaultDelay = (ms: number, cb: () => void) => setTimeout(cb, ms);

const pruneOpenTimestamps = (now: number) => {
  while (openTimestamps.length > 0 && now - openTimestamps[0] >= STORM_WINDOW_MS) {
    openTimestamps.shift();
  }
};

const ackItem = async (deps: PushDeps, device: DeviceRecord, payload: PushPayload) => {
  await deps.fetch(`${device.apiBaseUrl}/v1/items/${payload.itemId}/ack`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Inbox-Key": device.inboxKey
    }
  });
};

const openTab = async (deps: PushDeps, device: DeviceRecord, payload: PushPayload, now: number) => {
  await Promise.resolve(deps.tabsCreate({ url: payload.url, active: true }));
  recentUrls.set(payload.url, now);
  await ackItem(deps, device, payload);
};

const scheduleProcessing = (deps: PushDeps, delayMs: number) => {
  if (scheduled) return;
  scheduled = true;
  const delayFn = deps.delay ?? defaultDelay;
  delayFn(Math.max(1, delayMs), () => {
    scheduled = false;
    void processQueue(deps);
  });
};

const processQueue = async (deps: PushDeps): Promise<void> => {
  if (processing) return;
  processing = true;
  try {
    while (tabQueue.length > 0) {
      const now = deps.now();
      pruneOpenTimestamps(now);
      if (openTimestamps.length >= MAX_TABS_PER_WINDOW) {
        const wait = STORM_WINDOW_MS - (now - openTimestamps[0]);
        processing = false;
        scheduleProcessing(deps, wait);
        return;
      }
      const item = tabQueue.shift()!;
      await openTab(deps, item.device, item.payload, now);
      openTimestamps.push(now);
    }
  } finally {
    processing = false;
  }
};

const enqueueTab = async (deps: PushDeps, device: DeviceRecord, payload: PushPayload) => {
  tabQueue.push({ device, payload });
  await processQueue(deps);
};

const getDeviceRecord = async (deps: PushDeps): Promise<DeviceRecord> => {
  if (cachedDevice) return cachedDevice;
  const stored = await deps.storage.get("beam.device");
  if (!stored || !stored.deviceId || !stored.inboxKey || !stored.apiBaseUrl) {
    throw new Error("Device not registered");
  }
  cachedDevice = stored as DeviceRecord;
  return cachedDevice;
};

export const handleInstall = async (deps: InstallDeps): Promise<RegistrationResult> => {
  const config = await deps.storage.get("beam.config");
  if (!config || !config.apiBaseUrl || !config.deviceName) {
    throw new Error("Missing beam.config");
  }
  cachedDevice = null;
  return deps.ensureDeviceRegistration({
    apiBaseUrl: config.apiBaseUrl,
    deviceName: config.deviceName
  });
};

export const handlePush = async (deps: PushDeps, payload: PushPayload): Promise<void> => {
  const device = await getDeviceRecord(deps);

  const now = deps.now();
  const lastOpened = recentUrls.get(payload.url);
  if (lastOpened !== undefined && now - lastOpened < RECENT_URL_WINDOW_MS) {
    await ackItem(deps, device, payload);
    return;
  }

  await enqueueTab(deps, device, payload);
};

export const resetRuntimeState = () => {
  cachedDevice = null;
  recentUrls.clear();
  openTimestamps.length = 0;
  tabQueue.length = 0;
  scheduled = false;
  processing = false;
};

export const runtime = {
  handleInstall,
  handlePush
};
