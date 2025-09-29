import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleCatchUp, resetRuntimeState } from "../src/swAlarms";

describe("swAlarms", () => {
  const chromeAny = (globalThis as any).chrome;

  beforeEach(() => {
    resetRuntimeState();
    chromeAny.alarms.create = vi.fn();
  });

  it("creates catch-up alarm with default interval", () => {
    scheduleCatchUp();
    expect(chromeAny.alarms.create).toHaveBeenCalledWith("beam-catchup", {
      delayInMinutes: 1,
      periodInMinutes: 1
    });
  });

  it("skips scheduling when already scheduled", () => {
    scheduleCatchUp();
    scheduleCatchUp();
    expect(chromeAny.alarms.create).toHaveBeenCalledTimes(1);
  });
});
