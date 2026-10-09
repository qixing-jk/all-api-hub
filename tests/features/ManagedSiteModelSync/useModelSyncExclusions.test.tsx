import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useModelSyncExclusions } from "~/features/ManagedSiteModelSync/exclusions/useModelSyncExclusions"
import toast from "~/lib/notify"
import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { createDefaultChannelResourceConfig } from "~/types/channelConfig"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

vi.mock("~/services/managedSites/configuration/channelConfigStorage", () => ({
  channelConfigStorage: {
    getConfigsForScope: vi.fn(),
    setModelSyncExcluded: vi.fn(),
  },
}))
vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))
const target = {
  siteType: "new-api" as const,
  config: { baseUrl: "https://example.com", adminToken: "test", userId: "1" },
}
const ref = modelResourceRef(1)
const config = {
  ...createDefaultChannelResourceConfig({
    managedSiteType: ref.siteType,
    scopeKey: ref.scopeKey,
    resourceId: ref.resourceId,
  }),
  modelSyncExcluded: true,
}

describe("model sync exclusion workspace", () => {
  it.each([true, false])(
    "confirms the saved participation setting (%s) only after persistence",
    async (excluded) => {
      const pending = createDeferred<void>()
      vi.mocked(channelConfigStorage.setModelSyncExcluded).mockReturnValueOnce(
        pending.promise,
      )
      const { result } = renderHook(() =>
        useModelSyncExclusions(target, "target"),
      )
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      let saving!: Promise<void>
      act(() => {
        saving = result.current.setExcluded(ref, excluded)
      })
      expect(result.current.isSaving(ref)).toBe(true)
      expect(toast.success).not.toHaveBeenCalled()
      await act(async () => {
        pending.resolve()
        await saving
      })
      expect(result.current.isSaving(ref)).toBe(false)
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining(
          excluded
            ? "execution.exclusions.savedExcluded"
            : "execution.exclusions.savedIncluded",
        ),
      )
    },
  )

  it("does not show old-target save confirmations after changing deployment", async () => {
    const pending = createDeferred<void>()
    vi.mocked(channelConfigStorage.setModelSyncExcluded).mockReturnValueOnce(
      pending.promise,
    )
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useModelSyncExclusions(
          { ...target, config: { ...target.config, baseUrl: scope } },
          scope,
        ),
      { initialProps: { scope: target.config.baseUrl } },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let saving!: Promise<void>
    act(() => {
      saving = result.current.setExcluded(ref, true)
    })
    rerender({ scope: "https://other.example" })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      pending.resolve()
      await saving
    })
    expect(toast.success).not.toHaveBeenCalled()
    expect(result.current.hasPendingSave).toBe(false)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(channelConfigStorage.getConfigsForScope).mockResolvedValue({})
    vi.mocked(channelConfigStorage.setModelSyncExcluded).mockResolvedValue()
  })

  it("ignores old deployment reads and does not admit foreign writes", async () => {
    const pending = createDeferred<Record<string, typeof config>>()
    vi.mocked(channelConfigStorage.getConfigsForScope).mockReturnValueOnce(
      pending.promise,
    )
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useModelSyncExclusions(
          { ...target, config: { ...target.config, baseUrl: scope } },
          scope,
        ),
      { initialProps: { scope: target.config.baseUrl } },
    )
    rerender({ scope: "https://other.example" })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => pending.resolve({ excluded: config }))
    expect(result.current.isExcluded(ref)).toBe(false)
    await act(async () => result.current.setExcluded(ref, true))
    expect(channelConfigStorage.setModelSyncExcluded).not.toHaveBeenCalled()
  })

  it("keeps failed reads unavailable and supports retry", async () => {
    vi.mocked(channelConfigStorage.getConfigsForScope).mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    const { result } = renderHook(() =>
      useModelSyncExclusions(target, "target"),
    )
    await waitFor(() => expect(result.current.error).not.toBeNull())
    await act(async () => result.current.setExcluded(ref, true))
    expect(channelConfigStorage.setModelSyncExcluded).not.toHaveBeenCalled()
    await act(async () => result.current.reload())
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it("deduplicates a pending toggle and retains the saved state on write failure", async () => {
    const pending = createDeferred<void>()
    vi.mocked(channelConfigStorage.setModelSyncExcluded).mockReturnValue(
      pending.promise,
    )
    const { result } = renderHook(() =>
      useModelSyncExclusions(target, "target"),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let saving!: Promise<void>
    act(() => {
      saving = result.current.setExcluded(ref, true)
    })
    await act(async () => result.current.setExcluded(ref, false))
    expect(channelConfigStorage.setModelSyncExcluded).toHaveBeenCalledOnce()
    await act(async () => {
      pending.reject(new Error("write failed"))
      await saving
    })
    expect(result.current.isExcluded(ref)).toBe(false)
    expect(result.current.isSaving(ref)).toBe(false)
    expect(toast.error).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
