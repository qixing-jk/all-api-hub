import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  clearPopupInterruptionHint,
  completePopupCriticalFlow,
  debugQueuePopupInterruptionHint,
  getPopupInterruptionHint,
  markPopupClosedDuringCriticalFlow,
  POPUP_CRITICAL_FLOWS,
  startPopupCriticalFlow,
} from "~/services/popupInterruptionHint"

describe("popupInterruptionHint", () => {
  beforeEach(async () => {
    vi.useRealTimers()
    await browser.storage.local.remove(STORAGE_KEYS.POPUP_INTERRUPTION_HINT)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("records a hint when the popup closes during account auto-detect", async () => {
    vi.setSystemTime(new Date("2026-06-13T08:00:00.000Z"))

    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()

    await expect(getPopupInterruptionHint()).resolves.toMatchObject({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      interruptedAt: Date.parse("2026-06-13T08:00:00.000Z"),
    })
  })

  it("converts a persisted active flow into a hint on the next UI open", async () => {
    vi.setSystemTime(new Date("2026-06-13T08:01:00.000Z"))

    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)

    await expect(getPopupInterruptionHint()).resolves.toMatchObject({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      interruptedAt: Date.parse("2026-06-13T08:01:00.000Z"),
    })
  })

  it("does not record a hint after the critical flow completes", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()

    await expect(getPopupInterruptionHint()).resolves.toBeNull()
  })

  it("clears the pending hint after the user responds", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()

    await clearPopupInterruptionHint()

    const stored = await browser.storage.local.get(
      STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
    )
    expect(stored[STORAGE_KEYS.POPUP_INTERRUPTION_HINT]).toBeUndefined()
  })

  it("queues a pending hint directly for development debugging", async () => {
    vi.setSystemTime(new Date("2026-06-13T08:02:00.000Z"))

    await debugQueuePopupInterruptionHint()

    await expect(getPopupInterruptionHint()).resolves.toEqual({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      startedAt: Date.parse("2026-06-13T08:02:00.000Z"),
      interruptedAt: Date.parse("2026-06-13T08:02:00.000Z"),
    })
  })

  it("rejects the direct debug helper outside development and test mode", async () => {
    vi.stubEnv("MODE", "production")

    await expect(debugQueuePopupInterruptionHint()).rejects.toThrow(
      "Debug action is only available in development/test mode",
    )
  })

  it("ignores storage write failures while starting and closing a critical flow", async () => {
    const setSpy = vi
      .spyOn(browser.storage.local, "set")
      .mockRejectedValueOnce(new Error("write failed"))
      .mockRejectedValueOnce(new Error("write failed again"))

    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()

    expect(setSpy).toHaveBeenCalledTimes(2)
    await expect(getPopupInterruptionHint()).resolves.toBeNull()
  })

  it("ignores storage read failures when completing or reading hints", async () => {
    vi.spyOn(browser.storage.local, "get").mockRejectedValue(
      new Error("read failed"),
    )

    await expect(
      completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect),
    ).resolves.toBeUndefined()
    await expect(getPopupInterruptionHint()).resolves.toBeNull()
  })

  it("ignores storage remove failures when clearing hints", async () => {
    vi.spyOn(browser.storage.local, "remove").mockRejectedValue(
      new Error("remove failed"),
    )

    await expect(clearPopupInterruptionHint()).resolves.toBeUndefined()
  })
})
