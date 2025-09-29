let scheduled = false;

export const scheduleCatchUp = (intervalMinutes = 1) => {
  if (scheduled) return;
  scheduled = true;
  const chromeAny = (globalThis as any).chrome;
  chromeAny?.alarms?.create?.("beam-catchup", {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes
  });
};

export const resetRuntimeState = () => {
  scheduled = false;
};
