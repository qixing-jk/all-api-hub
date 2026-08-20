import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, expectTypeOf, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useManagedResourceListController as useManagedResourceListControllerBase } from "~/features/ManagedSiteChannels/controllers/useManagedResourceListController"
import { useManagedResourceMutationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMutationController"
import { createManagedResourcePresentationMapper } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  createManagedResourceEditor,
  createManagedResourceFacts,
  createManagedResourceWorkspace,
  EXAMPLE_MANAGED_RESOURCE_REF,
} from "~~/tests/test-utils/managedResourceWorkspace"

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const succeededFacts = (
  facts = createManagedResourceFacts(),
  effectKind: ManagedSiteMutationConfirmedEffect["kind"] = MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
): Extract<
  ManagedSiteMutationResult<ResourceDisplayFacts>,
  { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded }
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: facts,
  confirmedEffects: [
    {
      kind: effectKind,
      resourceKind: MANAGED_RESOURCE_KINDS.Channel,
      resourceId: facts.ref.resourceId,
    },
  ],
})

const succeededDelete = (
  resourceId = EXAMPLE_MANAGED_RESOURCE_REF.resourceId,
): Extract<
  ManagedSiteMutationResult<void>,
  { outcome: typeof MANAGED_SITE_MUTATION_OUTCOMES.Succeeded }
> => ({
  outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
  data: undefined,
  confirmedEffects: [
    {
      kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
      resourceKind: MANAGED_RESOURCE_KINDS.Channel,
      resourceId,
    },
  ],
})

const registration = (
  open: ManagedResourceRegistration["open"],
): ManagedResourceRegistration => ({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  open,
})

const EXAMPLE_LIST_SCOPE_KEY = "https://workspace.example.invalid"

type ManagedResourceListControllerOptions = Parameters<
  typeof useManagedResourceListControllerBase
>[0]

const useManagedResourceListController = (
  options: Omit<ManagedResourceListControllerOptions, "scopeKey"> &
    Partial<Pick<ManagedResourceListControllerOptions, "scopeKey">>,
) =>
  useManagedResourceListControllerBase({
    ...options,
    scopeKey: options.scopeKey ?? EXAMPLE_LIST_SCOPE_KEY,
  })

