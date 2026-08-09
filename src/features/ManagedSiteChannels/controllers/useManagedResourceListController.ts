import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
  type ManagedResourceRegistration,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceListQuery,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import type { ManagedChannelsRowViewModel } from "../presentation/contracts"
import { createManagedResourcePresentationMapper } from "../presentation/managedResourcePresentation"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
  type ManagedResourceControllerAnalytics,
} from "./managedResourceControllerAnalytics"

const MAX_COLLECTION_PAGES = 100
const refIdentity = (ref: ManagedResourceRef) =>
  JSON.stringify([ref.siteType, ref.kind, ref.scopeKey, ref.resourceId])
const safeFailure = (error: unknown): ResourceFailure =>
  error instanceof ManagedResourceError
    ? error.failure
    : { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
const abortError = () =>
  new ManagedResourceError({ code: MANAGED_RESOURCE_FAILURE_CODES.Aborted })

const awaitAbortable = <T>(promise: Promise<T>, signal: AbortSignal) =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const abort = () => reject(abortError())
    signal.addEventListener("abort", abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })

/** Drains an opaque cursor sequence or fails without accepting partial data. */
async function collectAll(
  workspace: ManagedResourceWorkspace,
  query: ResourceListQuery,
  signal: AbortSignal,
) {
  const items: ResourceDisplayFacts[] = []
  const refs = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (let pageCount = 0; pageCount < MAX_COLLECTION_PAGES; pageCount += 1) {
    const page = await awaitAbortable(
      workspace.list({ ...query, ...(cursor ? { cursor } : {}) }, { signal }),
      signal,
    )
    for (const item of page.items) {
      const identity = refIdentity(item.ref)
      if (refs.has(identity))
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
        })
      refs.add(identity)
      items.push(item)
    }
    if (!page.nextCursor) return items
    if (cursors.has(page.nextCursor))
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
      })
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }
  throw new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
  })
}

type Options = {
  registration: ManagedResourceRegistration
  scopeKey: string
  analytics?: ManagedResourceControllerAnalytics
  search?: string
  refreshKey?: number
  pageSize?: number
  onUnsupportedSearch?: () => void
  resolveLabel?: TFunction
  fieldIds?: readonly string[]
}

