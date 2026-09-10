import { describe, expect, it, vi } from "vitest"

import {
  getPreferenceWriteFailureMessage,
  runPreferenceUpdateWithToast,
  showResetToast,
  showUpdateToast,
} from "~/utils/feedback/preferenceFeedback"

vi.mock("~/lib/notify", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

describe("showUpdateToast", () => {
  it("shows success toast for update", async () => {
    const toast = (await import("~/lib/notify")).default
    showUpdateToast(true, "Setting")
    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )
  })

  it("shows error toast for update", async () => {
    const toast = (await import("~/lib/notify")).default
    showUpdateToast(false, "Setting")
    expect(toast.error).toHaveBeenCalledWith("settings:messages.updateFailed")
  })

  it("shows success toast for structured preference writes", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()

    showUpdateToast({ ok: true, preferences: {} as any }, "Setting")

    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )
  })

  it("shows stale-conflict guidance for structured preference write failures", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()

    showUpdateToast(
      {
        ok: false,
        reason: {
          type: "stale",
          expectedLastUpdated: 1,
          actualLastUpdated: 2,
        },
      },
      "Setting",
    )

    expect(toast.error).toHaveBeenCalledWith(
      "settings:messages.preferencesChangedExternally",
    )
  })

  it("shows setting-specific failures for structured storage errors", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()

    showUpdateToast(
      {
        ok: false,
        reason: { type: "storage-error", error: new Error("disk full") },
      },
      "Setting",
    )

    expect(toast.error).toHaveBeenCalledWith("settings:messages.updateFailed")
  })

  it("uses explicit fallbacks for toast result objects", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()

    showUpdateToast(
      {
        success: true,
        message: "",
        successFallback: "Saved locally",
      },
      "Setting",
    )

    expect(toast.success).toHaveBeenCalledWith("Saved locally")
  })
})
describe("getPreferenceWriteFailureMessage", () => {
  it("returns stale guidance before local fallbacks", () => {
    expect(
      getPreferenceWriteFailureMessage(
        {
          type: "stale",
          expectedLastUpdated: 1,
          actualLastUpdated: 2,
        },
        { fallback: "Local fallback" },
      ),
    ).toBe("settings:messages.preferencesChangedExternally")
  })

  it("returns local fallbacks for non-stale write failures", () => {
    expect(
      getPreferenceWriteFailureMessage(
        { type: "storage-error", error: new Error("disk full") },
        { fallback: "Local fallback" },
      ),
    ).toBe("Local fallback")
  })

  it("returns setting-specific fallback copy when no local fallback is provided", () => {
    expect(
      getPreferenceWriteFailureMessage(
        { type: "storage-error", error: new Error("disk full") },
        { setting: "Setting" },
      ),
    ).toBe("settings:messages.updateFailed")
  })

  it("returns the generic operation failure without setting context", () => {
    expect(
      getPreferenceWriteFailureMessage({
        type: "storage-error",
        error: new Error("disk full"),
      }),
    ).toBe("messages:toast.error.operationFailedGeneric")
  })
})
describe("runPreferenceUpdateWithToast", () => {
  it("passes versioned options to the updater and returns the write result", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()
    const result = { ok: true as const, preferences: {} as any }
    const update = vi.fn().mockResolvedValue(result)

    await expect(
      runPreferenceUpdateWithToast({
        expectedLastUpdated: 42,
        setting: "Setting",
        update,
      }),
    ).resolves.toBe(result)

    expect(update).toHaveBeenCalledWith({ expectedLastUpdated: 42 })
    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )
  })

  it("surfaces failed write results from the updater", async () => {
    const toast = (await import("~/lib/notify")).default
    vi.clearAllMocks()
    const result = {
      ok: false as const,
      reason: {
        type: "stale" as const,
        expectedLastUpdated: 1,
        actualLastUpdated: 2,
      },
    }

    await expect(
      runPreferenceUpdateWithToast({
        expectedLastUpdated: 42,
        setting: "Setting",
        update: vi.fn().mockResolvedValue(result),
      }),
    ).resolves.toBe(result)

    expect(toast.error).toHaveBeenCalledWith(
      "settings:messages.preferencesChangedExternally",
    )
  })
})
describe("showResetToast", () => {
  it("shows success toast for reset", async () => {
    const toast = (await import("~/lib/notify")).default
    showResetToast(true)
    expect(toast.success).toHaveBeenCalledWith(
      "settings:messages.updateSuccess",
    )
  })

  it("shows error toast for reset", async () => {
    const toast = (await import("~/lib/notify")).default
    showResetToast(false)
    expect(toast.error).toHaveBeenCalledWith("settings:danger.resetFailed")
  })
})