const renderIntegratedManagedResourceControllers = (
  value: ManagedResourceRegistration,
  options: { search?: string } = {},
) =>
  renderHook(() => {
    const collection = useManagedResourceListController({
      registration: value,
      scopeKey: EXAMPLE_MANAGED_RESOURCE_REF.scopeKey,
      ...options,
    })
    const mutation = useManagedResourceMutationController({
      workspace: collection.workspace,
      refresh: collection.refreshSilently,
      resolveRef: collection.resolveRef,
      acceptMutationResult: collection.acceptMutationResult,
      acceptDeletionResults: collection.acceptDeletionResults,
    })
    return { collection, mutation }
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

describe("useManagedResourceListController", () => {
  it("keeps OpenRouter outside the managed-resource registration boundary", () => {
    expectTypeOf(SITE_TYPES.OPENROUTER).not.toExtend<
      ManagedResourceRegistration["siteType"]
    >()
    expect(registration(vi.fn()).siteType).toBe(SITE_TYPES.AXON_HUB)
  })

  it("uses the existing Managed Site Channels taxonomy for manual refresh exactly once", async () => {
    const workspace = createManagedResourceWorkspace()
    const value = registration(async () => workspace)
    const analytics = createAnalytics()
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        analytics: analytics.analytics,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(analytics.startAction).not.toHaveBeenCalled()

    await act(async () => result.current.refresh())

    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        },
      },
    )
  })

  it("completes superseded refresh analytics once and ignores the late result", async () => {
    const late = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts("initial")] })
      .mockImplementationOnce(() => late.promise)
      .mockResolvedValueOnce({ items: [createManagedResourceFacts("fresh")] })
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const analytics = createAnalytics()
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        analytics: analytics.analytics,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let firstRefresh!: Promise<boolean>
    act(() => {
      firstRefresh = result.current.refresh()
    })
    await waitFor(() => expect(analytics.startAction).toHaveBeenCalledOnce())
    await act(async () => result.current.refresh())
    await firstRefresh

    expect(analytics.startAction).toHaveBeenCalledTimes(2)
    expect(analytics.complete.mock.calls).toEqual([
      [
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
          },
        },
      ],
      [
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
          },
        },
      ],
    ])

    await act(async () =>
      late.resolve({ items: [createManagedResourceFacts("late")] }),
    )
    expect(analytics.complete).toHaveBeenCalledTimes(2)
    expect(result.current.rows[0]?.name).toBe("Example resource fresh")
  })

  it("maps refresh failures to controlled analytics without backend details", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts()] })
      .mockRejectedValueOnce(
        new Error("token-private https://private.example.invalid/resource"),
      )
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const analytics = createAnalytics()
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        analytics: analytics.analytics,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => result.current.refresh())

    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: "unknown",
        insights: {
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        },
      },
    )
    const analyticsPayload = JSON.stringify([
      analytics.startAction.mock.calls,
      analytics.complete.mock.calls,
    ])
    expect(analyticsPayload).not.toContain("token-private")
    expect(analyticsPayload).not.toContain("private.example.invalid")
  })

  it("returns a structured reconciliation outcome and keeps the last accepted rows on failure", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts("old")] })
      .mockRejectedValueOnce(new Error("refresh failed"))
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )
    await waitFor(() => expect(result.current.rows[0]?.name).toContain("old"))

    let outcome: Awaited<ReturnType<typeof result.current.reconcile>>
    await act(async () => {
      outcome = await result.current.reconcile()
    })

    expect(outcome!).toEqual({
      outcome: "failed",
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    })
    expect(result.current.rows[0]?.name).toContain("old")
  })

  it("keeps crafted ref, secret, and adapter-message sentinels out of public state and analytics", async () => {
    const sensitiveControllerScope =
      "controller-scope-sensitive-18e2.example.invalid"
    const sensitiveScope = "scope-sensitive-7f04.example.invalid"
    const sensitiveResourceId = "resource-sensitive-91bd"
    const sensitiveSecret = "secret-sensitive-26ac"
    const sensitiveAdapterMessage = "adapter-sensitive-58de"
    const facts: ResourceDisplayFacts = {
      ...createManagedResourceFacts("safe-resource"),
      ref: {
        ...EXAMPLE_MANAGED_RESOURCE_REF,
        scopeKey: sensitiveScope,
        resourceId: sensitiveResourceId,
      },
      fields: [
        ...createManagedResourceFacts("safe-resource").fields,
        { fieldId: "key", kind: "secret", state: "available" },
      ],
    }
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [facts] })
      .mockRejectedValueOnce(
        new Error(`${sensitiveAdapterMessage}:${sensitiveSecret}`),
      )
    const analytics = createAnalytics()
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        scopeKey: sensitiveControllerScope,
        analytics: analytics.analytics,
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    await act(async () => result.current.refresh())

    const serializedPublicOutput = JSON.stringify({
      state: result.current,
      analytics: [
        analytics.startAction.mock.calls,
        analytics.complete.mock.calls,
      ],
    })
    for (const sentinel of [
      sensitiveControllerScope,
      sensitiveScope,
      sensitiveResourceId,
      sensitiveSecret,
      sensitiveAdapterMessage,
    ]) {
      expect(serializedPublicOutput).not.toContain(sentinel)
    }
  })

  it("normalizes search and drains every cursor page", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [createManagedResourceFacts("one")],
        nextCursor: "two",
      })
      .mockResolvedValueOnce({
        items: [createManagedResourceFacts("two")],
        nextCursor: "three",
      })
      .mockResolvedValueOnce({ items: [createManagedResourceFacts("three")] })
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        search: "  example  ",
      }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(3))
    expect(list.mock.calls.map(([query]) => query)).toEqual([
      { search: "example" },
      { search: "example", cursor: "two" },
      { search: "example", cursor: "three" },
    ])
  })

  it("rejects a repeated cursor independently of resource duplication", async () => {
    const workspace = createManagedResourceWorkspace({
      list: vi
        .fn()
        .mockResolvedValueOnce({
          items: [createManagedResourceFacts("one")],
          nextCursor: "again",
        })
        .mockResolvedValueOnce({
          items: [createManagedResourceFacts("two")],
          nextCursor: "again",
        }),
    })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
    expect(result.current.rows).toEqual([])
  })

  it("rejects a duplicate resource ref independently of cursor repetition", async () => {
    const workspace = createManagedResourceWorkspace({
      list: vi
        .fn()
        .mockResolvedValueOnce({
          items: [createManagedResourceFacts("duplicate")],
          nextCursor: "second-page",
        })
        .mockResolvedValueOnce({
          items: [createManagedResourceFacts("duplicate")],
        }),
    })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
    expect(result.current.rows).toEqual([])
  })

  it("fails closed after the bounded one-hundred-page collection limit", async () => {
    let page = 0
    const list = vi.fn(async () => {
      const current = page++
      return {
        items: [createManagedResourceFacts(`page-${current}`)],
        nextCursor: `cursor-${current + 1}`,
      }
    })
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(list).toHaveBeenCalledTimes(100)
    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
    expect(result.current.rows).toEqual([])
  })

  it("preserves accepted rows, selection, and page when a same-scope refresh fails", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          createManagedResourceFacts("one", "One"),
          createManagedResourceFacts("two", "Two"),
          createManagedResourceFacts("three", "Three"),
        ],
      })
      .mockRejectedValueOnce(new Error("adapter-private-message"))
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value, pageSize: 1 }),
    )

    await waitFor(() => expect(result.current.totalRows).toBe(3))
    const selectedRowKey = result.current.allRows[2]!.rowKey
    act(() => {
      result.current.setPageIndex(2)
      result.current.setSelectedRowKeys({ [selectedRowKey]: true })
    })

    await act(async () => result.current.refresh())

    expect(result.current.rows[0]?.name).toBe("Three")
    expect(result.current.pageIndex).toBe(2)
    expect(result.current.selectedRowKeys).toEqual({ [selectedRowKey]: true })
    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
    })
  })

  it("reconciles selection and clamps the page after an accepted same-scope refresh", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          createManagedResourceFacts("one", "One"),
          createManagedResourceFacts("two", "Two"),
          createManagedResourceFacts("three", "Three"),
        ],
      })
      .mockResolvedValueOnce({
        items: [
          createManagedResourceFacts("one", "One"),
          createManagedResourceFacts("two", "Two"),
        ],
      })
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        scopeKey: EXAMPLE_LIST_SCOPE_KEY,
        pageSize: 1,
      }),
    )

    await waitFor(() => expect(result.current.totalRows).toBe(3))
    const keptRowKey = result.current.allRows[0]!.rowKey
    const removedRowKey = result.current.allRows[2]!.rowKey
    act(() => {
      result.current.setPageIndex(2)
      result.current.setSelectedRowKeys({
        [keptRowKey]: true,
        [removedRowKey]: true,
      })
    })

    await act(async () => result.current.refresh())

    expect(result.current.pageIndex).toBe(1)
    expect(result.current.selectedRowKeys).toEqual({ [keptRowKey]: true })
  })

  it("resets selection and page after accepting a changed search", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          createManagedResourceFacts("one", "One"),
          createManagedResourceFacts("two", "Two"),
          createManagedResourceFacts("three", "Three"),
        ],
      })
      .mockResolvedValueOnce({
        items: [
          createManagedResourceFacts("one", "One"),
          createManagedResourceFacts("two", "Two"),
          createManagedResourceFacts("three", "Three"),
        ],
      })
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result, rerender } = renderHook(
      ({ search }) =>
        useManagedResourceListController({
          registration: value,
          scopeKey: EXAMPLE_LIST_SCOPE_KEY,
          search,
          pageSize: 1,
        }),
      { initialProps: { search: "" } },
    )

    await waitFor(() => expect(result.current.totalRows).toBe(3))
    const selectedRowKey = result.current.allRows[2]!.rowKey
    act(() => {
      result.current.setPageIndex(2)
      result.current.setSelectedRowKeys({ [selectedRowKey]: true })
    })

    rerender({ search: "new query" })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.pageIndex).toBe(0)
    expect(result.current.selectedRowKeys).toEqual({})
  })

  it("clears accepted rows when a new deployment scope fails to load", async () => {
    const first = registration(async () =>
      createManagedResourceWorkspace({
        list: vi.fn(async () => ({
          items: [createManagedResourceFacts("old", "Old deployment")],
        })),
      }),
    )
    const second = registration(async () => {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
      })
    })
    const { result, rerender } = renderHook(
      ({ value, scopeKey }) =>
        useManagedResourceListController({
          registration: value,
          scopeKey,
        }),
      {
        initialProps: {
          value: first,
          scopeKey: "https://first-workspace.example.invalid",
        },
      },
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    rerender({
      value: second,
      scopeKey: "https://second-workspace.example.invalid",
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.rows).toEqual([])
    expect(result.current.workspace).toBeNull()
    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  })

  it("clears the status filter when the deployment scope changes", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            ...createManagedResourceFacts("first", "First deployment"),
            status: "disabled" as const,
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [createManagedResourceFacts("second", "Second deployment")],
      })
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result, rerender } = renderHook(
      ({ scopeKey }) =>
        useManagedResourceListController({ registration: value, scopeKey }),
      {
        initialProps: {
          scopeKey: "https://first-workspace.example.invalid",
        },
      },
    )

    await waitFor(() => expect(result.current.totalRows).toBe(1))
    act(() => result.current.setStatusFilter(["disabled"]))
    expect(result.current.statusFilter).toEqual(["disabled"])

    rerender({ scopeKey: "https://second-workspace.example.invalid" })

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.statusFilter).toEqual([])
    expect(result.current.rows.map((row) => row.name)).toEqual([
      "Second deployment",
    ])
  })

  it("signals unsupported search without dispatching a list request", async () => {
    const onUnsupportedSearch = vi.fn()
    const workspace = createManagedResourceWorkspace({
      capabilities: {
        canSearch: false,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      },
    })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        search: "example",
        onUnsupportedSearch,
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(onUnsupportedSearch).toHaveBeenCalledOnce()
    expect(workspace.list).not.toHaveBeenCalled()
    expect(result.current.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  })

  it("uses capabilities as the only search support contract", async () => {
    const list = vi.fn(async () => ({ items: [] }))
    const workspace = {
      ...createManagedResourceWorkspace({ list }),
      supportsSearch: false,
    }
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({
        registration: value,
        search: " example ",
      }),
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(list).toHaveBeenCalledWith(
      { search: "example" },
      { signal: expect.any(AbortSignal) },
    )
  })

  it("aborts an explicit cancellation and ignores an abort-insensitive late result", async () => {
    const late = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [createManagedResourceFacts("accepted")],
      })
      .mockImplementationOnce(() => late.promise)
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    let refresh!: Promise<boolean>
    act(() => {
      refresh = result.current.refresh()
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    const signal = (list as ReturnType<typeof vi.fn>).mock.calls[1][1]?.signal
    act(() => result.current.cancelCollection())

    expect(signal?.aborted).toBe(true)
    expect(result.current.isLoading).toBe(false)
    await expect(refresh).resolves.toBe(false)
    await act(async () =>
      late.resolve({ items: [createManagedResourceFacts("late", "Late")] }),
    )
    expect(result.current.rows[0]?.name).toBe("Example resource accepted")
  })

  it("does not let a cancelled generation finish loading for its replacement", async () => {
    const cancelled = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const replacement = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts("initial")] })
      .mockImplementationOnce(() => cancelled.promise)
      .mockImplementationOnce(() => replacement.promise)
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )

    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    let cancelledRefresh!: Promise<boolean>
    act(() => {
      cancelledRefresh = result.current.refresh()
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    act(() => result.current.cancelCollection())
    expect(result.current.isLoading).toBe(false)

    let replacementRefresh!: Promise<boolean>
    act(() => {
      replacementRefresh = result.current.refresh()
    })
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    await expect(cancelledRefresh).resolves.toBe(false)
    expect(result.current.isLoading).toBe(true)

    await act(async () =>
      replacement.resolve({
        items: [createManagedResourceFacts("replacement", "Replacement")],
      }),
    )
    await expect(replacementRefresh).resolves.toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.rows[0]?.name).toBe("Replacement")
  })

  it.each([
    {
      name: "the mutation fails without refreshing",
      submit: vi.fn(
        async () =>
          ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "permission denied",
              code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
            },
          }) as const,
      ),
      expectRefresh: false,
    },
    {
      name: "the mutation succeeds and its refresh fails",
      submit: vi.fn(async () =>
        succeededFacts(createManagedResourceFacts("saved")),
      ),
      expectRefresh: true,
    },
  ])(
    "does not leave collection loading after mutation cancellation when $name",
    async ({ submit, expectRefresh }) => {
      const pending = deferred<{ items: readonly ResourceDisplayFacts[] }>()
      const list = vi
        .fn()
        .mockResolvedValueOnce({
          items: [createManagedResourceFacts("accepted")],
        })
        .mockImplementationOnce(() => pending.promise)
        .mockRejectedValueOnce(new Error("refresh failed"))
      const editor = createManagedResourceEditor({ submit })
      const workspace = createManagedResourceWorkspace({
        list,
        openEditEditor: vi.fn(async () => editor),
      })
      const value = registration(async () => workspace)
      const { result } = renderHook(() => {
        const collection = useManagedResourceListController({
          registration: value,
          scopeKey: EXAMPLE_LIST_SCOPE_KEY,
        })
        const mutation = useManagedResourceMutationController({
          workspace: collection.workspace,
          refresh: collection.refresh,
          resolveRef: collection.resolveRef,
          onMutationStart: collection.cancelCollection,
        })
        return { collection, mutation }
      })

      await waitFor(() =>
        expect(result.current.collection.rows).toHaveLength(1),
      )
      const rowKey = result.current.collection.rows[0]!.rowKey
      await act(async () => result.current.mutation.openEdit(rowKey))
      act(() => {
        void result.current.collection.refresh()
      })
      await waitFor(() =>
        expect(result.current.collection.isLoading).toBe(true),
      )

      await act(async () => result.current.mutation.submit({ name: "changed" }))

      expect(list).toHaveBeenCalledTimes(expectRefresh ? 3 : 2)
      expect(result.current.collection.isLoading).toBe(false)
    },
  )

  it("aborts and rejects late abort-insensitive generations on scope replacement", async () => {
    const late = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const first = registration(async () =>
      createManagedResourceWorkspace({ list: vi.fn(() => late.promise) }),
    )
    const second = registration(async () =>
      createManagedResourceWorkspace({
        list: vi.fn(async () => ({
          items: [createManagedResourceFacts("fresh", "Fresh")],
        })),
      }),
    )
    const { result, rerender } = renderHook(
      ({ value }) => useManagedResourceListController({ registration: value }),
      { initialProps: { value: first } },
    )
    rerender({ value: second })
    await waitFor(() => expect(result.current.rows[0]?.name).toBe("Fresh"))
    await act(async () =>
      late.resolve({ items: [createManagedResourceFacts("late")] }),
    )
    expect(result.current.rows[0]?.name).toBe("Fresh")
  })

  it("aborts and rejects a late generation when normalized search changes", async () => {
    const late = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const list = vi
      .fn()
      .mockImplementationOnce(() => late.promise)
      .mockResolvedValueOnce({
        items: [createManagedResourceFacts("fresh", "Fresh search")],
      })
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { result, rerender } = renderHook(
      ({ search }) =>
        useManagedResourceListController({ registration: value, search }),
      { initialProps: { search: "old" } },
    )
    await waitFor(() => expect(list).toHaveBeenCalledOnce())
    const oldSignal = (list as ReturnType<typeof vi.fn>).mock.calls[0][1]
      ?.signal

    rerender({ search: "new" })
    await waitFor(() =>
      expect(result.current.rows[0]?.name).toBe("Fresh search"),
    )
    expect(oldSignal?.aborted).toBe(true)

    await act(async () =>
      late.resolve({ items: [createManagedResourceFacts("late", "Late")] }),
    )
    expect(result.current.rows[0]?.name).toBe("Fresh search")
  })

  it("aborts collection on unmount without publishing a late result", async () => {
    const late = deferred<{ items: readonly ResourceDisplayFacts[] }>()
    const list = vi.fn(() => late.promise)
    const workspace = createManagedResourceWorkspace({ list })
    const value = registration(async () => workspace)
    const { unmount } = renderHook(() =>
      useManagedResourceListController({ registration: value }),
    )
    await waitFor(() => expect(list).toHaveBeenCalledOnce())
    const signal = (list as ReturnType<typeof vi.fn>).mock.calls[0][1]?.signal

    unmount()

    expect(signal?.aborted).toBe(true)
    late.resolve({ items: [createManagedResourceFacts("late")] })
  })

  it("filters status and paginates over the fully collected set", async () => {
    const disabled = {
      ...createManagedResourceFacts("two"),
      status: "disabled" as const,
    }
    const workspace = createManagedResourceWorkspace({
      list: vi.fn(async () => ({
        items: [createManagedResourceFacts("one"), disabled],
      })),
    })
    const value = registration(async () => workspace)
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value, pageSize: 1 }),
    )
    await waitFor(() => expect(result.current.totalRows).toBe(2))
    act(() => result.current.setStatusFilter(["disabled"]))
    expect(result.current.rows.map((row) => row.name)).toEqual([
      "Example resource two",
    ])
    expect(result.current.totalRows).toBe(1)
  })

  it("clamps pagination to filtered rows without refetching", async () => {
    const list = vi.fn(async () => ({
      items: [
        createManagedResourceFacts("one", "Enabled one"),
        createManagedResourceFacts("two", "Enabled two"),
        {
          ...createManagedResourceFacts("three", "Disabled three"),
          status: "disabled" as const,
        },
      ],
    }))
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result } = renderHook(() =>
      useManagedResourceListController({ registration: value, pageSize: 1 }),
    )
    await waitFor(() => expect(result.current.totalRows).toBe(3))
    act(() => result.current.setPageIndex(2))

    act(() => result.current.setStatusFilter(["disabled"]))

    await waitFor(() => expect(result.current.pageIndex).toBe(0))
    expect(result.current.rows.map((row) => row.name)).toEqual([
      "Disabled three",
    ])
    expect(list).toHaveBeenCalledOnce()
  })

  it("clamps pagination when page size changes without refetching", async () => {
    const list = vi.fn(async () => ({
      items: [
        createManagedResourceFacts("one", "First resource"),
        createManagedResourceFacts("two", "Second resource"),
        createManagedResourceFacts("three", "Third resource"),
      ],
    }))
    const value = registration(async () =>
      createManagedResourceWorkspace({ list }),
    )
    const { result, rerender } = renderHook(
      ({ pageSize }) =>
        useManagedResourceListController({ registration: value, pageSize }),
      { initialProps: { pageSize: 1 } },
    )
    await waitFor(() => expect(result.current.totalRows).toBe(3))
    act(() => result.current.setPageIndex(2))

    rerender({ pageSize: 2 })

    await waitFor(() => expect(result.current.pageIndex).toBe(1))
    expect(result.current.rows.map((row) => row.name)).toEqual([
      "Third resource",
    ])
    expect(list).toHaveBeenCalledOnce()
  })

  it.each([
    {
      mode: "edit" as const,
      saved: createManagedResourceFacts(
        EXAMPLE_MANAGED_RESOURCE_REF.resourceId,
        "Renamed resource",
      ),
      expectedNames: ["Renamed resource"],
    },
    {
      mode: "create" as const,
      saved: createManagedResourceFacts("created-resource", "Created resource"),
      expectedNames: [
        "Created resource",
        "Example resource opaque-resource-id",
      ],
    },
  ])(
    "accepts complete $mode results into the collection without listing again",
    async ({ mode, saved, expectedNames }) => {
      const editor = createManagedResourceEditor({
        submit: vi.fn(async () =>
          succeededFacts(
            saved,
            mode === "create"
              ? MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated
              : MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
          ),
        ),
      })
      const list = vi.fn(async () => ({
        items: [createManagedResourceFacts()],
      }))
      const workspace = createManagedResourceWorkspace({
        list,
        openCreateEditor: vi.fn(async () => editor),
        openEditEditor: vi.fn(async () => editor),
      })
      const value = registration(async () => workspace)
      const { result } = renderIntegratedManagedResourceControllers(value)

      await waitFor(() =>
        expect(result.current.collection.allRows).toHaveLength(1),
      )
      if (mode === "create") {
        await act(async () => result.current.mutation.openCreate())
      } else {
        const rowKey = result.current.collection.allRows[0]!.rowKey
        await act(async () => result.current.mutation.openEdit(rowKey))
      }
      await act(async () =>
        result.current.mutation.submit({ name: saved.displayName }),
      )

      expect(result.current.collection.allRows.map(({ name }) => name)).toEqual(
        expectedNames,
      )
      expect(list).toHaveBeenCalledOnce()
    },
  )

  it("falls back to an authoritative list when search makes edit membership ambiguous", async () => {
    const saved = createManagedResourceFacts(
      EXAMPLE_MANAGED_RESOURCE_REF.resourceId,
      "Renamed resource",
    )
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => succeededFacts(saved)),
    })
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts()] })
      .mockResolvedValueOnce({ items: [saved] })
    const workspace = createManagedResourceWorkspace({
      list,
      openEditEditor: vi.fn(async () => editor),
    })
    const value = registration(async () => workspace)
    const { result } = renderIntegratedManagedResourceControllers(value, {
      search: "resource",
    })

    await waitFor(() =>
      expect(result.current.collection.allRows).toHaveLength(1),
    )
    const rowKey = result.current.collection.allRows[0]!.rowKey
    await act(async () => result.current.mutation.openEdit(rowKey))
    await act(async () => result.current.mutation.submit({ name: "Renamed" }))

    expect(result.current.collection.allRows[0]?.name).toBe("Renamed resource")
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("supersedes an older collection before accepting a complete edit result", async () => {
    const staleCollection = deferred<{
      items: readonly ResourceDisplayFacts[]
    }>()
    const saved = createManagedResourceFacts(
      EXAMPLE_MANAGED_RESOURCE_REF.resourceId,
      "Saved resource",
    )
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => succeededFacts(saved)),
    })
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [createManagedResourceFacts()] })
      .mockImplementationOnce(() => staleCollection.promise)
    const workspace = createManagedResourceWorkspace({
      list,
      openEditEditor: vi.fn(async () => editor),
    })
    const value = registration(async () => workspace)
    const { result } = renderIntegratedManagedResourceControllers(value)

    await waitFor(() =>
      expect(result.current.collection.allRows).toHaveLength(1),
    )
    const rowKey = result.current.collection.allRows[0]!.rowKey
    await act(async () => result.current.mutation.openEdit(rowKey))
    let staleRefresh!: Promise<boolean>
    act(() => {
      staleRefresh = result.current.collection.refresh()
    })
    await waitFor(() => expect(result.current.collection.isLoading).toBe(true))

    await act(async () => result.current.mutation.submit({ name: "Saved" }))
    expect(result.current.collection.allRows[0]?.name).toBe("Saved resource")
    expect(result.current.collection.isLoading).toBe(false)

    await act(async () => {
      staleCollection.resolve({
        items: [
          createManagedResourceFacts(
            EXAMPLE_MANAGED_RESOURCE_REF.resourceId,
            "Stale resource",
          ),
        ],
      })
      await staleRefresh
    })
    expect(result.current.collection.allRows[0]?.name).toBe("Saved resource")
    expect(list).toHaveBeenCalledTimes(2)
  })

  it("removes only confirmed deleted rows without listing again", async () => {
    const first = createManagedResourceFacts("first", "First resource")
    const second = createManagedResourceFacts("second", "Second resource")
    const list = vi.fn(async () => ({ items: [first, second] }))
    const workspace = createManagedResourceWorkspace({
      list,
      delete: vi.fn(async (ref) =>
        ref.resourceId === first.ref.resourceId
          ? succeededDelete(ref.resourceId)
          : {
              outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
              diagnostic: { message: "permission denied" },
            },
      ),
    })
    const value = registration(async () => workspace)
    const { result } = renderIntegratedManagedResourceControllers(value)

    await waitFor(() =>
      expect(result.current.collection.allRows).toHaveLength(2),
    )
    const [firstRow, secondRow] = result.current.collection.allRows
    act(() =>
      result.current.collection.setSelectedRowKeys({
        [firstRow!.rowKey]: true,
        [secondRow!.rowKey]: true,
      }),
    )
    await act(async () =>
      result.current.mutation.openBulkDelete([
        firstRow!.rowKey,
        secondRow!.rowKey,
      ]),
    )
    await act(async () => result.current.mutation.confirmDelete())

    expect(result.current.collection.allRows.map(({ name }) => name)).toEqual([
      "Second resource",
    ])
    expect(result.current.collection.selectedRowKeys).toEqual({
      [secondRow!.rowKey]: true,
    })
    expect(
      result.current.collection.resolveRef(firstRow!.rowKey),
    ).toBeUndefined()
    expect(
      result.current.mutation.deleteState.results.map(({ status }) => status),
    ).toEqual(["success", "failed"])
    expect(list).toHaveBeenCalledOnce()
  })

  it("rejects a late deletion result from a replaced deployment scope", async () => {
    const oldFacts = createManagedResourceFacts("old", "Old resource")
    const replacementScope = "https://replacement.example.invalid"
    const replacementFacts = {
      ...createManagedResourceFacts("replacement", "Replacement resource"),
      ref: {
        ...EXAMPLE_MANAGED_RESOURCE_REF,
        scopeKey: replacementScope,
        resourceId: "replacement",
      },
    }
    const oldRegistration = registration(async () =>
      createManagedResourceWorkspace({
        list: vi.fn(async () => ({ items: [oldFacts] })),
      }),
    )
    const replacementRegistration = registration(async () =>
      createManagedResourceWorkspace({
        list: vi.fn(async () => ({ items: [replacementFacts] })),
      }),
    )
    const { result, rerender } = renderHook(
      ({ value, scopeKey }) =>
        useManagedResourceListController({
          registration: value,
          scopeKey,
        }),
      {
        initialProps: {
          value: oldRegistration,
          scopeKey: EXAMPLE_MANAGED_RESOURCE_REF.scopeKey,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.allRows[0]?.name).toBe("Old resource"),
    )
    const oldRowKey = result.current.allRows[0]!.rowKey
    rerender({
      value: replacementRegistration,
      scopeKey: replacementScope,
    })
    await waitFor(() =>
      expect(result.current.allRows[0]?.name).toBe("Replacement resource"),
    )

    let accepted = true
    act(() => {
      accepted = result.current.acceptDeletionResults([
        { rowKey: oldRowKey, ref: oldFacts.ref },
      ])
    })

    expect(accepted).toBe(false)
    expect(result.current.allRows.map(({ name }) => name)).toEqual([
      "Replacement resource",
    ])
  })
})

