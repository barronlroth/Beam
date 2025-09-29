export interface Env {
  BEAM_KV: KVNamespace;
  API_VERSION: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export interface DeviceRecord {
  deviceId: string;
  keyHash: string;
  name: string;
  subscription: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PendingItem {
  itemId: string;
  deviceId: string;
  url: string;
  sentAt: string;
  createdAt: string;
}
