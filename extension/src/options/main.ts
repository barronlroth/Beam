const DEFAULT_API_BASE_URL = "https://localhost:8787";

interface BeamConfig {
  apiBaseUrl: string;
  deviceName: string;
}

interface BeamDevice {
  deviceId: string;
  inboxKey: string;
  apiBaseUrl: string;
  name?: string;
}

interface BeamSettings {
  autoOpen?: boolean;
}

interface RegisterResponse {
  ok: boolean;
  device?: BeamDevice;
  error?: string;
}

interface RotateResponse {
  ok: boolean;
  device?: BeamDevice;
  result?: { deviceId: string; inboxKey: string };
  error?: string;
}

const elements = {
  form: document.querySelector<HTMLFormElement>("#config-form"),
  apiInput: document.querySelector<HTMLInputElement>("#apiBase"),
  nameInput: document.querySelector<HTMLInputElement>("#deviceName"),
  autoOpen: document.querySelector<HTMLInputElement>("#autoOpen"),
  saveButton: document.querySelector<HTMLButtonElement>("#saveButton"),
  rotateButton: document.querySelector<HTMLButtonElement>("#rotateButton"),
  status: document.querySelector<HTMLParagraphElement>("#status"),
  deviceId: document.querySelector<HTMLElement>("#deviceId"),
  inboxKey: document.querySelector<HTMLElement>("#inboxKey"),
  pairingJson: document.querySelector<HTMLTextAreaElement>("#pairingJson"),
  qrImage: document.querySelector<HTMLImageElement>("#qrImage"),
  copyPairing: document.querySelector<HTMLButtonElement>("#copyPairing")
};

let currentConfig: BeamConfig | undefined;
let currentDevice: BeamDevice | undefined;

const getStorageValue = async <T,>(key: string): Promise<T | undefined> => {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (value) => {
      resolve((value?.[key] as T | undefined) ?? undefined);
    });
  });
};

const setStorageValue = async (key: string, value: unknown): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
};

const sendMessage = async <T,>(payload: unknown): Promise<T> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response as T);
    });
  });
};

const setStatus = (message: string, type: "success" | "error" | "") => {
  if (!elements.status) return;
  elements.status.textContent = message;
  elements.status.classList.remove("success", "error");
  if (type) {
    elements.status.classList.add(type);
  }
};

const toggleBusy = (isBusy: boolean) => {
  elements.saveButton?.toggleAttribute("disabled", isBusy);
  elements.rotateButton?.toggleAttribute("disabled", isBusy || !currentDevice);
};

const sanitizeUrl = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.replace(/\/+$/u, "");
};

const buildPairingJson = (): string | null => {
  if (!currentConfig || !currentDevice) return null;
  const pairing = {
    name: currentDevice.name ?? currentConfig.deviceName,
    deviceId: currentDevice.deviceId,
    inboxKey: currentDevice.inboxKey,
    api: currentConfig.apiBaseUrl
  };
  return JSON.stringify(pairing, null, 2);
};

const updatePairingDisplay = () => {
  const json = buildPairingJson();
  const textarea = elements.pairingJson;
  const qr = elements.qrImage;
  const copyBtn = elements.copyPairing;

  if (!textarea || !qr || !copyBtn) return;

  if (!json) {
    textarea.value = "";
    qr.removeAttribute("src");
    copyBtn.disabled = true;
    qr.alt = "Pairing QR code unavailable";
    elements.deviceId && (elements.deviceId.textContent = "Not registered");
    elements.inboxKey && (elements.inboxKey.textContent = "Not registered");
    return;
  }

  textarea.value = json;
  copyBtn.disabled = false;
  qr.alt = "Pairing QR code";
  qr.src = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(json)}`;

  elements.deviceId && (elements.deviceId.textContent = currentDevice?.deviceId ?? "Unknown");
  elements.inboxKey && (elements.inboxKey.textContent = currentDevice?.inboxKey ?? "Unknown");
};

const loadInitialState = async () => {
  currentConfig = await getStorageValue<BeamConfig>("beam.config");
  currentDevice = await getStorageValue<BeamDevice>("beam.device");
  const settings = await getStorageValue<BeamSettings>("beam.settings");

  if (elements.apiInput) {
    elements.apiInput.value = (currentConfig?.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  }
  if (elements.nameInput) {
    elements.nameInput.value = currentConfig?.deviceName ?? "";
  }
  if (elements.autoOpen) {
    elements.autoOpen.checked = settings?.autoOpen ?? true;
  }

  updatePairingDisplay();
};

const handleSave = async (event: Event) => {
  event.preventDefault();
  if (!elements.apiInput || !elements.nameInput || !elements.autoOpen) return;

  const apiBaseUrl = sanitizeUrl(elements.apiInput.value);
  const deviceName = elements.nameInput.value.trim();

  if (!apiBaseUrl || !deviceName) {
    setStatus("Please provide both API base URL and device name.", "error");
    return;
  }

  toggleBusy(true);
  setStatus("Saving configuration...", "");

  try {
    await setStorageValue("beam.config", { apiBaseUrl, deviceName });
    await setStorageValue("beam.settings", { autoOpen: elements.autoOpen.checked });

    const response = await sendMessage<RegisterResponse>({ type: "beam.register" });
    if (!response?.ok) {
      throw new Error(response?.error ?? "Registration failed");
    }

    currentConfig = { apiBaseUrl, deviceName };
    currentDevice = response.device ?? (await getStorageValue<BeamDevice>("beam.device"));
    setStatus("Registration complete.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
  } finally {
    toggleBusy(false);
    updatePairingDisplay();
  }
};

const handleRotate = async () => {
  if (!currentDevice) {
    setStatus("Register a device before rotating the key.", "error");
    return;
  }

  toggleBusy(true);
  setStatus("Rotating key...", "");
  try {
    const response = await sendMessage<RotateResponse>({ type: "beam.rotate-key" });
    if (!response?.ok) {
      throw new Error(response?.error ?? "Key rotation failed");
    }
    currentDevice = response.device ?? (await getStorageValue<BeamDevice>("beam.device"));
    setStatus("Key rotated. Update your Shortcuts.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
  } finally {
    toggleBusy(false);
    updatePairingDisplay();
  }
};

const handleCopyPairing = async () => {
  const json = buildPairingJson();
  if (!json) {
    setStatus("No pairing data available.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(json);
    setStatus("Pairing JSON copied to clipboard.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to copy pairing JSON";
    setStatus(message, "error");
  }
};

const init = async () => {
  await loadInitialState();

  elements.form?.addEventListener("submit", handleSave);
  elements.rotateButton?.addEventListener("click", handleRotate);
  elements.copyPairing?.addEventListener("click", handleCopyPairing);

  elements.autoOpen?.addEventListener("change", async () => {
    try {
      await setStorageValue("beam.settings", { autoOpen: elements.autoOpen?.checked ?? true });
      setStatus("Auto-open preference saved.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save auto-open preference";
      setStatus(message, "error");
    }
  });

  updatePairingDisplay();
  toggleBusy(false);
};

void init();
