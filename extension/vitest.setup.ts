import { vi } from "vitest";

if (!(globalThis as any).chrome) {
  (globalThis as any).chrome = {};
}

const chrome = (globalThis as any).chrome;

chrome.runtime = chrome.runtime || {
  sendMessage: vi.fn(),
  id: "test-extension"
};

chrome.storage = chrome.storage || {
  local: {
    get: vi.fn((keys, callback) => {
      callback({});
    }),
    set: vi.fn((items, callback) => {
      callback?.();
    })
  }
};

chrome.tabs = chrome.tabs || {
  create: vi.fn()
};

chrome.alarms = chrome.alarms || {
  create: vi.fn(),
  clear: vi.fn()
};