/** Owns complete native collection and client-side table state without exposing refs. */
export function useManagedResourceListController({
  registration,
  scopeKey,
  analytics,
  search,
  refreshKey,
  pageSize = 20,
  onUnsupportedSearch,
  resolveLabel,
  fieldIds,
}: Options) {
  const mapper = useMemo(
    () => createManagedResourcePresentationMapper({ resolveLabel, fieldIds }),
    [fieldIds, resolveLabel],
  )
  const [workspace, setWorkspace] = useState<ManagedResourceWorkspace | null>(
    null,
  )
  const [acceptedRows, setAcceptedRows] = useState<
    readonly ManagedChannelsRowViewModel[]
  >([])
  const [failure, setFailure] = useState<ResourceFailure | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<readonly string[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedRowKeys, setSelectedRowKeys] = useState<
    Record<string, boolean>
  >({})
  const generation = useRef(0)
  const abortRef = useRef<AbortController | undefined>(undefined)
  const activeAnalytics = useRef<
    ManagedResourceAnalyticsCompletion | undefined
  >(undefined)
  const normalizedSearch = search?.trim() || undefined
  const scopeIdentity = JSON.stringify([
    registration.siteType,
    registration.kind,
    scopeKey,
  ])
  const automaticCollectionContext = useRef({
    normalizedSearch,
    scopeIdentity,
  })

  useEffect(() => {
    mapper.reset()
    setWorkspace(null)
    setAcceptedRows([])
    setSelectedRowKeys({})
    setStatusFilter([])
    setPageIndex(0)
  }, [mapper, scopeIdentity])

  const collect = useCallback(
    async (
      trackAnalytics: boolean,
      acceptance: "reconcile" | "reset-navigation",
    ) => {
      activeAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
      activeAnalytics.current = undefined
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const current = ++generation.current
      const analyticsCompletion = trackAnalytics
        ? startManagedResourceControllerAction(
            analytics,
            PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
          )
        : undefined
      activeAnalytics.current = analyticsCompletion
      setIsLoading(true)
      setFailure(null)
      try {
        const opened = await awaitAbortable(
          registration.open({ signal: controller.signal }),
          controller.signal,
        )
        if (current !== generation.current) return false
        if (normalizedSearch && !opened.capabilities.canSearch) {
          onUnsupportedSearch?.()
          throw new ManagedResourceError({
            code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
          })
        }
        const query =
          opened.capabilities.canSearch && normalizedSearch
            ? { search: normalizedSearch }
            : {}
        const collected = await collectAll(opened, query, controller.signal)
        if (current !== generation.current) return false
        const nextRows = mapper.accept(collected)
        setWorkspace(opened)
        setAcceptedRows(nextRows)
        if (acceptance === "reset-navigation") {
          setSelectedRowKeys({})
          setPageIndex(0)
        } else {
          const acceptedRowKeys = new Set(nextRows.map(({ rowKey }) => rowKey))
          setSelectedRowKeys((currentSelection) =>
            Object.fromEntries(
              Object.entries(currentSelection).filter(
                ([rowKey, selected]) => selected && acceptedRowKeys.has(rowKey),
              ),
            ),
          )
        }
        analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: { itemCount: nextRows.length },
        })
        return true
      } catch (error) {
        const failure = safeFailure(error)
        if (
          current === generation.current &&
          failure.code !== MANAGED_RESOURCE_FAILURE_CODES.Aborted
        ) {
          setFailure(failure)
        }
        analyticsCompletion?.complete(
          failure.code === MANAGED_RESOURCE_FAILURE_CODES.Aborted
            ? PRODUCT_ANALYTICS_RESULTS.Cancelled
            : PRODUCT_ANALYTICS_RESULTS.Failure,
          failure.code === MANAGED_RESOURCE_FAILURE_CODES.Aborted
            ? undefined
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
        )
        return false
      } finally {
        if (current === generation.current) {
          setIsLoading(false)
          if (abortRef.current === controller) abortRef.current = undefined
          if (activeAnalytics.current === analyticsCompletion)
            activeAnalytics.current = undefined
        }
      }
    },
    [analytics, mapper, normalizedSearch, onUnsupportedSearch, registration],
  )

  const refresh = useCallback(() => collect(true, "reconcile"), [collect])
  const refreshSilently = useCallback(
    () => collect(false, "reconcile"),
    [collect],
  )

  useEffect(() => {
    const previousContext = automaticCollectionContext.current
    const acceptance =
      previousContext.scopeIdentity === scopeIdentity &&
      previousContext.normalizedSearch !== normalizedSearch
        ? "reset-navigation"
        : "reconcile"
    automaticCollectionContext.current = { normalizedSearch, scopeIdentity }
    void collect(false, acceptance)
    return () => {
      generation.current += 1
      activeAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
      activeAnalytics.current = undefined
      abortRef.current?.abort()
    }
  }, [collect, normalizedSearch, refreshKey, scopeIdentity])

  const cancelCollection = useCallback(() => {
    generation.current += 1
    activeAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeAnalytics.current = undefined
    abortRef.current?.abort()
    abortRef.current = undefined
    setIsLoading(false)
  }, [])

  const allRows = statusFilter.length
    ? acceptedRows.filter((row) => {
        const status = row.cells.status
        return (
          status?.kind === "status" &&
          statusFilter.includes(String(status.sortValue))
        )
      })
    : acceptedRows
  useEffect(() => {
    setPageIndex((currentPage) =>
      Math.min(
        currentPage,
        Math.max(0, Math.ceil(allRows.length / pageSize) - 1),
      ),
    )
  }, [allRows.length, pageSize])
  const rows = allRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  const capabilities = workspace?.capabilities ?? {
    canSearch: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  }
  return {
    workspace,
    capabilities,
    rows,
    allRows,
    totalRows: allRows.length,
    failure,
    isLoading,
    pageIndex,
    setPageIndex,
    pageSize,
    statusFilter,
    setStatusFilter,
    selectedRowKeys,
    setSelectedRowKeys,
    refresh,
    refreshSilently,
    cancelCollection,
    resolveRef: mapper.resolveRef,
    mapFacts: mapper.map,
  }
}