describe("useManagedResourceMutationController", () => {
  it("keeps a succeeded editor visible until the accepted refresh completes", async () => {
    const refresh = deferred<boolean>()
    const saved = createManagedResourceFacts("saved")
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => succeededFacts(saved)),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: () => refresh.promise,
      }),
    )

    await act(async () => result.current.openCreate())
    let submission!: ReturnType<typeof result.current.submit>
    act(() => {
      submission = result.current.submit({ name: "saved" })
    })
    await waitFor(() => expect(editor.submit).toHaveBeenCalledOnce())
    expect(result.current.editor).toBe(editor)

    await act(async () => {
      refresh.resolve(true)
      await submission
    })

    expect(result.current.editor).toBeNull()
    await expect(submission).resolves.toBe(saved)
  })

  it("does not locally accept a create result with an update effect", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () =>
        succeededFacts(createManagedResourceFacts("created")),
      ),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const refresh = vi.fn(async () => true)
    const acceptMutationResult = vi.fn(() => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        acceptMutationResult,
      }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "Created" }))

    expect(acceptMutationResult).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("keeps provider rejection reusable and stores only a controlled failure", async () => {
    const providerSecret = "provider-secret-placeholder"
    const editor = createManagedResourceEditor({
      fields: [
        {
          fieldId: "credential",
          type: "secret",
          secretState: "unavailable",
          canReplace: true,
          allowClear: false,
        },
      ],
      submit: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: `permission denied ${providerSecret}`,
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
          raw: { secret: providerSecret },
        },
      })),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())
    await act(async () =>
      result.current.submit({
        credential: { kind: "replace", value: providerSecret },
      }),
    )

    expect(result.current.editor).toBe(editor)
    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
        message: "permission denied [REDACTED]",
      },
    })
    expect(JSON.stringify(result.current)).not.toContain(providerSecret)
  })

  it("falls back to a controlled rejection when submitted secrets cannot be inspected", async () => {
    const providerText = "provider rejection must not be projected"
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: providerText,
          code: "provider_private_code",
        },
      })),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const values = new Proxy(
      { credential: "hidden" },
      {
        ownKeys() {
          throw new Error("secret inspection unavailable")
        },
      },
    )
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit(values))

    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected },
    })
    expect(JSON.stringify(result.current)).not.toContain(providerText)
  })

  it("preserves an unknown provider code as controlled upstream context", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: "Provider conflict",
          code: "provider_conflict",
        },
      })),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "Example" }))

    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
        message: "Provider conflict",
        upstreamCode: "provider_conflict",
      },
    })
  })

  it.each([
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceUpdated,
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          },
        ],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
        diagnostic: {
          message: "Provider confirmed one step before failing",
          raw: "provider-raw-partial-placeholder",
        },
      },
      expectedMessage: "Provider confirmed one step before failing",
    },
    {
      outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: {
          message: "  Provider response was lost  ",
          raw: "provider-raw-uncertain-placeholder",
        },
      },
      expectedMessage: "Provider response was lost",
    },
  ] as const)(
    "closes and reconciles a $outcome submit once without replay",
    async ({ result: mutationResult, expectedMessage }) => {
      const editor = createManagedResourceEditor({
        submit: vi.fn(async () => mutationResult),
      })
      const refresh = vi.fn(async () => false)
      const workspace = createManagedResourceWorkspace({
        openCreateEditor: vi.fn(async () => editor),
      })
      const { result } = renderHook(() =>
        useManagedResourceMutationController({ workspace, refresh }),
      )

      await act(async () => result.current.openCreate())
      await act(async () => result.current.submit({ name: "changed" }))
      await act(async () => result.current.submit({ name: "do not replay" }))

      expect(editor.submit).toHaveBeenCalledOnce()
      expect(refresh).toHaveBeenCalledOnce()
      expect(result.current.editor).toBeNull()
      expect(result.current.deleteState.requiresFreshRead).toBe(true)
      expect(result.current.editorFeedback).toEqual({
        kind: "save-uncertain",
        failure: {
          code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
          message: expectedMessage,
        },
      })
      expect(JSON.stringify(result.current)).not.toContain("provider-raw")
    },
  )

  it.each(["malformed", "thrown"] as const)(
    "lets a %s public submit failure escape without projecting or replaying it",
    async (mode) => {
      const secret = "submit-secret-placeholder"
      const thrownError = new Error(`provider throw ${secret}`)
      const editor = createManagedResourceEditor({
        submit: vi.fn(async () => {
          if (mode === "thrown") {
            throw thrownError
          }
          return { malformed: `provider result ${secret}` } as never
        }),
      })
      const refresh = vi.fn(async () => true)
      const workspace = createManagedResourceWorkspace({
        openCreateEditor: vi.fn(async () => editor),
      })
      const { result } = renderHook(() =>
        useManagedResourceMutationController({ workspace, refresh }),
      )

      await act(async () => result.current.openCreate())
      let caught: unknown
      await act(async () => {
        try {
          await result.current.submit({
            credential: { kind: "replace", value: secret },
          })
        } catch (error) {
          caught = error
        }
      })

      if (mode === "thrown") expect(caught).toBe(thrownError)
      else expect(caught).toBeInstanceOf(TypeError)
      expect(editor.submit).toHaveBeenCalledOnce()
      expect(result.current.editor).toBe(editor)
      expect(result.current.editorFeedback).toBeNull()
      expect(refresh).not.toHaveBeenCalled()
      expect(JSON.stringify(result.current)).not.toContain(secret)
    },
  )

  it("classifies editor open failures separately from save failures", async () => {
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())

    expect(result.current.editorFeedback).toEqual({
      kind: "open-failed",
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable },
    })
  })

  it("classifies edit editor open failures", async () => {
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
        })
      }),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    await act(async () => result.current.openEdit("opaque-row"))

    expect(result.current.editorFeedback).toEqual({
      kind: "open-failed",
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable },
    })
  })

  it("keeps the editor open without exposing a controlled rejection token", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(
        async () =>
          ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "unavailable",
              code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable,
            },
          }) as const,
      ),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "changed" }))

    expect(result.current.editor).toBe(editor)
    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable },
    })
  })

  it("keeps validation failures in editor feedback without submitting", async () => {
    const editor = createManagedResourceEditor({
      validate: vi.fn(
        (): ResourceValidationResult => ({
          valid: false,
          issues: [{ fieldId: "name", code: "required" }],
        }),
      ),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "" }))

    expect(editor.submit).not.toHaveBeenCalled()
    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        fieldIssues: [{ fieldId: "name", code: "required" }],
      },
    })
    expect(result.current.editorFailure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      fieldIssues: [{ fieldId: "name", code: "required" }],
    })
  })

  it("omits a whitespace-padded controlled token from uncertain save feedback", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: {
          message: `  ${MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain}  `,
        },
      })),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => true),
      }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "changed" }))

    expect(result.current.editor).toBeNull()
    expect(result.current.editorFeedback).toEqual({
      kind: "save-uncertain",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
  })

  it("notifies the route after a confirmed save and accepted refresh", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const onMutationSuccess = vi.fn()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => true),
        onMutationSuccess,
      }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "saved" }))

    expect(onMutationSuccess).toHaveBeenCalledWith("create")
  })

  it("does not notify the route when the saved refresh is rejected", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const onMutationSuccess = vi.fn()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => false),
        onMutationSuccess,
      }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "saved" }))

    expect(onMutationSuccess).not.toHaveBeenCalled()
  })

  it("keeps saved-refresh feedback until an accepted fresh-read recovery", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace, refresh }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "saved" }))

    expect(result.current.editorFeedback).toEqual({
      kind: "saved-refresh-failed",
    })
    expect(result.current.deleteState.requiresFreshRead).toBe(true)

    await act(async () => result.current.recoverFreshRead())
    expect(result.current.editorFeedback).toEqual({
      kind: "saved-refresh-failed",
    })
    expect(result.current.deleteState.requiresFreshRead).toBe(true)

    await act(async () => result.current.recoverFreshRead())
    expect(result.current.editorFeedback).toBeNull()
    expect(result.current.deleteState.requiresFreshRead).toBe(false)
  })

  it("exposes a controller-owned single-delete confirmation session", () => {
    const workspace = createManagedResourceWorkspace()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    expect(typeof result.current.openDelete).toBe("function")
    expect(typeof result.current.confirmDelete).toBe("function")
    expect(typeof result.current.cancelDelete).toBe("function")
    expect(typeof result.current.recoverFreshRead).toBe("function")
  })

  it("owns detail and editor sessions and rejects late replacement results", async () => {
    const late = deferred<ResourceDisplayFacts>()
    const oldWorkspace = createManagedResourceWorkspace({
      get: vi.fn(() => late.promise),
    })
    const newWorkspace = createManagedResourceWorkspace()
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useManagedResourceMutationController({
          workspace,
          resolveRef: mapper.resolveRef,
          mapFacts: mapper.map,
        }),
      { initialProps: { workspace: oldWorkspace } },
    )
    let detailPromise!: Promise<void>
    act(() => {
      detailPromise = result.current.openDetail(rowKey)
    })
    rerender({ workspace: newWorkspace })
    await act(async () => late.resolve(createManagedResourceFacts("late")))
    await detailPromise
    expect(result.current.detail).toBeNull()
    await act(async () => result.current.openCreate())
    expect(result.current.editorMode).toBe("create")
  })

  it("ignores a late detail result when an accepted refresh removes its row", async () => {
    const late = deferred<ResourceDisplayFacts>()
    const workspace = createManagedResourceWorkspace({
      get: vi.fn(() => late.promise),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    let detailPromise!: Promise<void>
    act(() => {
      detailPromise = result.current.openDetail(rowKey)
    })
    act(() => {
      mapper.accept([])
    })
    await act(async () => {
      late.resolve(createManagedResourceFacts("removed"))
      await detailPromise
    })

    expect(result.current.detail).toBeNull()
    expect(mapper.resolveRef(rowKey)).toBeUndefined()
  })

  it("ignores a late edit result when the row key resolves to a replacement ref", async () => {
    const late = deferred<ReturnType<typeof createManagedResourceEditor>>()
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(() => late.promise),
    })
    const analytics = createAnalytics()
    let currentRef = EXAMPLE_MANAGED_RESOURCE_REF
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: () => currentRef,
        analytics: analytics.analytics,
      }),
    )

    let editorPromise!: Promise<void>
    act(() => {
      editorPromise = result.current.openEdit("stable-row-key")
    })
    currentRef = { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId: "replacement" }
    await act(async () => {
      late.resolve(createManagedResourceEditor())
      await editorPromise
    })

    expect(result.current.editor).toBeNull()
    expect(result.current.editorMode).toBeNull()
    expect(analytics.startAction).toHaveBeenCalledOnce()
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

  it("recovers the list after a not-found detail read without publishing stale detail", async () => {
    const workspace = createManagedResourceWorkspace({
      get: vi.fn(async () => {
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
        })
      }),
    })
    const refresh = vi.fn(async () => true)
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openDetail(rowKey))

    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.detail).toBeNull()
    expect(result.current.detailFailure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    })
  })

  it("rejects stale row keys before detail or editor adapter access", async () => {
    const workspace = createManagedResourceWorkspace()
    const mapper = createManagedResourcePresentationMapper()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openDetail("stale-row"))
    await act(async () => result.current.openEdit("stale-row"))

    expect(workspace.get).not.toHaveBeenCalled()
    expect(workspace.openEditEditor).not.toHaveBeenCalled()
    expect(result.current.detailFailure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
    expect(result.current.editorFailure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  })

  it("guards every competing mutation session while a coalesced submit is active", async () => {
    const saved = deferred<ManagedSiteMutationResult<ResourceDisplayFacts>>()
    const editor = createManagedResourceEditor({
      submit: vi.fn(() => saved.promise),
    })
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => true),
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    let first!: ReturnType<typeof result.current.submit>
    let second!: ReturnType<typeof result.current.submit>
    act(() => {
      first = result.current.submit({ name: "changed" })
      second = result.current.submit({ name: "duplicate" })
    })
    expect(second).toBe(first)

    await act(async () => result.current.openDetail(rowKey))
    await act(async () => result.current.openCreate())
    await act(async () => result.current.openEdit(rowKey))
    let opened = true
    act(() => {
      opened = result.current.openDelete(rowKey)
    })

    expect(opened).toBe(false)
    expect(workspace.get).not.toHaveBeenCalled()
    expect(workspace.openCreateEditor).not.toHaveBeenCalled()
    expect(workspace.openEditEditor).toHaveBeenCalledOnce()
    expect(workspace.delete).not.toHaveBeenCalled()

    await act(async () => {
      saved.resolve(succeededFacts(createManagedResourceFacts("saved")))
      await first
    })
  })

  it("rejects delete while an editor session is open and allows it after close", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => true),
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    let opened = true
    act(() => {
      opened = result.current.openDelete(rowKey)
    })
    expect(opened).toBe(false)
    expect(result.current.deleteState.isOpen).toBe(false)

    act(() => result.current.closeEditor())
    act(() => {
      opened = result.current.openDelete(rowKey)
    })
    expect(opened).toBe(true)
  })

  it("rejects cross-session opens and ignores deferred results after another session starts", async () => {
    const detail = deferred<ResourceDisplayFacts>()
    const edit = deferred<ReturnType<typeof createManagedResourceEditor>>()
    const workspace = createManagedResourceWorkspace({
      get: vi.fn(() => detail.promise),
      openEditEditor: vi.fn(() => edit.promise),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    let detailPromise!: Promise<void>
    act(() => {
      detailPromise = result.current.openDetail(rowKey)
    })
    let rejectedEdit!: Promise<void>
    act(() => {
      rejectedEdit = result.current.openEdit(rowKey)
    })
    expect(workspace.openEditEditor).not.toHaveBeenCalled()
    await rejectedEdit

    act(() => result.current.closeDetail())
    let editPromise!: Promise<void>
    act(() => {
      editPromise = result.current.openEdit(rowKey)
    })
    await act(async () => {
      detail.resolve(createManagedResourceFacts("late-detail"))
      await detailPromise
    })
    expect(result.current.detail).toBeNull()

    act(() => result.current.closeEditor())
    await act(async () => result.current.openCreate())
    await act(async () => {
      edit.resolve(createManagedResourceEditor())
      await editPromise
    })
    expect(result.current.editorMode).toBe("create")
  })

  it("never coexists delete confirmation with detail or editor state", async () => {
    const workspace = createManagedResourceWorkspace()
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openDetail(rowKey))
    let opened = true
    act(() => {
      opened = result.current.openDelete(rowKey)
    })
    expect(opened).toBe(false)
    expect(result.current.deleteState.isOpen).toBe(false)
    act(() => result.current.closeDetail())

    await act(async () => result.current.openCreate())
    act(() => {
      opened = result.current.openDelete(rowKey)
    })
    expect(opened).toBe(false)
    expect(result.current.deleteState.isOpen).toBe(false)
  })

  it("locks new sessions after a confirmed submit when refresh is not accepted", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: mapper.resolveRef,
        mapFacts: mapper.map,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    await act(async () => result.current.submit({ name: "changed" }))

    expect(result.current.deleteState.requiresFreshRead).toBe(true)
    await act(async () => result.current.openCreate())
    expect(workspace.openCreateEditor).not.toHaveBeenCalled()

    await act(async () => result.current.recoverFreshRead())
    expect(result.current.deleteState.requiresFreshRead).toBe(false)
    await act(async () => result.current.openCreate())
    expect(workspace.openCreateEditor).toHaveBeenCalledOnce()
  })

  it("keeps the shared mutation lock after confirmed success when refresh throws", async () => {
    const editor = createManagedResourceEditor()
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => {
          throw new Error("refresh failed")
        }),
        resolveRef: mapper.resolveRef,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    await act(async () => result.current.submit({ name: "changed" }))

    expect(result.current.deleteState.requiresFreshRead).toBe(true)
    await act(async () => result.current.openCreate())
    await act(async () => result.current.openEdit(rowKey))
    act(() => {
      result.current.openDelete(rowKey)
    })
    await act(async () => result.current.openBulkDelete([rowKey]))
    expect(workspace.openCreateEditor).not.toHaveBeenCalled()
    expect(workspace.openEditEditor).toHaveBeenCalledOnce()
    expect(workspace.delete).not.toHaveBeenCalled()
  })

  it.each([
    ["false", vi.fn(async () => false)],
    ["absent", undefined],
    [
      "throw",
      vi.fn(async () => {
        throw new Error("refresh failed")
      }),
    ],
  ])(
    "keeps the shared mutation lock after an uncertain submit when refresh is %s",
    async (_label, refresh) => {
      const editor = createManagedResourceEditor({
        submit: vi.fn(async () => ({
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
          diagnostic: { message: "mutation state uncertain" },
        })),
      })
      const workspace = createManagedResourceWorkspace({
        openEditEditor: vi.fn(async () => editor),
      })
      const mapper = createManagedResourcePresentationMapper()
      const rowKey = mapper.map(createManagedResourceFacts()).rowKey
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: mapper.resolveRef,
        }),
      )

      await act(async () => result.current.openEdit(rowKey))
      await act(async () => result.current.submit({ name: "changed" }))

      expect(result.current.editor).toBeNull()
      expect(result.current.deleteState.requiresFreshRead).toBe(true)
      await act(async () => result.current.openCreate())
      act(() => {
        result.current.openDelete(rowKey)
      })
      await act(async () => result.current.openBulkDelete([rowKey]))
      expect(workspace.openCreateEditor).not.toHaveBeenCalled()
      expect(workspace.delete).not.toHaveBeenCalled()
    },
  )

  it("keeps a rejected not-found editor reusable without refreshing", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(
        async () =>
          ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "not found",
              code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
            },
          }) as const,
      ),
    })
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const refresh = vi.fn(async () => false)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: mapper.resolveRef,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    await act(async () => result.current.submit({ name: "changed" }))

    expect(result.current.editor).toBe(editor)
    expect(result.current.editorFeedback).toEqual({
      kind: "save-failed",
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
        message: "not found",
      },
    })
    expect(result.current.deleteState.requiresFreshRead).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("omits whitespace-only uncertain feedback and does not replay", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: {
          message: "   ",
        },
      })),
    })
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const refresh = vi.fn(async () => true)
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: mapper.resolveRef,
      }),
    )
    await act(async () => result.current.openEdit(rowKey))
    await act(async () => result.current.submit({ name: "changed" }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.editor).toBeNull()
    expect(result.current.editorFailure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    })
    await act(async () => result.current.submit({ name: "again" }))
    expect(editor.submit).toHaveBeenCalledOnce()
  })

  it("coalesces submit and emits one controlled update action and result", async () => {
    const saved = deferred<ManagedSiteMutationResult<ResourceDisplayFacts>>()
    const editor = createManagedResourceEditor({
      submit: vi.fn(() => saved.promise),
    })
    const workspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const refresh = vi.fn(async () => true)
    const analytics = createAnalytics()
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const onMutationStart = vi.fn()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: mapper.resolveRef,
        analytics: analytics.analytics,
        onMutationStart,
      }),
    )

    await act(async () => result.current.openEdit(rowKey))
    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let first!: ReturnType<typeof result.current.submit>
    let second!: ReturnType<typeof result.current.submit>
    act(() => {
      first = result.current.submit({ name: "changed" })
      second = result.current.submit({ name: "duplicate" })
    })
    expect(second).toBe(first)
    expect(editor.submit).toHaveBeenCalledOnce()
    expect(onMutationStart).toHaveBeenCalledOnce()

    await act(async () => {
      saved.resolve(succeededFacts(createManagedResourceFacts("saved")))
      await first
    })

    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        },
      },
    )
  })

  it("starts create analytics on editor open and completes cancellation once", async () => {
    const workspace = createManagedResourceWorkspace()
    const analytics = createAnalytics()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        analytics: analytics.analytics,
      }),
    )

    await act(async () => result.current.openCreate())

    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    act(() => result.current.closeEditor())

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

  it("reports a controlled analytics failure when a confirmed save cannot refresh", async () => {
    const editor = createManagedResourceEditor({
      submit: vi.fn(async () =>
        succeededFacts(createManagedResourceFacts("saved")),
      ),
    })
    const workspace = createManagedResourceWorkspace({
      openCreateEditor: vi.fn(async () => editor),
    })
    const analytics = createAnalytics()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => false),
        analytics: analytics.analytics,
      }),
    )

    await act(async () => result.current.openCreate())
    await act(async () => result.current.submit({ name: "saved" }))

    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: "unknown",
        insights: {
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
        },
      },
    )
  })

  it("cancels submit analytics once when a stale workspace aborts the generation", async () => {
    const saved = deferred<ManagedSiteMutationResult<ResourceDisplayFacts>>()
    const editor = createManagedResourceEditor({
      submit: vi.fn(() => saved.promise),
    })
    const oldWorkspace = createManagedResourceWorkspace({
      openEditEditor: vi.fn(async () => editor),
    })
    const newWorkspace = createManagedResourceWorkspace()
    const refresh = vi.fn(async () => true)
    const analytics = createAnalytics()
    const mapper = createManagedResourcePresentationMapper()
    const rowKey = mapper.map(createManagedResourceFacts()).rowKey
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: mapper.resolveRef,
          analytics: analytics.analytics,
        }),
      { initialProps: { workspace: oldWorkspace } },
    )

    await act(async () => result.current.openEdit(rowKey))
    let submission!: ReturnType<typeof result.current.submit>
    act(() => {
      submission = result.current.submit({ name: "changed" })
    })
    const signal = (editor.submit as ReturnType<typeof vi.fn>).mock.calls[0][1]
      ?.signal
    rerender({ workspace: newWorkspace })
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      saved.resolve(succeededFacts(createManagedResourceFacts("late")))
      await submission
    })

    expect(refresh).not.toHaveBeenCalled()
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

  it.each([
    {
      label: "succeeded",
      result: succeededDelete(),
      expectedStatus: "success" as const,
    },
    {
      label: "rejected",
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: "private rejected",
          code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
          raw: "private raw",
        },
      } as const,
      expectedStatus: "failed" as const,
    },
    {
      label: "generic not_found",
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: "private not found",
          code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
          raw: "private raw",
        },
      } as const,
      expectedStatus: "failed" as const,
    },
    {
      label: "partial",
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceDeleted,
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          },
        ],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
        diagnostic: { message: "private partial", raw: "private raw" },
      } as const,
      expectedStatus: "uncertain" as const,
    },
    {
      label: "uncertain",
      result: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "private uncertain", raw: "private raw" },
      } as const,
      expectedStatus: "uncertain" as const,
    },
  ])(
    "maps a $label delete result without retaining diagnostics",
    async ({ result: deleteResult, expectedStatus }) => {
      const workspace = createManagedResourceWorkspace({
        delete: vi.fn(async () => deleteResult),
      })
      const refresh = vi.fn(async () => true)
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        }),
      )

      act(() => {
        result.current.openDelete("opaque-row")
      })
      await act(async () => result.current.confirmDelete())

      expect(result.current.deleteState.results).toEqual([
        {
          rowKey: "opaque-row",
          status: expectedStatus,
          resultKey: `delete_${expectedStatus}`,
        },
      ])
      expect(refresh).toHaveBeenCalledOnce()
      expect(JSON.stringify(result.current.deleteState)).not.toContain(
        "private",
      )
    },
  )

  it.each(["malformed", "thrown"] as const)(
    "lets a %s public delete failure escape without projecting or replaying it",
    async (mode) => {
      const secret = "delete-secret-placeholder"
      const thrownError = new Error(`provider throw ${secret}`)
      const workspace = createManagedResourceWorkspace({
        delete: vi.fn(async () => {
          if (mode === "thrown") throw thrownError
          return { malformed: `provider result ${secret}` } as never
        }),
      })
      const refresh = vi.fn(async () => true)
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        }),
      )

      act(() => {
        result.current.openDelete("opaque-row")
      })
      let caught: unknown
      await act(async () => {
        try {
          await result.current.confirmDelete()
        } catch (error) {
          caught = error
        }
      })

      if (mode === "thrown") expect(caught).toBe(thrownError)
      else expect(caught).toBeInstanceOf(TypeError)
      expect(workspace.delete).toHaveBeenCalledOnce()
      expect(refresh).toHaveBeenCalledOnce()
      expect(result.current.deleteState.results).toEqual([])
      expect(result.current.deleteState.requiresFreshRead).toBe(false)
      expect(JSON.stringify(result.current.deleteState)).not.toContain(secret)
    },
  )

  it("does not locally accept an uncertain delete result", async () => {
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(async () => ({
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "mutation state uncertain" },
      })),
    })
    const refresh = vi.fn(async () => true)
    const acceptDeletionResults = vi.fn(() => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        acceptDeletionResults,
      }),
    )

    act(() => {
      result.current.openDelete("opaque-row")
    })
    await act(async () => result.current.confirmDelete())

    expect(acceptDeletionResults).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.deleteState.results[0]?.status).toBe("uncertain")
  })

  it("does not locally accept a delete effect for another resource", async () => {
    const matching = succeededDelete()
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(async () => ({
        ...matching,
        confirmedEffects: [
          ...matching.confirmedEffects,
          ...succeededDelete("another-resource").confirmedEffects,
        ],
      })),
    })
    const refresh = vi.fn(async () => true)
    const acceptDeletionResults = vi.fn(() => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        acceptDeletionResults,
      }),
    )

    act(() => {
      result.current.openDelete("opaque-row")
    })
    await act(async () => result.current.confirmDelete())

    expect(acceptDeletionResults).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it("owns single-delete open, cancel, capability, and stale-row guards", async () => {
    let currentRef = EXAMPLE_MANAGED_RESOURCE_REF
    const workspace = createManagedResourceWorkspace()
    const resolveRef = vi.fn(() => currentRef)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace, resolveRef }),
    )

    let opened = false
    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(true)
    expect(result.current.deleteState).toMatchObject({
      isOpen: true,
      rowKeys: ["opaque-row"],
    })
    act(() => result.current.cancelDelete())
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      rowKeys: [],
    })
    await act(async () => result.current.confirmDelete())
    expect(workspace.delete).not.toHaveBeenCalled()

    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(true)
    currentRef = { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId: "replacement" }
    await act(async () => result.current.confirmDelete())
    expect(workspace.delete).not.toHaveBeenCalled()
    expect(result.current.deleteState.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })

    const unsupportedWorkspace = createManagedResourceWorkspace({
      capabilities: {
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
      },
    })
    const unsupported = renderHook(() =>
      useManagedResourceMutationController({
        workspace: unsupportedWorkspace,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )
    act(() => {
      opened = unsupported.result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(false)
    expect(unsupported.result.current.deleteState.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  })

  it("does not replace an active single-delete confirmation session", () => {
    const firstRef = EXAMPLE_MANAGED_RESOURCE_REF
    const secondRef = { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId: "second" }
    const workspace = createManagedResourceWorkspace()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: (rowKey) => (rowKey === "first" ? firstRef : secondRef),
      }),
    )

    let firstOpened = false
    let secondOpened = true
    act(() => {
      firstOpened = result.current.openDelete("first")
      secondOpened = result.current.openDelete("second")
    })

    expect(firstOpened).toBe(true)
    expect(secondOpened).toBe(false)
    expect(result.current.deleteState.rowKeys).toEqual(["first"])
  })

  it("requires an accepted fresh read after every unaccepted single-delete refresh", async () => {
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(
        async () =>
          ({
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "permission denied",
              code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
            },
          }) as const,
      ),
    })
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    let opened = false
    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(true)
    await act(async () => result.current.confirmDelete())
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.deleteState).toMatchObject({
      requiresFreshRead: true,
      results: [{ status: "failed" }],
    })
    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(false)
    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    expect(workspace.delete).toHaveBeenCalledOnce()

    await act(async () => result.current.recoverFreshRead())
    expect(result.current.deleteState.requiresFreshRead).toBe(true)
    await act(async () => result.current.recoverFreshRead())
    expect(result.current.deleteState.requiresFreshRead).toBe(false)

    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(true)
    await act(async () => result.current.confirmDelete())
    expect(workspace.delete).toHaveBeenCalledTimes(2)
  })

  it.each([
    {
      label: "not-found rejection",
      deleteResult: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: {
          message: "not found",
          code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
        },
      } as const,
      expectedStatus: "failed" as const,
      expectedAnalyticsResult: PRODUCT_ANALYTICS_RESULTS.Failure,
    },
    {
      label: "uncertain result",
      deleteResult: {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "mutation state uncertain" },
      } as const,
      expectedStatus: "uncertain" as const,
      expectedAnalyticsResult: PRODUCT_ANALYTICS_RESULTS.Failure,
    },
  ])(
    "maps a $label and emits one controlled result",
    async ({ deleteResult, expectedStatus, expectedAnalyticsResult }) => {
      const workspace = createManagedResourceWorkspace({
        delete: vi.fn(async () => deleteResult),
      })
      const analytics = createAnalytics()
      const refresh = vi.fn(async () => true)
      const { result } = renderHook(() =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
          analytics: analytics.analytics,
        }),
      )

      act(() => {
        result.current.openDelete("opaque-row")
      })
      await act(async () => result.current.confirmDelete())

      expect(result.current.deleteState.results).toEqual([
        {
          rowKey: "opaque-row",
          status: expectedStatus,
          resultKey: `delete_${expectedStatus}`,
        },
      ])
      expect(refresh).toHaveBeenCalledOnce()
      expect(analytics.startAction).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(analytics.complete).toHaveBeenCalledOnce()
      expect(analytics.complete).toHaveBeenCalledWith(expectedAnalyticsResult, {
        insights: {
          failureCount: 1,
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
          selectedCount: 1,
          successCount: 0,
        },
      })
    },
  )

  it("coalesces reentrant single delete and cancels analytics on unmount without late publication", async () => {
    const pending = deferred<ManagedSiteMutationResult<void>>()
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(() => pending.promise),
    })
    const refresh = vi.fn(async () => true)
    const analytics = createAnalytics()
    const { result, unmount } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        analytics: analytics.analytics,
      }),
    )

    let opened = false
    act(() => {
      opened = result.current.openDelete("opaque-row")
    })
    expect(opened).toBe(true)
    let first!: ReturnType<typeof result.current.confirmDelete>
    let second!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      first = result.current.confirmDelete()
      second = result.current.confirmDelete()
    })
    expect(second).toBe(first)
    await waitFor(() => expect(workspace.delete).toHaveBeenCalledOnce())
    const signal = (workspace.delete as ReturnType<typeof vi.fn>).mock
      .calls[0][1]?.signal

    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      pending.resolve(succeededDelete())
      await first
    })

    expect(refresh).not.toHaveBeenCalled()
    expect(analytics.startAction).toHaveBeenCalledOnce()
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

  it("opens bulk-delete confirmation without dispatch and cancels without side effects", async () => {
    const workspace = createManagedResourceWorkspace()
    const analytics = createAnalytics()
    const onMutationStart = vi.fn()
    const refs = {
      first: EXAMPLE_MANAGED_RESOURCE_REF,
      second: { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId: "second" },
    }
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: (rowKey) => refs[rowKey as keyof typeof refs],
        analytics: analytics.analytics,
        onMutationStart,
      }),
    )

    await act(async () => result.current.openBulkDelete(["first", "second"]))

    expect(workspace.delete).not.toHaveBeenCalled()
    expect(analytics.startAction).not.toHaveBeenCalled()
    expect(onMutationStart).not.toHaveBeenCalled()
    expect(result.current.deleteState).toMatchObject({
      isOpen: true,
      isExecuting: false,
      rowKeys: ["first", "second"],
    })

    act(() => result.current.cancelDelete())

    expect(workspace.delete).not.toHaveBeenCalled()
    expect(analytics.startAction).not.toHaveBeenCalled()
    expect(onMutationStart).not.toHaveBeenCalled()
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      rowKeys: [],
    })
  })

  it("rejects the entire confirmed bulk delete when any ref identity changes", async () => {
    const firstRef = EXAMPLE_MANAGED_RESOURCE_REF
    let secondRef = { ...EXAMPLE_MANAGED_RESOURCE_REF, resourceId: "second" }
    const workspace = createManagedResourceWorkspace()
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: (rowKey) => (rowKey === "first" ? firstRef : secondRef),
      }),
    )

    await act(async () => result.current.openBulkDelete(["first", "second"]))
    secondRef = { ...secondRef, resourceId: "replacement" }
    await act(async () => result.current.confirmDelete())

    expect(workspace.delete).not.toHaveBeenCalled()
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      rowKeys: [],
      failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
    })
  })

  it("blocks replay after an unexpected bulk-delete failure until a fresh read is accepted", async () => {
    const privateDetail = "bulk-delete-private-detail"
    const programmingError = new Error(privateDetail)
    const deleteResource = vi
      .fn<ManagedResourceWorkspace["delete"]>()
      .mockRejectedValueOnce(programmingError)
      .mockResolvedValueOnce(succeededDelete())
    const workspace = createManagedResourceWorkspace({
      delete: deleteResource,
    })
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    let caught: unknown
    await act(async () => {
      try {
        await result.current.confirmDelete()
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBe(programmingError)
    expect(deleteResource).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      isExecuting: false,
      rowKeys: [],
      results: [],
      requiresRefresh: true,
      requiresFreshRead: true,
      failure: {
        code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
    })
    expect(JSON.stringify(result.current.deleteState)).not.toContain(
      privateDetail,
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      isExecuting: false,
      rowKeys: [],
      requiresFreshRead: true,
    })

    await act(async () => result.current.recoverFreshRead())
    expect(result.current.deleteState.requiresFreshRead).toBe(false)

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    expect(result.current.deleteState).toMatchObject({
      isOpen: true,
      isExecuting: false,
      rowKeys: ["opaque-row"],
    })
    await act(async () => result.current.confirmDelete())

    expect(deleteResource).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(3)
    expect(result.current.deleteState.results).toEqual([
      {
        rowKey: "opaque-row",
        status: "success",
        resultKey: "delete_success",
      },
    ])
  })

  it("releases the mutation lock after a fresh read accepts an unexpected delete failure", async () => {
    const programmingError = new Error("bulk-delete-programming-failure")
    const deleteResource = vi
      .fn<ManagedResourceWorkspace["delete"]>()
      .mockRejectedValueOnce(programmingError)
      .mockResolvedValueOnce(succeededDelete())
    const workspace = createManagedResourceWorkspace({
      delete: deleteResource,
    })
    const refresh = vi.fn(async () => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    let caught: unknown
    await act(async () => {
      try {
        await result.current.confirmDelete()
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBe(programmingError)
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.deleteState).toMatchObject({
      isOpen: false,
      isExecuting: false,
      requiresRefresh: false,
      requiresFreshRead: false,
      failure: null,
    })

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    expect(result.current.deleteState.isOpen).toBe(true)
    expect(deleteResource).toHaveBeenCalledOnce()
  })

  it("preserves unexpected delete error identity when the workspace changes during reconciliation", async () => {
    const programmingError = new Error("bulk-delete-programming-failure")
    const refresh = deferred<boolean>()
    const oldWorkspace = createManagedResourceWorkspace({
      delete: vi.fn().mockRejectedValue(programmingError),
    })
    const newWorkspace = createManagedResourceWorkspace()
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useManagedResourceMutationController({
          workspace,
          refresh: () => refresh.promise,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        }),
      { initialProps: { workspace: oldWorkspace } },
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    let execution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      execution = result.current.confirmDelete()
    })
    await waitFor(() => expect(oldWorkspace.delete).toHaveBeenCalledOnce())
    rerender({ workspace: newWorkspace })

    let caught: unknown
    await act(async () => {
      refresh.resolve(true)
      try {
        await execution
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBe(programmingError)
  })

  it("preserves a pending delete rejection after switching workspaces without refreshing or writing new state", async () => {
    const pending = deferred<ManagedSiteMutationResult<void>>()
    const programmingError = new Error("late bulk-delete programming failure")
    const oldRefresh = vi.fn(async () => true)
    const newRefresh = vi.fn(async () => true)
    const oldWorkspace = createManagedResourceWorkspace({
      delete: vi.fn(() => pending.promise),
    })
    const newWorkspace = createManagedResourceWorkspace()
    const { result, rerender } = renderHook(
      ({ workspace, refresh }) =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        }),
      {
        initialProps: { workspace: oldWorkspace, refresh: oldRefresh },
      },
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    let execution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      execution = result.current.confirmDelete()
    })
    await waitFor(() => expect(oldWorkspace.delete).toHaveBeenCalledOnce())
    rerender({ workspace: newWorkspace, refresh: newRefresh })
    const newWorkspaceDeleteState = result.current.deleteState

    let caught: unknown
    await act(async () => {
      pending.reject(programmingError)
      try {
        await execution
      } catch (error) {
        caught = error
      }
    })

    expect(caught).toBe(programmingError)
    expect(oldRefresh).not.toHaveBeenCalled()
    expect(newRefresh).not.toHaveBeenCalled()
    expect(result.current.deleteState).toBe(newWorkspaceDeleteState)
  })

  it("coalesces repeated confirmation of one bulk-delete session", async () => {
    const pending = deferred<ManagedSiteMutationResult<void>>()
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(() => pending.promise),
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh: vi.fn(async () => true),
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
      }),
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    let first!: ReturnType<typeof result.current.confirmDelete>
    let second!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      first = result.current.confirmDelete()
      second = result.current.confirmDelete()
    })

    expect(second).toBe(first)
    await waitFor(() => expect(workspace.delete).toHaveBeenCalledOnce())
    await act(async () => {
      pending.resolve(succeededDelete())
      await first
    })
  })

  it("snapshots row keys, limits deletes to four, preserves order, and refreshes once", async () => {
    let active = 0
    let peak = 0
    const gates = Array.from({ length: 6 }, () => deferred<void>())
    const refs = Array.from({ length: 6 }, (_, index) => ({
      ...EXAMPLE_MANAGED_RESOURCE_REF,
      resourceId: `resource-${index}`,
    }))
    const workspace = createManagedResourceWorkspace({
      delete: vi.fn(async (ref) => {
        const index = Number(ref.resourceId.split("-")[1])
        active += 1
        peak = Math.max(peak, active)
        await gates[index].promise
        active -= 1
        if (index === 1)
          return {
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
            diagnostic: {
              message: "permission denied",
              code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
            },
          } as const
        if (index === 2)
          return {
            outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
            diagnostic: { message: "mutation state uncertain" },
          } as const
        return succeededDelete()
      }),
    })
    const refresh = vi.fn(async () => false)
    const resolveRef = vi.fn(
      (rowKey: string) => refs[Number(rowKey.split("-")[1])],
    )
    const { result } = renderHook(() =>
      useManagedResourceMutationController({ workspace, refresh, resolveRef }),
    )

    await act(async () =>
      result.current.openBulkDelete(refs.map((_, index) => `row-${index}`)),
    )
    let execution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      execution = result.current.confirmDelete()
    })
    await waitFor(() => expect(workspace.delete).toHaveBeenCalledTimes(4))
    expect(peak).toBe(4)
    await act(async () => {
      gates.forEach((gate) => gate.resolve())
      await execution
    })
    expect(
      result.current.deleteState.results.map(({ status }) => status),
    ).toEqual([
      "success",
      "failed",
      "uncertain",
      "success",
      "success",
      "success",
    ])
    expect(refresh).toHaveBeenCalledOnce()
    expect(result.current.deleteState.requiresRefresh).toBe(true)
    await act(async () => result.current.openBulkDelete(["row-0"]))
    expect(workspace.delete).toHaveBeenCalledTimes(6)
  })

  it("emits one controlled bulk-delete action and result", async () => {
    const analytics = createAnalytics()
    const workspace = createManagedResourceWorkspace()
    const refresh = vi.fn(async () => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        analytics: analytics.analytics,
      }),
    )

    await act(async () => result.current.openBulkDelete(["opaque-row"]))
    expect(workspace.delete).not.toHaveBeenCalled()
    await act(async () => result.current.confirmDelete())

    expect(analytics.startAction).toHaveBeenCalledOnce()
    expect(analytics.startAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(analytics.complete).toHaveBeenCalledOnce()
    expect(analytics.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          failureCount: 0,
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.AxonHub,
          selectedCount: 1,
          successCount: 1,
        },
      },
    )
  })

  it("rejects empty or duplicate bulk-delete snapshots without replay", async () => {
    const analytics = createAnalytics()
    const workspace = createManagedResourceWorkspace()
    const refresh = vi.fn(async () => true)
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        refresh,
        resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        analytics: analytics.analytics,
      }),
    )

    await act(async () => result.current.openBulkDelete([]))
    await act(async () => result.current.openBulkDelete(["same", "same"]))
    await act(async () => result.current.openBulkDelete(["first", "second"]))

    expect(workspace.delete).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(analytics.startAction).not.toHaveBeenCalled()
    expect(result.current.deleteState.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  })

  it("rejects unsupported and unresolved delete calls without dispatch", async () => {
    const workspace = createManagedResourceWorkspace({
      capabilities: {
        canSearch: true,
        canCreate: true,
        canUpdate: true,
        canDelete: false,
      },
    })
    const { result } = renderHook(() =>
      useManagedResourceMutationController({
        workspace,
        resolveRef: () => undefined,
      }),
    )
    expect(result.current.capabilities.canDelete).toBe(false)
    await act(async () => result.current.openBulkDelete(["crafted-row"]))
    expect(workspace.delete).not.toHaveBeenCalled()
    expect(result.current.deleteState.failure).toEqual({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  })

  it("aborts and discards bulk-delete results after workspace replacement", async () => {
    const pending = deferred<ManagedSiteMutationResult<void>>()
    const oldWorkspace = createManagedResourceWorkspace({
      delete: vi.fn(() => pending.promise),
    })
    const newWorkspace = createManagedResourceWorkspace()
    const refresh = vi.fn(async () => true)
    const analytics = createAnalytics()
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
          analytics: analytics.analytics,
        }),
      { initialProps: { workspace: oldWorkspace } },
    )
    await act(async () => result.current.openBulkDelete(["row-one"]))
    let execution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      execution = result.current.confirmDelete()
    })
    await waitFor(() => expect(oldWorkspace.delete).toHaveBeenCalledOnce())
    const signal = (oldWorkspace.delete as ReturnType<typeof vi.fn>).mock
      .calls[0][1]?.signal

    rerender({ workspace: newWorkspace })
    expect(signal?.aborted).toBe(true)
    await act(async () => {
      pending.resolve(succeededDelete())
      await execution
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(result.current.deleteState.results).toEqual([])
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

  it("does not let a stale delete completion release a newer delete session", async () => {
    const oldDeletion = deferred<ManagedSiteMutationResult<void>>()
    const newDeletion = deferred<ManagedSiteMutationResult<void>>()
    const oldWorkspace = createManagedResourceWorkspace({
      delete: vi.fn(() => oldDeletion.promise),
    })
    const newWorkspace = createManagedResourceWorkspace({
      delete: vi.fn(() => newDeletion.promise),
    })
    const refresh = vi.fn(async () => true)
    const { result, rerender } = renderHook(
      ({ workspace }) =>
        useManagedResourceMutationController({
          workspace,
          refresh,
          resolveRef: () => EXAMPLE_MANAGED_RESOURCE_REF,
        }),
      { initialProps: { workspace: oldWorkspace } },
    )
    await act(async () => result.current.openBulkDelete(["old-row"]))
    let oldExecution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      oldExecution = result.current.confirmDelete()
    })
    await waitFor(() => expect(oldWorkspace.delete).toHaveBeenCalledOnce())

    rerender({ workspace: newWorkspace })
    await act(async () => result.current.openBulkDelete(["new-row"]))
    let newExecution!: ReturnType<typeof result.current.confirmDelete>
    act(() => {
      newExecution = result.current.confirmDelete()
    })
    await waitFor(() => expect(newWorkspace.delete).toHaveBeenCalledOnce())

    await act(async () => {
      oldDeletion.resolve(succeededDelete())
      await oldExecution
    })
    await act(async () => result.current.openCreate())

    expect(newWorkspace.openCreateEditor).not.toHaveBeenCalled()

    await act(async () => {
      newDeletion.resolve(succeededDelete())
      await newExecution
    })
    await act(async () => result.current.openCreate())
    expect(newWorkspace.openCreateEditor).toHaveBeenCalledOnce()
  })
})
