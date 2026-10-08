import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { type PreferenceWriteResult } from "~/services/preferences/preferencesStore"

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
  runPreferenceUpdateWithToast: ({
    expectedLastUpdated,
    update,
  }: {
    expectedLastUpdated: number
    update(options: {
      expectedLastUpdated: number
    }): Promise<PreferenceWriteResult>
  }) => update({ expectedLastUpdated }),
}))

const ok: PreferenceWriteResult = { ok: true, preferences: DEFAULT_PREFERENCES }

describe("managed-site configuration editing", () => {
  it("retains a dirty draft's version when another context replaces saved credentials", async () => {
    const update = vi.fn().mockResolvedValue(ok)
    const fields = { token: { setting: "Token", update } }
    const { result, rerender } = renderHook(
      ({ savedConfig, savedVersion }) =>
        useManagedSiteConfigDraft({
          savedConfig,
          savedVersion,
          storedConfig: savedConfig,
          defaults: { token: "" },
          reset: async () => ok,
          fields,
        }),
      { initialProps: { savedConfig: { token: "original" }, savedVersion: 1 } },
    )
    act(() => result.current.setDraft({ token: "mine" }))
    rerender({ savedConfig: { token: "external" }, savedVersion: 2 })

    await act(async () => {
      await result.current.commitField("token", "mine")
    })
    expect(update).toHaveBeenCalledWith("mine", { expectedLastUpdated: 1 })
    expect(result.current.draft.token).toBe("mine")
  })

  it("preserves provider-specific raw secrets and trims only the declared fields", async () => {
    const updateToken = vi.fn().mockResolvedValue(ok)
    const updateUrl = vi.fn().mockResolvedValue(ok)
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { token: "", baseUrl: "" },
        savedVersion: 1,
        storedConfig: undefined,
        defaults: { token: "", baseUrl: "" },
        reset: async () => ok,
        fields: {
          token: { setting: "Token", update: updateToken },
          baseUrl: {
            setting: "URL",
            update: updateUrl,
            policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
          },
        },
      }),
    )
    await act(async () => {
      await result.current.commitField("token", "  secret  ")
    })
    await act(async () => {
      await result.current.commitField("baseUrl", "  https://example.com  ")
    })
    expect(updateToken).toHaveBeenCalledWith("  secret  ", {
      expectedLastUpdated: 1,
    })
    expect(updateUrl).toHaveBeenCalledWith("https://example.com", {
      expectedLastUpdated: 1,
    })
  })

  it("keeps invalid user IDs local and normalizes valid ones before saving", async () => {
    const update = vi.fn().mockResolvedValue(ok)
    const { result } = renderHook(() =>
      useManagedSiteConfigDraft({
        savedConfig: { userId: "" },
        savedVersion: 1,
        storedConfig: undefined,
        defaults: { userId: "" },
        reset: async () => ok,
        fields: {
          userId: {
            setting: "User ID",
            update,
            policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.UserId,
          },
        },
      }),
    )
    act(() => result.current.setDraft({ userId: "invalid" }))
    await act(async () => {
      await result.current.commitField("userId", "invalid")
    })
    expect(update).not.toHaveBeenCalled()
    expect(result.current.draft.userId).toBe("invalid")
    await act(async () => {
      await result.current.commitField("userId", " 42 ")
    })
    expect(update).toHaveBeenCalledWith("42", { expectedLastUpdated: 1 })
    expect(result.current.draft.userId).toBe("42")
  })

  it.each([true, false])(
    "discards drafts only after a successful reset (ok=%s)",
    async (success) => {
      const reset = vi.fn().mockResolvedValue(
        success
          ? ok
          : {
              ok: false,
              reason: {
                type: "storage-error",
                error: new Error("write failed"),
              },
            },
      )
      const { result } = renderHook(() =>
        useManagedSiteConfigDraft({
          savedConfig: { token: "saved" },
          savedVersion: 1,
          storedConfig: { token: "saved" },
          defaults: { token: "" },
          reset,
          fields: { token: { setting: "Token", update: async () => ok } },
        }),
      )
      act(() => result.current.setDraft({ token: "edited" }))
      await act(async () => {
        await result.current.resetProps.onReset()
      })
      expect(result.current.draft.token).toBe(success ? "" : "edited")
      expect(reset).toHaveBeenCalledOnce()
    },
  )
})
