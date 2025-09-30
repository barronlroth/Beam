import { vi } from "vitest";

if (!(globalThis as any).chrome) {
  (globalThis as any).chrome = {};
}

const chrome = (globalThis as any).chrome;

chrome.runtime = chrome.runtime || {
  sendMessage: vi.fn(),
  id: "test-extension",
  getURL: vi.fn((path: string) => path),
  onStartup: {
    addListener: vi.fn()
  },
  onMessage: {
    addListener: vi.fn()
  }
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
  clear: vi.fn(),
  onAlarm: {
    addListener: vi.fn()
  }
};

chrome.notifications = chrome.notifications || {
  create: vi.fn((id, options, callback) => {
    if (typeof callback === "function") {
      callback("mock-notification");
    }
    return "mock-notification";
  })
};
