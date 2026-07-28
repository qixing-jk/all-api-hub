import { act, renderHook, waitFor } from "@testing-library/react"
import type { TFunction } from "i18next"
import { StrictMode, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { useManagedResourceMigrationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMigrationController"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalExecutionResult,
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationSelection,
  ManagedSiteMigrationSource,
  ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"
import { MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES } from "~/types/managedSiteMigrationCapability"

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as TFunction

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

const source: ManagedSiteMigrationSource = {
  sourceSiteType: SITE_TYPES.AXON_HUB,
  resourceType: ChannelType.OpenAI,
  baseUrl: "https://source.example.invalid",
  models: ["model-example"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: "enabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
}

const target: ManagedSiteMigrationTargetPreparation = {
  projection: {
    name: "Migrated channel",
    type: ChannelType.OpenAI,
    baseUrl: "https://target.example.invalid",
    models: ["model-example"],
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: 1,
  },
  adjustments: {
    remappedType: false,
    normalizedBaseUrl: false,
    forcedDefaultGroup: false,
    ignoredPriority: false,
    ignoredWeight: false,
    simplifiedStatus: false,
  },
}

const buildPreview = (
  selections: readonly ManagedSiteMigrationSelection[],
  targetSiteType: ManagedSiteType = SITE_TYPES.NEW_API,
): ManagedSiteMigrationCanonicalPreview => ({
  sourceSiteType: SITE_TYPES.AXON_HUB,
  targetSiteType,
  generalWarningCodes: [],
  items: selections.map((selection) => ({
    selection,
    status: "ready" as const,
    source,
    target,
    warningCodes: [],
  })),
  totalCount: selections.length,
  readyCount: selections.length,
  blockedCount: 0,
})

const createRef = (resourceId: string): ManagedResourceRef => ({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  scopeKey: "https://scope-secret.example.invalid",
  resourceId,
})

const createAnalytics = () => {
  const complete = vi.fn()
  const startAction = vi.fn(() => ({ complete }))
  return {
    analytics: {
      managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
      startAction,
    },
    complete,
    startAction,
  }
}

const executionResult = (
  items: ManagedSiteMigrationCanonicalExecutionResult["items"],
): ManagedSiteMigrationCanonicalExecutionResult => ({
  totalSelected: items.length,
  attemptedCount: items.filter(({ status }) => status !== "skipped").length,
  createdCount: items.filter(({ status }) => status === "created").length,
  failedCount: items.filter(({ status }) => status === "failed").length,
  skippedCount: items.filter(({ status }) => status === "skipped").length,
  uncertainCount: items.filter(({ status }) => status === "uncertain").length,
  items,
})

const buildOptions = (overrides: Record<string, unknown> = {}) => {
  const refs = new Map([
    ["opaque::second", createRef("resource-secret-second")],
    ["opaque::first", createRef("resource-secret-first")],
    ["opaque::created", createRef("resource-secret-created")],
    ["opaque::failed", createRef("resource-secret-failed")],
    ["opaque::blocked", createRef("resource-secret-blocked")],
    ["opaque::uncertain", createRef("resource-secret-uncertain")],
  ])
  const names = new Map([
    ["opaque::second", "Second example"],
    ["opaque::first", "First example"],
    ["opaque::created", "Created example"],
    ["opaque::failed", "Failed example"],
    ["opaque::blocked", "Blocked example"],
    ["opaque::uncertain", "Uncertain example"],
  ])
  return {
    isOpen: true,
    sourceSiteType: SITE_TYPES.AXON_HUB,
    scopeIdentity: "scope-generation-a",
    selectedRowKeys: ["opaque::second", "opaque::first"],
    targets: [{ value: SITE_TYPES.NEW_API, label: "New API" }] as Array<{
      value: ManagedSiteType
      label: string
    }>,
    resolveRef: (rowKey: string) => refs.get(rowKey),
    resolveDisplayName: (rowKey: string) => names.get(rowKey),
    refresh: vi.fn(async () => true),
    onClose: vi.fn(),
    t,
    getSiteLabel: (siteType: ManagedSiteType) => siteType,
    ...overrides,
  }
}

describe("useManagedResourceMigrationController", () => {
  it("preserves opaque selection ids and order without publishing refs in UI state", async () => {
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const options = buildOptions({ prepareMigration })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))

    expect(prepareMigration).toHaveBeenCalledWith({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.NEW_API,
      selections: [
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          ref: createRef("resource-secret-second"),
        },
        {
          selectionId: "opaque::first",
          displayName: "First example",
          ref: createRef("resource-secret-first"),
        },
      ],
      options: { signal: expect.any(AbortSignal) },
    })
    expect(result.current.preview?.rows.map(({ rowKey }) => rowKey)).toEqual([
      "opaque::second",
      "opaque::first",
    ])
    expect(JSON.stringify(result.current)).not.toContain(
      "scope-secret.example.invalid",
    )
    expect(JSON.stringify(result.current)).not.toContain(
      "resource-secret-second",
    )
  })

  it("rejects empty, duplicate, and stale selections without calling services", async () => {
    const prepareMigration = vi.fn()
    const options = buildOptions({
      prepareMigration,
      selectedRowKeys: ["opaque::first", "opaque::first"],
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: options },
    )

    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())
    expect(prepareMigration).not.toHaveBeenCalled()

    rerender(buildOptions({ prepareMigration, selectedRowKeys: [] }))
    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())
    rerender(
      buildOptions({
        prepareMigration,
        selectedRowKeys: ["stale-row"],
      }),
    )
    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())

    expect(prepareMigration).not.toHaveBeenCalled()
  })

  it("contains resolver exceptions as a controlled validation state", async () => {
    const prepareMigration = vi.fn()
    const options = buildOptions({
      prepareMigration,
      resolveRef: () => {
        throw new Error("resolver-sensitive-error")
      },
      selectedRowKeys: ["opaque::first"],
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())

    expect(prepareMigration).not.toHaveBeenCalled()
    expect(JSON.stringify(result.current)).not.toContain(
      "resolver-sensitive-error",
    )
  })

  it("uses the registry-backed AxonHub source and target capability through canonical defaults", async () => {
    const sourcePrepare = vi
      .spyOn(axonHubManagedSiteMigrationCapability.source!, "prepare")
      .mockResolvedValue({ status: "ready", source })
    const targetPrepare = vi
      .spyOn(axonHubManagedSiteMigrationCapability.target!, "prepare")
      .mockResolvedValue(target)
    const options = buildOptions({
      selectedRowKeys: ["opaque::first"],
      targets: [{ value: SITE_TYPES.AXON_HUB, label: "AxonHub" }],
    })

    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    expect(sourcePrepare).toHaveBeenCalledOnce()
    expect(targetPrepare).toHaveBeenCalledOnce()
    expect(sourcePrepare.mock.calls[0]?.[0]).toMatchObject({
      selectionId: "opaque::first",
      displayName: "First example",
    })
    expect(targetPrepare).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSiteType: SITE_TYPES.AXON_HUB }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    sourcePrepare.mockRestore()
    targetPrepare.mockRestore()
  })

  it("aborts a target generation and ignores its abort-insensitive late result", async () => {
    const late = deferred<ManagedSiteMigrationCanonicalPreview>()
    const firstSignal: AbortSignal[] = []
    const prepareMigration = vi.fn(
      ({
        selections,
        targetSiteType,
        options,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
        options?: { signal?: AbortSignal }
      }) => {
        if (targetSiteType === SITE_TYPES.NEW_API) {
          firstSignal.push(options!.signal!)
          return late.promise
        }
        return Promise.resolve(buildPreview(selections, targetSiteType))
      },
    )
    const options = buildOptions({
      prepareMigration,
      targets: [
        { value: SITE_TYPES.NEW_API, label: "New API" },
        { value: SITE_TYPES.AXON_HUB, label: "AxonHub" },
      ],
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    act(() => result.current.callbacks.onTargetChange(SITE_TYPES.AXON_HUB))

    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))
    expect(firstSignal[0]?.aborted).toBe(true)
    expect(result.current.preview?.targetLabel).toBe("AxonHub")

    await act(async () => {
      late.resolve(
        buildPreview(
          prepareMigration.mock.calls[0]![0].selections,
          SITE_TYPES.NEW_API,
        ),
      )
      await late.promise
    })
    expect(result.current.preview?.targetLabel).toBe("AxonHub")
  })

  it("aborts preview on close and never publishes a late result", async () => {
    const late = deferred<ManagedSiteMigrationCanonicalPreview>()
    let signal!: AbortSignal
    const onClose = vi.fn()
    const analytics = createAnalytics()
    const prepareMigration = vi.fn(
      ({
        options,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        options?: { signal?: AbortSignal }
      }) => {
        signal = options!.signal!
        return late.promise
      },
    )
    const options = buildOptions({
      analytics: analytics.analytics,
      onClose,
      prepareMigration,
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: options },
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    act(() => result.current.callbacks.onClose())
    rerender({ ...options, isOpen: false })

    await waitFor(() => expect(signal.aborted).toBe(true))
    expect(onClose).toHaveBeenCalledOnce()
    expect(result.current).toMatchObject({
      preview: null,
      result: null,
      isConfirmationOpen: false,
      isRunning: false,
      isRecoveryRunning: false,
    })
    await act(async () => {
      late.resolve(buildPreview(prepareMigration.mock.calls[0]![0].selections))
      await late.promise
    })
    expect(result.current.preview?.readyCount).not.toBe(2)
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        },
      },
    )
  })

  it("aborts preview on scope replacement and ignores the old scope result", async () => {
    const late = deferred<ManagedSiteMigrationCanonicalPreview>()
    const signals: AbortSignal[] = []
    const prepareMigration = vi
      .fn()
      .mockImplementationOnce(
        ({ options }: { options?: { signal?: AbortSignal } }) => {
          signals.push(options!.signal!)
          return late.promise
        },
      )
      .mockImplementationOnce(
        ({
          selections,
          targetSiteType,
          options,
        }: {
          selections: readonly ManagedSiteMigrationSelection[]
          targetSiteType: ManagedSiteType
          options?: { signal?: AbortSignal }
        }) => {
          signals.push(options!.signal!)
          return Promise.resolve(buildPreview(selections, targetSiteType))
        },
      )
    const first = buildOptions({ prepareMigration })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: first },
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    rerender(buildOptions({ prepareMigration, scopeIdentity: "scope-b" }))

    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))
    expect(signals[0]?.aborted).toBe(true)
    await act(async () => {
      late.resolve(buildPreview(prepareMigration.mock.calls[0]![0].selections))
      await late.promise
    })
    expect(result.current.preview?.readyCount).toBe(2)
  })

  it("aborts preview on unmount", async () => {
    const late = deferred<ManagedSiteMigrationCanonicalPreview>()
    let signal!: AbortSignal
    const prepareMigration = vi.fn(
      ({ options }: { options?: { signal?: AbortSignal } }) => {
        signal = options!.signal!
        return late.promise
      },
    )
    const options = buildOptions({ prepareMigration })
    const { unmount } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    unmount()

    expect(signal.aborted).toBe(true)
  })

  it("invalidates queued execution completion before true unmount cleanup yields", async () => {
    const analytics = createAnalytics()
    const execution = deferred<ManagedSiteMigrationCanonicalExecutionResult>()
    const refresh = vi.fn(async () => true)
    let executionSignal!: AbortSignal
    const executeMigration = vi.fn(
      ({ options }: { options?: { signal?: AbortSignal } }) => {
        executionSignal = options!.signal!
        return execution.promise
      },
    )
    const options = buildOptions({
      analytics: analytics.analytics,
      executeMigration,
      refresh,
      selectedRowKeys: ["opaque::second"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result, unmount } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    let confirmation = Promise.resolve()
    act(() => {
      confirmation = Promise.resolve(result.current.callbacks.onConfirm())
    })
    await waitFor(() => expect(executeMigration).toHaveBeenCalledOnce())

    const nativeQueueMicrotask = globalThis.queueMicrotask
    let wasExecutionAbortedWhenCleanupQueued = false
    const queueMicrotaskSpy = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation((callback) => {
        wasExecutionAbortedWhenCleanupQueued = executionSignal.aborted
        nativeQueueMicrotask(callback)
      })
    act(() => {
      execution.resolve(
        executionResult([
          {
            selectionId: "opaque::second",
            displayName: "Second example",
            status: "created",
          },
        ]),
      )
      unmount()
    })
    queueMicrotaskSpy.mockRestore()
    await act(async () => {
      await confirmation
      await Promise.resolve()
    })

    expect(wasExecutionAbortedWhenCleanupQueued).toBe(true)
    expect(executionSignal.aborted).toBe(true)
    expect(refresh).not.toHaveBeenCalled()
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      expect.any(Object),
    )
  })

  it("does not replace a generation for equivalent selection and target arrays", async () => {
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const base = buildOptions({ prepareMigration })
    const { rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: base },
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    rerender({
      ...base,
      selectedRowKeys: [...base.selectedRowKeys],
      targets: base.targets.map((targetOption) => ({ ...targetOption })),
    })

    expect(prepareMigration).toHaveBeenCalledOnce()
  })

  it("preserves an uncertain result across callback identity churn and uses latest callbacks on the next semantic scope", async () => {
    const firstPrepare = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const latestPrepare = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const refresh = vi.fn(async () => true)
    const first = buildOptions({
      executeMigration,
      prepareMigration: firstPrepare,
      refresh,
      selectedRowKeys: ["opaque::second"],
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: first },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())
    expect(result.current.refreshRequired).toBe(true)

    const latest = buildOptions({
      executeMigration: vi.fn(executeMigration),
      getSiteLabel: (siteType: ManagedSiteType) => `Latest ${siteType}`,
      prepareMigration: latestPrepare,
      refresh: vi.fn(refresh),
      resolveDisplayName: () => "Latest display name",
      resolveRef: () => createRef("latest-resource-secret"),
      scopeIdentity: first.scopeIdentity,
      selectedRowKeys: ["opaque::second"],
      t: ((key: string) => `latest:${key}`) as TFunction,
    })
    rerender(latest)

    expect(firstPrepare).toHaveBeenCalledOnce()
    expect(latestPrepare).not.toHaveBeenCalled()
    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.result?.items[0]?.status).toBe("uncertain")

    rerender({ ...latest, scopeIdentity: "latest-semantic-scope" })
    await waitFor(() => expect(latestPrepare).toHaveBeenCalledOnce())
    expect(latestPrepare.mock.calls[0]?.[0].selections[0]).toMatchObject({
      displayName: "Latest display name",
      ref: createRef("latest-resource-secret"),
    })
  })

  it("updates target labels and ignores target reorder without restarting or clearing an uncertain result", async () => {
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const base = buildOptions({
      executeMigration,
      prepareMigration,
      selectedRowKeys: ["opaque::second"],
      targets: [
        { value: SITE_TYPES.NEW_API, label: "New API" },
        { value: SITE_TYPES.AXON_HUB, label: "AxonHub" },
      ],
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: base },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    rerender({
      ...base,
      targets: [
        { value: SITE_TYPES.AXON_HUB, label: "AxonHub renamed" },
        { value: SITE_TYPES.NEW_API, label: "New API renamed" },
      ],
    })

    expect(prepareMigration).toHaveBeenCalledOnce()
    expect(result.current.preview?.targetLabel).toBe("New API renamed")
    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.result?.items[0]?.status).toBe("uncertain")
  })

  it("falls back when the selected target disappears and clears it without targets", async () => {
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const options = buildOptions({
      prepareMigration,
      targets: [
        { value: SITE_TYPES.NEW_API, label: "New API" },
        { value: SITE_TYPES.AXON_HUB, label: "AxonHub" },
      ],
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: options },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))

    act(() => result.current.callbacks.onTargetChange(SITE_TYPES.AXON_HUB))
    await waitFor(() =>
      expect(result.current.selectedTarget).toBe(SITE_TYPES.AXON_HUB),
    )

    rerender({
      ...options,
      targets: [{ value: SITE_TYPES.NEW_API, label: "New API" }],
    })
    await waitFor(() =>
      expect(result.current.selectedTarget).toBe(SITE_TYPES.NEW_API),
    )

    rerender({ ...options, targets: [] })
    await waitFor(() => expect(result.current.selectedTarget).toBe(""))
  })

  it("treats selecting the pending target again as a no-op", async () => {
    const pending = deferred<ManagedSiteMigrationCanonicalPreview>()
    let signal!: AbortSignal
    let selections!: readonly ManagedSiteMigrationSelection[]
    const prepareMigration = vi.fn(
      ({
        options,
        selections: currentSelections,
      }: {
        options?: { signal?: AbortSignal }
        selections: readonly ManagedSiteMigrationSelection[]
      }) => {
        signal = options!.signal!
        selections = currentSelections
        return pending.promise
      },
    )
    const options = buildOptions({ prepareMigration })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(prepareMigration).toHaveBeenCalledOnce())

    act(() =>
      result.current.callbacks.onTargetChange(result.current.selectedTarget),
    )

    expect(signal.aborted).toBe(false)
    await act(async () => {
      pending.resolve(buildPreview(selections))
      await pending.promise
    })
    expect(result.current.preview?.readyCount).toBe(2)
    expect(result.current.preview?.isLoading).toBe(false)
    expect(prepareMigration).toHaveBeenCalledOnce()
  })

  it("marks a manual replacement preview as loading until it settles", async () => {
    const replacement = deferred<ManagedSiteMigrationCanonicalPreview>()
    const selection: ManagedSiteMigrationSelection = {
      selectionId: "opaque::first",
      displayName: "First example",
      ref: createRef("resource-secret-first"),
    }
    const baseRefreshedPreview = buildPreview([selection])
    const baseRefreshedItem = baseRefreshedPreview.items[0]
    if (!baseRefreshedItem || baseRefreshedItem.status !== "ready") {
      throw new Error("Expected one ready refreshed preview item")
    }
    const refreshedPreview: ManagedSiteMigrationCanonicalPreview = {
      ...baseRefreshedPreview,
      items: [
        {
          ...baseRefreshedItem,
          target: {
            ...baseRefreshedItem.target,
            projection: {
              ...baseRefreshedItem.target.projection,
              baseUrl: "https://refreshed-target.example.invalid",
            },
          },
        },
      ],
    }
    const prepareMigration = vi
      .fn()
      .mockImplementationOnce(
        ({
          selections,
          targetSiteType,
        }: {
          selections: readonly ManagedSiteMigrationSelection[]
          targetSiteType: ManagedSiteType
        }) => Promise.resolve(buildPreview(selections, targetSiteType)),
      )
      .mockImplementationOnce(() => replacement.promise)
    const options = buildOptions({
      prepareMigration,
      selectedRowKeys: ["opaque::first"],
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))

    act(() => result.current.callbacks.onRefreshPreview())

    await waitFor(() =>
      expect(result.current.preview?.isManualLoading).toBe(true),
    )
    expect(result.current.preview).toMatchObject({
      rows: [],
      totalCount: 1,
      isLoading: true,
      isManualLoading: true,
    })

    await act(async () => {
      replacement.resolve(refreshedPreview)
      await replacement.promise
    })

    expect(result.current.preview?.isManualLoading).toBe(false)
    expect(
      result.current.preview?.rows[0]?.comparisons.find(
        ({ id }) => id === "baseUrl",
      )?.target,
    ).toBe("https://refreshed-target.example.invalid")
  })

  it("contains a synchronous prepare throw as one controlled preview failure", async () => {
    const analytics = createAnalytics()
    const prepareMigration = vi.fn(() => {
      throw new Error("sync-preview-sensitive-error")
    })
    const options = buildOptions({
      analytics: analytics.analytics,
      prepareMigration,
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())

    expect(result.current.preview?.isLoading).toBe(false)
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Preview,
        }),
      }),
    )
    expect(JSON.stringify(result.current)).not.toContain(
      "sync-preview-sensitive-error",
    )
  })

  it("continues preview when analytics start throws", async () => {
    const startAction = vi.fn(() => {
      throw new Error("analytics-start-sensitive-error")
    })
    const options = buildOptions({
      analytics: {
        managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        startAction,
      },
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))

    expect(startAction).toHaveBeenCalledOnce()
    expect(result.current.preview?.error).toBeNull()
  })

  it("keeps execution settled when analytics completion throws", async () => {
    const complete = vi.fn(() => {
      throw new Error("analytics-complete-sensitive-error")
    })
    const startAction = vi.fn(() => ({ complete }))
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "created",
        },
      ]),
    )
    const options = buildOptions({
      analytics: {
        managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        startAction,
      },
      executeMigration,
      selectedRowKeys: ["opaque::second"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())

    await act(async () => result.current.callbacks.onConfirm())

    expect(result.current.result?.items[0]?.status).toBe("success")
    expect(result.current.isRunning).toBe(false)
    expect(executeMigration).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledOnce()
  })

  it("does not emit synthetic cancellation or duplicate intent under StrictMode replay", async () => {
    const analytics = createAnalytics()
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    )
    const onClose = vi.fn()
    const options = buildOptions({
      analytics: analytics.analytics,
      onClose,
      prepareMigration,
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )
    const { result } = renderHook(
      () => useManagedResourceMigrationController(options),
      { wrapper },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))

    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.complete).not.toHaveBeenCalled()

    act(() => result.current.callbacks.onClose())

    expect(onClose).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      expect.any(Object),
    )
  })

  it("publishes uncertain execution as verify-required and consumes the preview without replay", async () => {
    const analytics = createAnalytics()
    const refresh = vi.fn(async () => true)
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const options = buildOptions({
      analytics: analytics.analytics,
      executeMigration,
      refresh,
      selectedRowKeys: ["opaque::second"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))

    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    expect(result.current.result).toMatchObject({
      refreshRequired: true,
      canReplay: false,
      items: [{ rowKey: "opaque::second", status: "uncertain" }],
    })
    expect(refresh).toHaveBeenCalledOnce()
    await act(async () => result.current.callbacks.onConfirm())
    expect(executeMigration).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureCount: 1,
          selectedCount: 1,
          successCount: 0,
        }),
      }),
    )
    expect(JSON.stringify(analytics.complete.mock.calls)).not.toContain(
      "scope-secret",
    )
    expect(JSON.stringify(analytics.complete.mock.calls)).not.toContain(
      "opaque::second",
    )
  })

  it("keeps an earlier created row created when a later row fails", async () => {
    const refresh = vi.fn(async () => true)
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "created",
        },
        {
          selectionId: "opaque::first",
          displayName: "First example",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        },
      ]),
    )
    const options = buildOptions({
      executeMigration,
      refresh,
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))

    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    expect(result.current.result?.items.map(({ status }) => status)).toEqual([
      "success",
      "failed",
    ])
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("orchestrates mixed ready and blocked selections without filtering or replay", async () => {
    const rowKeys = [
      "opaque::created",
      "opaque::failed",
      "opaque::blocked",
      "opaque::uncertain",
    ]
    let canonicalPreview!: ManagedSiteMigrationCanonicalPreview
    const prepareMigration = vi.fn(
      async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => {
        canonicalPreview = {
          sourceSiteType: SITE_TYPES.AXON_HUB,
          targetSiteType,
          generalWarningCodes: [],
          items: selections.map((selection, index) =>
            index === 2
              ? {
                  selection,
                  status: "blocked" as const,
                  warningCodes: [],
                  blockingReasonCode:
                    MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
                }
              : {
                  selection,
                  status: "ready" as const,
                  source,
                  target,
                  warningCodes: [],
                },
          ),
          totalCount: selections.length,
          readyCount: 3,
          blockedCount: 1,
        }
        return canonicalPreview
      },
    )
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::created",
          displayName: "Created example",
          status: "created",
        },
        {
          selectionId: "opaque::failed",
          displayName: "Failed example",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        },
        {
          selectionId: "opaque::blocked",
          displayName: "Blocked example",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        },
        {
          selectionId: "opaque::uncertain",
          displayName: "Uncertain example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const analytics = createAnalytics()
    const refresh = vi.fn(async () => true)
    const options = buildOptions({
      analytics: analytics.analytics,
      executeMigration,
      prepareMigration,
      refresh,
      selectedRowKeys: rowKeys,
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(3))
    expect(result.current.preview?.rows.map(({ status }) => status)).toEqual([
      "ready",
      "ready",
      "blocked",
      "ready",
    ])

    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    expect(executeMigration).toHaveBeenCalledWith({
      preview: canonicalPreview,
      options: { signal: expect.any(AbortSignal) },
    })
    expect(
      result.current.result?.items.map(({ rowKey, status }) => [
        rowKey,
        status,
      ]),
    ).toEqual([
      ["opaque::created", "success"],
      ["opaque::failed", "failed"],
      ["opaque::blocked", "skipped"],
      ["opaque::uncertain", "uncertain"],
    ])
    expect(result.current.result).toMatchObject({
      refreshRequired: true,
      canReplay: false,
    })
    expect(refresh).toHaveBeenCalledOnce()
    await act(async () => result.current.callbacks.onConfirm())
    expect(executeMigration).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.objectContaining({
        insights: expect.objectContaining({
          selectedCount: 4,
          successCount: 1,
          failureCount: 2,
          skippedCount: 1,
        }),
      }),
    )
    const publicState = JSON.stringify(result.current)
    expect(publicState).not.toContain("scope-secret.example.invalid")
    expect(publicState).not.toContain("resource-secret")
    expect(publicState).not.toContain("credential")
    expect(publicState).not.toContain("command")
  })

  it("consumes a preview on execute failure and reports the execute stage exactly once", async () => {
    const analytics = createAnalytics()
    const executeMigration = vi.fn(async () => {
      throw new Error("backend-sensitive-error")
    })
    const options = buildOptions({
      analytics: analytics.analytics,
      executeMigration,
      selectedRowKeys: ["opaque::first"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))

    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())
    await act(async () => result.current.callbacks.onConfirm())

    expect(executeMigration).toHaveBeenCalledOnce()
    expect(result.current.preview?.error).toBeTruthy()
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        }),
      }),
    )
    expect(JSON.stringify(result.current)).not.toContain(
      "backend-sensitive-error",
    )
  })

  it("keeps settled results visible and requires recovery when post-execution refresh fails", async () => {
    const analytics = createAnalytics()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("refresh-sensitive-error"))
      .mockResolvedValueOnce(true)
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::first",
          displayName: "First example",
          status: "created",
        },
      ]),
    )
    const options = buildOptions({
      analytics: analytics.analytics,
      executeMigration,
      refresh,
      selectedRowKeys: ["opaque::first"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))

    act(() => result.current.callbacks.onOpenConfirmation())
    expect(result.current.isConfirmationOpen).toBe(true)
    act(() => result.current.callbacks.onCloseConfirmation())
    expect(result.current.isConfirmationOpen).toBe(false)
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    expect(result.current.result?.items[0]?.status).toBe("success")
    expect(result.current.refreshRequired).toBe(true)
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Request,
        }),
      }),
    )

    await act(async () => result.current.callbacks.onRecoverRefreshRequired())

    expect(result.current.result?.items[0]?.status).toBe("success")
    expect(result.current.refreshRequired).toBe(false)
    expect(result.current.isRecoveryRunning).toBe(false)
    expect(JSON.stringify(result.current)).not.toContain(
      "refresh-sensitive-error",
    )
  })

  it("reports a controlled preview failure once without exposing service errors", async () => {
    const analytics = createAnalytics()
    const prepareMigration = vi.fn(async () => {
      throw new Error("preview-sensitive-error")
    })
    const options = buildOptions({
      analytics: analytics.analytics,
      prepareMigration,
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )

    await waitFor(() => expect(result.current.preview?.error).toBeTruthy())

    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Preview,
        }),
      }),
    )
    expect(JSON.stringify(result.current)).not.toContain(
      "preview-sensitive-error",
    )
  })

  it("aborts execution on scope replacement and rejects its late settled result", async () => {
    const late = deferred<ManagedSiteMigrationCanonicalExecutionResult>()
    const signals: AbortSignal[] = []
    const executeMigration = vi.fn(
      ({ options }: { options?: { signal?: AbortSignal } }) => {
        signals.push(options!.signal!)
        return late.promise
      },
    )
    const prepareMigration = async ({
      selections,
      targetSiteType,
    }: {
      selections: readonly ManagedSiteMigrationSelection[]
      targetSiteType: ManagedSiteType
    }) => buildPreview(selections, targetSiteType)
    const first = buildOptions({ executeMigration, prepareMigration })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: first },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(2))
    act(() => result.current.callbacks.onOpenConfirmation())
    let execution!: Promise<void>
    act(() => {
      execution = Promise.resolve(result.current.callbacks.onConfirm())
    })
    await waitFor(() => expect(executeMigration).toHaveBeenCalledOnce())

    rerender(
      buildOptions({
        executeMigration,
        prepareMigration,
        scopeIdentity: "replacement-scope",
      }),
    )

    expect(signals[0]?.aborted).toBe(true)
    await waitFor(() => expect(result.current.isRunning).toBe(false))
    await act(async () => {
      late.resolve(
        executionResult([
          {
            selectionId: "opaque::second",
            displayName: "Second example",
            status: "created",
          },
        ]),
      )
      await execution
    })
    expect(result.current.result).toBeNull()
  })

  it("rejects a stale recovery completion after replacement scope recovery starts", async () => {
    const recoveryA = deferred<boolean>()
    const recoveryB = deferred<boolean>()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => recoveryA.promise)
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => recoveryB.promise)
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const prepareMigration = async ({
      selections,
      targetSiteType,
    }: {
      selections: readonly ManagedSiteMigrationSelection[]
      targetSiteType: ManagedSiteType
    }) => buildPreview(selections, targetSiteType)
    const onClose = vi.fn()
    const first = buildOptions({
      executeMigration,
      onClose,
      prepareMigration,
      refresh,
      selectedRowKeys: ["opaque::second"],
    })
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildOptions>) =>
        useManagedResourceMigrationController(props),
      { initialProps: first },
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())
    expect(result.current.refreshRequired).toBe(true)

    let recoveryAPromise!: Promise<void>
    act(() => {
      recoveryAPromise = Promise.resolve(
        result.current.callbacks.onRecoverRefreshRequired(),
      )
    })
    await waitFor(() => expect(result.current.isRecoveryRunning).toBe(true))

    rerender(
      buildOptions({
        executeMigration,
        onClose,
        prepareMigration,
        refresh,
        scopeIdentity: "scope-generation-b",
        selectedRowKeys: ["opaque::second"],
      }),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())
    expect(result.current.refreshRequired).toBe(true)

    let recoveryBPromise!: Promise<void>
    act(() => {
      recoveryBPromise = Promise.resolve(
        result.current.callbacks.onRecoverRefreshRequired(),
      )
    })
    await waitFor(() => expect(result.current.isRecoveryRunning).toBe(true))

    await act(async () => {
      recoveryA.resolve(true)
      await recoveryAPromise
    })

    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.isRecoveryRunning).toBe(true)
    act(() => result.current.callbacks.onClose())
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      recoveryB.reject(new Error("refresh failed"))
      await recoveryBPromise
    })
    expect(result.current.refreshRequired).toBe(true)
    expect(result.current.isRecoveryRunning).toBe(false)
    expect(refresh).toHaveBeenCalledTimes(4)
  })

  it("coalesces reentrant recovery requests under one operation owner", async () => {
    const recovery = deferred<boolean>()
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(() => recovery.promise)
    const executeMigration = vi.fn(async () =>
      executionResult([
        {
          selectionId: "opaque::second",
          displayName: "Second example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ]),
    )
    const options = buildOptions({
      executeMigration,
      refresh,
      selectedRowKeys: ["opaque::second"],
      prepareMigration: async ({
        selections,
        targetSiteType,
      }: {
        selections: readonly ManagedSiteMigrationSelection[]
        targetSiteType: ManagedSiteType
      }) => buildPreview(selections, targetSiteType),
    })
    const { result } = renderHook(() =>
      useManagedResourceMigrationController(options),
    )
    await waitFor(() => expect(result.current.preview?.readyCount).toBe(1))
    act(() => result.current.callbacks.onOpenConfirmation())
    await act(async () => result.current.callbacks.onConfirm())

    let firstRecovery!: Promise<void>
    act(() => {
      firstRecovery = Promise.resolve(
        result.current.callbacks.onRecoverRefreshRequired(),
      )
      result.current.callbacks.onRecoverRefreshRequired()
    })

    expect(refresh).toHaveBeenCalledTimes(2)
    expect(result.current.isRecoveryRunning).toBe(true)
    await act(async () => {
      recovery.resolve(false)
      await firstRecovery
    })
    expect(result.current.isRecoveryRunning).toBe(false)
    expect(result.current.refreshRequired).toBe(true)
  })
})
