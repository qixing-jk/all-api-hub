import { describe, expect, it, vi } from "vitest"

import { createPreferenceDraftReset } from "~/features/BasicSettings/components/shared/createPreferenceDraftReset"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

describe("createPreferenceDraftReset", () => {
  const defaults = { baseUrl: "", token: "" }

  it.each([
    [defaults, undefined, true],
    [defaults, defaults, true],
    [{ ...defaults, token: "draft" }, defaults, false],
    [defaults, { ...defaults, token: "saved" }, false],
  ])(
    "checks both draft and stored settings (%j, %j)",
    (draft, storedValue, disabled) => {
      const policy = createPreferenceDraftReset({
        draft,
        storedValue,
        savedValue: defaults,
        defaults,
        reset: vi.fn(),
        setDraft: vi.fn(),
      })
      expect(policy.resetDisabled).toBe(disabled)
    },
  )

  it("preserves saved fields not covered by partial defaults after success", async () => {
    const savedValue = { ...defaults, compatibility: "keep" }
    const setDraft = vi.fn()
    const outcome = { ok: true, preferences: DEFAULT_PREFERENCES }
    const policy = createPreferenceDraftReset({
      draft: { ...savedValue, token: "draft", compatibility: "unsaved" },
      storedValue: savedValue,
      savedValue,
      defaults,
      reset: vi.fn().mockResolvedValue(outcome),
      setDraft,
    })
    expect(await policy.onReset()).toBe(outcome)
    expect(setDraft).toHaveBeenCalledExactlyOnceWith(savedValue)
  })

  it("propagates rejected resets without discarding the draft", async () => {
    const error = new Error("write failed")
    const setDraft = vi.fn()
    const policy = createPreferenceDraftReset({
      draft: { ...defaults, token: "draft" },
      storedValue: defaults,
      savedValue: defaults,
      defaults,
      reset: vi.fn().mockRejectedValue(error),
      setDraft,
    })
    await expect(policy.onReset()).rejects.toBe(error)
    expect(setDraft).not.toHaveBeenCalled()
  })
})
