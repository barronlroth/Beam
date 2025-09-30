export interface RegisterDevicePayload {
  apiBaseUrl: string;
  deviceName: string;
}

export interface RegistrationDeps {
  fetch: typeof fetch;
  crypto: Crypto;
  storage: StorageLike;
  getSubscription: () => Promise<PushSubscriptionLike>;
}

export interface StorageLike {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

export interface PushSubscriptionLike {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export interface RegistrationResult {
  deviceId: string;
  inboxKey: string;
}

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const toBase64Url = (bytes: Uint8Array): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const generateDeviceId = (crypto: Crypto): string => {
  const random = new Uint8Array(6);
  crypto.getRandomValues(random);
  return `chr_${toHex(random)}`;
};

const generateInboxKey = (crypto: Crypto): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

interface StoredDeviceRecord {
  deviceId: string;
  inboxKey: string;
  apiBaseUrl: string;
  name?: string;
}

export const registerDevice = async (
  deps: RegistrationDeps,
  payload: RegisterDevicePayload
): Promise<RegistrationResult> => {
  const deviceId = generateDeviceId(deps.crypto);
  const inboxKey = generateInboxKey(deps.crypto);

  const keyHashBuffer = await deps.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(inboxKey)
  );
  const keyHash = toHex(new Uint8Array(keyHashBuffer));

  const subscription = await deps.getSubscription();

  const response = await deps.fetch(`${payload.apiBaseUrl}/v1/devices`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      deviceId,
      keyHash,
      subscription,
      name: payload.deviceName
    })
  });

  if (response.status >= 400) {
    throw new Error(`Device registration failed with status ${response.status}`);
  }

  await deps.storage.set("beam.device", {
    deviceId,
    inboxKey,
    apiBaseUrl: payload.apiBaseUrl,
    name: payload.deviceName
  });

  return { deviceId, inboxKey };
};

export const ensureDeviceRegistration = async (
  deps: RegistrationDeps,
  payload: RegistrationDeps & RegisterDevicePayload extends never ? never : RegisterDevicePayload
): Promise<RegistrationResult> => {
  const existing = (await deps.storage.get("beam.device")) as
    | { deviceId: string; inboxKey: string; apiBaseUrl: string }
    | undefined;

  if (existing && existing.deviceId && existing.inboxKey && existing.apiBaseUrl === payload.apiBaseUrl) {
    return { deviceId: existing.deviceId, inboxKey: existing.inboxKey };
  }

  return registerDevice(deps, payload);
};

const getStoredDevice = async (
  storage: RegistrationDeps["storage"]
): Promise<StoredDeviceRecord> => {
  const existing = (await storage.get("beam.device")) as StoredDeviceRecord | undefined;
  if (!existing || !existing.deviceId || !existing.inboxKey || !existing.apiBaseUrl) {
    throw new Error("Device not registered");
  }
  return existing;
};

export const rotateDeviceKey = async (
  deps: RegistrationDeps,
  options?: { deviceName?: string }
): Promise<RegistrationResult> => {
  const device = await getStoredDevice(deps.storage);
  const newInboxKey = generateInboxKey(deps.crypto);

  const keyHashBuffer = await deps.crypto.subtle.digest("SHA-256", encoder.encode(newInboxKey));
  const keyHash = toHex(new Uint8Array(keyHashBuffer));

  const response = await deps.fetch(`${device.apiBaseUrl}/v1/devices/${device.deviceId}/rotate-key`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Inbox-Key": device.inboxKey
    },
    body: JSON.stringify({
      keyHash,
      ...(options?.deviceName ? { name: options.deviceName } : {})
    })
  });

  if (response.status >= 400) {
    throw new Error(`Key rotation failed with status ${response.status}`);
  }

  const updated: StoredDeviceRecord = {
    ...device,
    inboxKey: newInboxKey,
    name: options?.deviceName ?? device.name
  };
  await deps.storage.set("beam.device", updated);

  return { deviceId: device.deviceId, inboxKey: newInboxKey };
};
