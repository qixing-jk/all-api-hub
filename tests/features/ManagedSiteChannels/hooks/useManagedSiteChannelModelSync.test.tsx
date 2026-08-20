import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { useManagedSiteChannelModelSync } from "~/features/ManagedSiteChannels/hooks/useManagedSiteChannelModelSync"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { ModelSyncMessageTypes } from "~/services/runtimeMessaging/messageTypes"

const {
  sendModelSyncMessageMock,
  startProductAnalyticsActionMock,
  trackerCompleteMock,
  toastErrorMock,
  toastSuccessMock,
  translationMock,
  withProtectionBypassUserCommandMock,
} = vi.hoisted(() => ({
  sendModelSyncMessageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  translationMock: vi.fn((key: string) => key),
  withProtectionBypassUserCommandMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: { error: toastErrorMock, success: toastSuccessMock },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translationMock,
  }),
}))

vi.mock("~/services/models/modelSync/messaging", () => ({
  sendModelSyncMessage: (...args: unknown[]) =>
    sendModelSyncMessageMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/services/protectionBypass/client", () => ({
  withProtectionBypassUserCommand: (...args: unknown[]) =>
    withProtectionBypassUserCommandMock(...args),
}))

const analyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

describe("useManagedSiteChannelModelSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackerCompleteMock,
    })
    withProtectionBypassUserCommandMock.mockImplementation(
      async (_command, _surface, run) => run({ kind: "user-command" }),
    )
  })

  it("skips dispatch when no selected channel has a provider id", async () => {
    const onModelsChanged = vi.fn()
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({
        siteType: SITE_TYPES.NEW_API,
        onModelsChanged,
      }),
    )

    await act(async () =>
      result.current.syncChannels([0, -1], analyticsContext),
    )

    expect(sendModelSyncMessageMock).not.toHaveBeenCalled()
    expect(withProtectionBypassUserCommandMock).not.toHaveBeenCalled()
    expect(onModelsChanged).not.toHaveBeenCalled()
    expect(result.current.syncingChannelIds).toEqual(new Set())
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        insights: expect.objectContaining({ itemCount: 0, selectedCount: 2 }),
      }),
    )
  })

  it("reports an upstream failure and clears channel busy state", async () => {
    let resolveSync!: (value: unknown) => void
    sendModelSyncMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve
      }),
    )
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({ siteType: SITE_TYPES.NEW_API }),
    )

    let syncPromise!: Promise<void>
    act(() => {
      syncPromise = result.current.syncChannels([42], analyticsContext)
    })
    expect(result.current.syncingChannelIds).toEqual(new Set([42]))

    resolveSync({ success: false, error: "provider unavailable" })
    await act(async () => syncPromise)

    expect(toastErrorMock).toHaveBeenCalledWith("toasts.syncFailed")
    expect(translationMock).toHaveBeenCalledWith("toasts.syncFailed", {
      error: "provider unavailable",
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({ itemCount: 1, selectedCount: 1 }),
      }),
    )
    expect(result.current.syncingChannelIds).toEqual(new Set())
  })

  it("uses localized fallback copy when model sync returns no error", async () => {
    sendModelSyncMessageMock.mockResolvedValue({ success: false })
    translationMock.mockImplementation((key: string) =>
      key === "toasts.syncFailedFallback" ? "Localized sync fallback" : key,
    )
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({ siteType: SITE_TYPES.NEW_API }),
    )

    await act(async () => result.current.syncChannels([42], analyticsContext))

    expect(translationMock).toHaveBeenCalledWith("toasts.syncFailedFallback")
    expect(translationMock).toHaveBeenCalledWith("toasts.syncFailed", {
      error: "Localized sync fallback",
    })
  })

  it("syncs eligible native channel ids and reports refreshed models", async () => {
    let resolveSync!: (value: unknown) => void
    sendModelSyncMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve
      }),
    )
    const onModelsChanged = vi.fn()
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({
        siteType: SITE_TYPES.NEW_API,
        onModelsChanged,
      }),
    )

    let syncPromise!: Promise<void>
    act(() => {
      syncPromise = result.current.syncChannels([0, 42], analyticsContext)
    })
    expect(result.current.syncingChannelIds).toEqual(new Set([42]))

    resolveSync({
      success: true,
      data: {
        statistics: { successCount: 1, failureCount: 0 },
        items: [{ channelId: 42, ok: true, newModels: ["model-a"] }],
      },
    })
    await act(async () => syncPromise)

    expect(sendModelSyncMessageMock).toHaveBeenCalledWith(
      ModelSyncMessageTypes.TriggerSelected,
      {
        channelIds: [42],
        protectionBypassExecution: { kind: "user-command" },
      },
    )
    expect(onModelsChanged).toHaveBeenCalledWith(new Map([[42, "model-a"]]))
    expect(translationMock).toHaveBeenCalledWith("toasts.syncCompleted", {
      success: 1,
      total: 1,
    })
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          itemCount: 1,
          selectedCount: 2,
          successCount: 1,
          failureCount: 0,
        }),
      }),
    )
    await waitFor(() =>
      expect(result.current.syncingChannelIds).toEqual(new Set()),
    )
  })

  it("reports partial success when model sync succeeds but reconciliation fails", async () => {
    sendModelSyncMessageMock.mockResolvedValue({
      success: true,
      data: {
        statistics: { successCount: 1, failureCount: 0 },
        items: [{ channelId: 42, ok: true, newModels: ["model-a"] }],
      },
    })
    const onModelsChanged = vi.fn().mockResolvedValue({
      outcome: "failed",
      failure: { code: "unavailable" },
    })
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({
        siteType: SITE_TYPES.NEW_API,
        onModelsChanged,
      }),
    )

    await act(async () => result.current.syncChannels([42], analyticsContext))

    expect(toastErrorMock).toHaveBeenCalledWith(
      "toasts.syncCompletedRefreshFailed",
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({ warningCount: 1 }),
      }),
    )
    expect(trackerCompleteMock).not.toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.anything(),
    )
  })

  it("keeps a reconciliation exception separate from the completed upstream sync", async () => {
    sendModelSyncMessageMock.mockResolvedValue({
      success: true,
      data: { statistics: { successCount: 1, failureCount: 0 }, items: [] },
    })
    const { result } = renderHook(() =>
      useManagedSiteChannelModelSync({
        siteType: SITE_TYPES.NEW_API,
        onModelsChanged: vi.fn().mockRejectedValue(new Error("refresh failed")),
      }),
    )

    await act(async () => result.current.syncChannels([42], analyticsContext))

    expect(toastErrorMock).toHaveBeenCalledWith(
      "toasts.syncCompletedRefreshFailed",
    )
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({ warningCount: 1 }),
      }),
    )
  })

  it("discards a pending sync when the managed-site type changes", async () => {
    let resolveSync!: (value: unknown) => void
    sendModelSyncMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve
      }),
    )
    const onModelsChanged = vi.fn()
    const { result, rerender } = renderHook(
      ({ siteType }: { siteType: ManagedSiteType }) =>
        useManagedSiteChannelModelSync({ siteType, onModelsChanged }),
      {
        initialProps: { siteType: SITE_TYPES.NEW_API } as {
          siteType: ManagedSiteType
        },
      },
    )

    let syncPromise!: Promise<void>
    act(() => {
      syncPromise = result.current.syncChannels([42], analyticsContext)
    })
    expect(result.current.syncingChannelIds).toEqual(new Set([42]))

    rerender({ siteType: SITE_TYPES.AXON_HUB } as { siteType: ManagedSiteType })
    expect(result.current.syncingChannelIds).toEqual(new Set())

    resolveSync({
      success: true,
      data: {
        statistics: { successCount: 1, failureCount: 0 },
        items: [{ channelId: 42, ok: true, newModels: ["stale-model"] }],
      },
    })
    await act(async () => syncPromise)

    expect(onModelsChanged).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        insights: expect.objectContaining({ selectedCount: 1 }),
      }),
    )
    expect(result.current.syncingChannelIds).toEqual(new Set())
  })

  it("invalidates reconciliation during a managed-site type commit", async () => {
    let resolveReconciliation!: () => void
    sendModelSyncMessageMock.mockResolvedValue({
      success: true,
      data: {
        statistics: { successCount: 1, failureCount: 0 },
        items: [{ channelId: 42, ok: true, newModels: ["model-a"] }],
      },
    })
    const onModelsChanged = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReconciliation = resolve
        }),
    )
    const { result, rerender } = renderHook(
      ({ siteType }: { siteType: ManagedSiteType }) =>
        useManagedSiteChannelModelSync({ siteType, onModelsChanged }),
      {
        initialProps: { siteType: SITE_TYPES.NEW_API } as {
          siteType: ManagedSiteType
        },
      },
    )

    let syncPromise!: Promise<void>
    act(() => {
      syncPromise = result.current.syncChannels([42], analyticsContext)
    })
    await waitFor(() => expect(onModelsChanged).toHaveBeenCalled())

    rerender({ siteType: SITE_TYPES.AXON_HUB } as { siteType: ManagedSiteType })
    resolveReconciliation()
    await act(async () => syncPromise)

    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        insights: expect.objectContaining({ selectedCount: 1 }),
      }),
    )
  })

  it("invalidates pending synchronization when the hook unmounts", async () => {
    let resolveSync!: (value: unknown) => void
    sendModelSyncMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve
      }),
    )
    const onModelsChanged = vi.fn()
    const { result, unmount } = renderHook(() =>
      useManagedSiteChannelModelSync({
        siteType: SITE_TYPES.NEW_API,
        onModelsChanged,
      }),
    )

    let syncPromise!: Promise<void>
    act(() => {
      syncPromise = result.current.syncChannels([42], analyticsContext)
    })
    unmount()
    resolveSync({
      success: true,
      data: {
        statistics: { successCount: 1, failureCount: 0 },
        items: [{ channelId: 42, ok: true, newModels: ["stale-model"] }],
      },
    })
    await act(async () => syncPromise)

    expect(onModelsChanged).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(trackerCompleteMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        insights: expect.objectContaining({ selectedCount: 1 }),
      }),
    )
  })
})
