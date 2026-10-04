import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
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
    vi.restoreAllMocks()
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

    await browser.storage.local.set({
      [STORAGE_KEYS.POPUP_INTERRUPTION_HINT]: {
        flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
        status: "active",
        startedAt: 1,
      },
    })

    await expect(getPopupInterruptionHint()).resolves.toMatchObject({
      flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
      status: "pending",
      interruptedAt: Date.parse("2026-06-13T08:01:00.000Z"),
    })
  })

  it("does not classify a still-running flow as interrupted", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await expect(getPopupInterruptionHint()).resolves.toBeNull()
    await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
  })

  it("probes a persisted lease and recovers only after its owner disappears", async () => {
    const leaseName = `${STORAGE_LOCKS.POPUP_CRITICAL_FLOW_PREFIX}other-popup`
    let ownerAlive = true
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => unknown,
        ) =>
          callback(
            name === leaseName && ownerAlive ? null : ({ name } as Lock),
          ),
      },
    })
    try {
      await browser.storage.local.set({
        [STORAGE_KEYS.POPUP_INTERRUPTION_HINT]: {
          flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
          status: "active",
          startedAt: 1,
          ownerId: "other-popup",
          leaseName,
        },
      })
      await expect(getPopupInterruptionHint()).resolves.toBeNull()
      ownerAlive = false
      await expect(getPopupInterruptionHint()).resolves.toMatchObject({
        status: "pending",
        ownerId: "other-popup",
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("does not report a lease-backed flow as interrupted when probing is unavailable", async () => {
    vi.stubGlobal("navigator", {})
    try {
      await browser.storage.local.set({
        [STORAGE_KEYS.POPUP_INTERRUPTION_HINT]: {
          flow: POPUP_CRITICAL_FLOWS.AccountAutoDetect,
          status: "active",
          startedAt: 1,
          ownerId: "other-popup",
          leaseName: `${STORAGE_LOCKS.POPUP_CRITICAL_FLOW_PREFIX}other-popup`,
        },
      })
      await expect(getPopupInterruptionHint()).resolves.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("checks flow ownership across extension contexts and detects teardown", async () => {
    const held = new Set<string>()
    vi.stubGlobal("navigator", {
      locks: {
        request: async (
          name: string,
          options: LockOptions,
          callback: (lock: Lock | null) => Promise<unknown>,
        ) => {
          if (options.ifAvailable && held.has(name)) return callback(null)
          held.add(name)
          try {
            return await callback({ name } as Lock)
          } finally {
            held.delete(name)
          }
        },
      },
    })
    try {
      await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
      vi.resetModules()
      const otherContext = await import("~/services/popupInterruptionHint")
      await expect(otherContext.getPopupInterruptionHint()).resolves.toBeNull()
      await markPopupClosedDuringCriticalFlow()
      await expect(
        otherContext.getPopupInterruptionHint(),
      ).resolves.toMatchObject({ status: "pending" })
    } finally {
      await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
      vi.unstubAllGlobals()
    }
  })

  it("does not clear another popup's active flow when the old flow completes", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    vi.resetModules()
    const otherContext = await import("~/services/popupInterruptionHint")
    await otherContext.startPopupCriticalFlow(
      POPUP_CRITICAL_FLOWS.AccountAutoDetect,
    )
    await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    const stored = await browser.storage.local.get(
      STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
    )
    expect(stored[STORAGE_KEYS.POPUP_INTERRUPTION_HINT]).toMatchObject({
      status: "active",
    })
    await otherContext.completePopupCriticalFlow(
      POPUP_CRITICAL_FLOWS.AccountAutoDetect,
    )
  })

  it("keeps another popup's interruption hint when an older popup completes", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    vi.resetModules()
    const otherContext = await import("~/services/popupInterruptionHint")
    await otherContext.startPopupCriticalFlow(
      POPUP_CRITICAL_FLOWS.AccountAutoDetect,
    )
    await otherContext.markPopupClosedDuringCriticalFlow()
    await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await expect(
      otherContext.getPopupInterruptionHint(),
    ).resolves.toMatchObject({ status: "pending" })
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

  it("dismisses the pending hint matching the banner snapshot", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()
    const hint = await getPopupInterruptionHint()
    expect(hint).not.toBeNull()
    await clearPopupInterruptionHint(hint!)
    await expect(getPopupInterruptionHint()).resolves.toBeNull()
  })

  it("does not dismiss a newly started flow when responding to an older hint", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await clearPopupInterruptionHint()
    const stored = await browser.storage.local.get(
      STORAGE_KEYS.POPUP_INTERRUPTION_HINT,
    )
    expect(stored[STORAGE_KEYS.POPUP_INTERRUPTION_HINT]).toMatchObject({
      status: "active",
    })
    await completePopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
  })

  it("does not dismiss a newer pending hint using an older banner snapshot", async () => {
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()
    const oldHint = await getPopupInterruptionHint()
    await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
    await markPopupClosedDuringCriticalFlow()
    const newHint = await getPopupInterruptionHint()
    await clearPopupInterruptionHint(oldHint!)
    await expect(getPopupInterruptionHint()).resolves.toEqual(newHint)
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
    await debugQueuePopupInterruptionHint()
    const removeSpy = vi
      .spyOn(browser.storage.local, "remove")
      .mockRejectedValue(new Error("remove failed"))

    await expect(clearPopupInterruptionHint()).resolves.toBeUndefined()
    expect(removeSpy).toHaveBeenCalledOnce()
  })
})
