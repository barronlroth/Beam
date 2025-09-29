export interface Env {
  BEAM_KV: KVNamespace;
  API_VERSION: string;
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
