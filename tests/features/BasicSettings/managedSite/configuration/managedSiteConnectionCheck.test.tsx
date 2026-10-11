import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import {
  MANAGED_SITE_CONNECTION_STATES,
  useManagedSiteConfigDraft,
} from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import toast from "~/lib/notify"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import type { PreferenceWriteResult } from "~/services/preferences/preferencesStore"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}))

describe("managed-site save and connection check", () => {
  it("joins a blur save, exposes saving then checking, and rejects duplicate checks", async () => {
    const save = createDeferred<PreferenceWriteResult>()
    const check = createDeferred<{ success: boolean }>()
    const validate = vi.fn(() => check.promise)
    const update = vi.fn(() => save.promise)
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { token: "old" },
        savedVersion: 1,
        storedConfig: { token: "old" },
        defaults: { token: "" },
        reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
        fields: { token: { setting: "Token", update } },
      }),
    )
    act(() => result.current.setDraft({ token: "new" }))
    let operation: Promise<unknown>
    act(() => {
      void result.current.commitField("token", "new")
      operation = result.current.checkConnection({ token: "new" }, validate)
      void result.current.checkConnection({ token: "new" }, validate)
    })
    expect(result.current.connectionCheckState).toBe(
      MANAGED_SITE_CONNECTION_STATES.Saving,
    )
    expect(result.current.resetProps.resetDisabled).toBe(true)
    expect(validate).not.toHaveBeenCalled()
    await act(async () =>
      save.resolve({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 2 },
      }),
    )
    expect(update).toHaveBeenCalledOnce()
    expect(result.current.connectionCheckState).toBe(
      MANAGED_SITE_CONNECTION_STATES.Checking,
    )
    expect(validate).toHaveBeenCalledExactlyOnceWith({ token: "new" })
    await act(async () => {
      check.resolve({ success: true })
      await operation!
    })
    expect(result.current.connectionCheckState).toBe(
      MANAGED_SITE_CONNECTION_STATES.Idle,
    )
    expect(toast.success).toHaveBeenCalledWith(
      "settings:managedSiteConnection.success",
      expect.objectContaining({ id: expect.any(String) }),
    )
  })
  it("retains failed input, stops network work, and allows a later explicit retry", async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: { type: "storage-error", error: new Error("disk") },
      })
      .mockResolvedValue({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 2 },
      })
    const validate = vi.fn().mockResolvedValue({ success: true })
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { token: "old" },
        savedVersion: 1,
        storedConfig: { token: "old" },
        defaults: { token: "" },
        reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
        fields: { token: { setting: "Token", update } },
      }),
    )
    act(() => result.current.setDraft({ token: "new" }))
    await act(async () =>
      result.current.checkConnection({ token: "new" }, validate),
    )
    expect(validate).not.toHaveBeenCalled()
    expect(result.current.draft.token).toBe("new")
    expect(result.current.connectionCheckState).toBe(
      MANAGED_SITE_CONNECTION_STATES.Idle,
    )
    await act(async () =>
      result.current.checkConnection({ token: "new" }, validate),
    )
    expect(validate).toHaveBeenCalledExactlyOnceWith({ token: "new" })
  })

  it("preserves a conflicting draft until the user explicitly reloads current settings", async () => {
    const update = vi.fn().mockResolvedValue({
      ok: false,
      reason: { type: "stale", expectedLastUpdated: 1, actualLastUpdated: 2 },
    })
    const validate = vi.fn()
    const { result, rerender } = renderHook(
      ({ savedConfig, savedVersion }) =>
        useManagedSiteConfigDraft({
          savedConfig,
          savedVersion,
          storedConfig: savedConfig,
          defaults: { token: "" },
          reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
          fields: { token: { setting: "Token", update } },
        }),
      { initialProps: { savedConfig: { token: "old" }, savedVersion: 1 } },
    )
    act(() => result.current.setDraft({ token: "mine" }))
    rerender({ savedConfig: { token: "theirs" }, savedVersion: 2 })
    await act(async () =>
      result.current.checkConnection({ token: "mine" }, validate),
    )
    expect(validate).not.toHaveBeenCalled()
    expect(result.current.draft.token).toBe("mine")
    const feedback = vi.mocked(toast.warning).mock.calls.at(-1)?.[1]
    expect(feedback).toEqual(
      expect.objectContaining({
        action: expect.objectContaining({
          label: "settings:managedSiteConnection.reload",
        }),
      }),
    )
    act(() => feedback?.action?.onClick())
    expect(result.current.draft.token).toBe("theirs")
  })

  it("saves normalized fields in version order while preserving raw passwords", async () => {
    const baseUrl = vi.fn().mockResolvedValue({
      ok: true,
      preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 2 },
    })
    const password = vi.fn().mockResolvedValue({
      ok: true,
      preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 3 },
    })
    const validate = vi
      .fn()
      .mockResolvedValue({ success: false, message: "insufficient scope" })
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { baseUrl: "", password: "" },
        savedVersion: 1,
        storedConfig: {},
        defaults: {},
        reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
        fields: {
          baseUrl: {
            setting: "URL",
            policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
            update: baseUrl,
          },
          password: { setting: "Password", update: password },
        },
      }),
    )
    await act(async () =>
      result.current.checkConnection(
        { baseUrl: " https://example.invalid ", password: " secret " },
        validate,
      ),
    )
    expect(baseUrl).toHaveBeenCalledExactlyOnceWith("https://example.invalid", {
      expectedLastUpdated: 1,
    })
    expect(password).toHaveBeenCalledExactlyOnceWith(" secret ", {
      expectedLastUpdated: 2,
    })
    expect(validate).toHaveBeenCalledExactlyOnceWith({
      baseUrl: "https://example.invalid",
      password: " secret ",
    })
    expect(result.current.draft.password).toBe(" secret ")
    expect(result.current.isValidating).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(
      "settings:managedSiteConnection.failed",
      expect.objectContaining({ id: expect.any(String) }),
    )
  })

  it("persists before handing interactive verification to its existing dialog", async () => {
    const save = createDeferred<PreferenceWriteResult>()
    const openDialog = vi.fn()
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { token: "old" },
        savedVersion: 1,
        storedConfig: { token: "old" },
        defaults: {},
        reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
        fields: { token: { setting: "Token", update: () => save.promise } },
      }),
    )
    let operation: Promise<unknown>
    act(() => {
      operation = result.current.checkConnection({ token: "new" }, openDialog)
    })
    expect(openDialog).not.toHaveBeenCalled()
    await act(async () => {
      save.resolve({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 2 },
      })
      await operation!
    })
    expect(openDialog).toHaveBeenCalledExactlyOnceWith({ token: "new" })
    expect(toast.dismiss).toHaveBeenCalledWith(expect.any(String))
  })
  it("does not carry a failed blur write across a successful reset", async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        reason: { type: "storage-error", error: new Error("disk") },
      })
      .mockResolvedValue({
        ok: true,
        preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 3 },
      })
    const validate = vi.fn().mockResolvedValue({ success: true })
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { token: "old" },
        savedVersion: 1,
        storedConfig: { token: "old" },
        defaults: { token: "default" },
        reset: async () => ({
          ok: true,
          preferences: { ...DEFAULT_PREFERENCES, lastUpdated: 2 },
        }),
        fields: { token: { setting: "Token", update } },
      }),
    )
    await act(async () => result.current.commitField("token", "failed"))
    await act(async () => result.current.resetProps.onReset())
    await act(async () =>
      result.current.checkConnection(result.current.draft, validate),
    )
    expect(validate).toHaveBeenCalledExactlyOnceWith({ token: "default" })
  })
  it.each(["saving", "checking"] as const)(
    "keeps the %s exception feedback distinct",
    async (phase) => {
      const update = vi.fn().mockRejectedValue(new Error("private failure"))
      const validate = vi.fn().mockRejectedValue(new Error("private failure"))
      const { result } = renderHook(() =>
        useManagedSiteConfigDraft({
          savedConfig: { token: "old" },
          savedVersion: 1,
          storedConfig: { token: "old" },
          defaults: {},
          reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
          fields: { token: { setting: "Token", update } },
        }),
      )
      await act(async () =>
        result.current.checkConnection(
          { token: phase === "saving" ? "new" : "old" },
          validate,
        ),
      )
      expect(toast.error).toHaveBeenCalledWith(
        phase === "saving"
          ? "settings:managedSiteConnection.saveError"
          : "settings:managedSiteConnection.checkError",
        expect.objectContaining({ id: expect.any(String) }),
      )
      expect(result.current.isValidating).toBe(false)
      if (phase === "saving") expect(validate).not.toHaveBeenCalled()
    },
  )

  it("rejects an edited invalid user ID before opening verification", async () => {
    const update = vi.fn()
    const validate = vi.fn()
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { userId: "1" },
        savedVersion: 1,
        storedConfig: { userId: "1" },
        defaults: {},
        reset: async () => ({ ok: true, preferences: DEFAULT_PREFERENCES }),
        fields: {
          userId: {
            setting: "User ID",
            policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.UserId,
            update,
          },
        },
      }),
    )
    await act(async () =>
      result.current.checkConnection({ userId: "invalid" }, validate),
    )
    expect(update).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "settings:managedSiteConnection.invalidField",
      expect.objectContaining({ id: expect.any(String) }),
    )
  })
})
