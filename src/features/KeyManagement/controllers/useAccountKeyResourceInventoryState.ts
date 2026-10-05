import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  type AccountKeyResourceCollection,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
  type AccountKeyScope,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

import {
  ACCOUNT_KEY_STATUS_FILTERS,
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "../constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  ControllerNotice,
  LoadProgress,
  StatusFilter,
} from "./accountKeyResourceControllerTypes"
import {
  boundaryIdentity,
  refIdentity,
  refMatchesBoundary,
} from "./accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceRouteStateOwner } from "./useAccountKeyResourceRouteState"

/** Owns inventory state and its authoritative asynchronous projections. */
export function useAccountKeyResourceInventoryState({
  mode,
  selectedAccount,
  routing,
}: {
  mode: ControllerMode
  selectedAccount: string
  routing: AccountKeyResourceRouteStateOwner
}) {
  const { accountsRef, createdSecretRef, replaceRouteRef } = routing
  const accounts = accountsRef.current
  const [scopes, setScopes] = useState<readonly AccountKeyScope[]>([])
  const [selectedScope, setSelectedScope] = useState<AccountKeyScope | null>(
    null,
  )
  const selectedScopeRef = useRef(selectedScope)
  selectedScopeRef.current = selectedScope
  const [loadingResourceBoundary, setLoadingResourceBoundary] =
    useState<ActiveResourceBoundary | null>(null)
  const [acceptedRows, setAcceptedRows] = useState<
    readonly AccountKeyResourceFacts[]
  >([])
  const [resourceScopes, setResourceScopes] = useState<
    ReadonlyMap<string, AccountKeyScope>
  >(new Map())
  const acceptedRowsRef = useRef(acceptedRows)
  const [failures, setFailures] = useState<Record<string, ResourceFailure>>({})
  const [scopeInventoryFailure, setScopeInventoryFailure] =
    useState<ResourceFailure | null>(null)
  const [isScopeInventoryLoading, setIsScopeInventoryLoading] = useState(false)
  const [settledAccountIds, setSettledAccountIds] = useState<readonly string[]>(
    [],
  )
  const [progress, setProgress] = useState<LoadProgress>({
    total: 0,
    loaded: 0,
    loading: 0,
    error: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [notice, setNotice] = useState<ControllerNotice | null>(null)
  const [search, setSearchState] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ACCOUNT_KEY_STATUS_FILTERS.All,
  )
  const collectionRef = useRef<AccountKeyResourceCollection | null>(null)
  const sessionRef = useRef<AccountKeyResourceSession | null>(null)
  const activeResourceBoundaryRef = useRef<ActiveResourceBoundary | null>(null)
  const getResourceScope = useCallback(
    (ref: AccountKeyResourceRef) => resourceScopes.get(boundaryIdentity(ref)),
    [resourceScopes],
  )
  const rememberResourceScopes = useCallback(
    (
      boundary: Pick<ActiveResourceBoundary, "accountId" | "siteType">,
      availableScopes: readonly AccountKeyScope[],
    ) => {
      setResourceScopes((previous) => {
        const next = new Map(previous)
        for (const scope of availableScopes)
          next.set(
            boundaryIdentity({ ...boundary, scopeKey: scope.scopeKey }),
            scope,
          )
        return next
      })
    },
    [],
  )
  const replaceAcceptedRows = useCallback(
    (next: readonly AccountKeyResourceFacts[]) => {
      acceptedRowsRef.current = next
      setAcceptedRows(next)
    },
    [],
  )
  const selectedAccountData = accounts.find(
    (account) => account.id === selectedAccount,
  )
  useEffect(() => {
    // The status control belongs to one selected native account. Do not carry
    // its hidden value into another account or the combined all-account view.
    setStatusFilter(ACCOUNT_KEY_STATUS_FILTERS.All)
  }, [mode, selectedAccount])
  const currentResourceBoundary =
    selectedScope && selectedAccountData
      ? {
          accountId: selectedAccount,
          siteType: selectedAccountData.siteType,
          scopeKey: selectedScope.scopeKey,
          routeKey: selectedScope.routeKey,
        }
      : loadingResourceBoundary
  const isCurrentResourceRef = useCallback(
    (ref: AccountKeyResourceRef) => {
      if (mode !== controllerModes.Single) return false
      const boundary = activeResourceBoundaryRef.current
      return !!boundary && refMatchesBoundary(ref, boundary)
    },
    [mode],
  )
  const isAcceptedResourceRef = useCallback(
    (ref: AccountKeyResourceRef) =>
      acceptedRows.some((row) => refIdentity(row.ref) === refIdentity(ref)),
    [acceptedRows],
  )
  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return acceptedRows.filter((row) => {
      const matchesStatus =
        statusFilter === ACCOUNT_KEY_STATUS_FILTERS.All ||
        row.status === statusFilter
      if (!matchesStatus) return false
      if (!normalizedSearch) return true
      return [
        row.displayName,
        row.maskedLabel,
        ...(row.searchValues ?? []),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [acceptedRows, search, statusFilter])
  const setSearch = useCallback(
    (nextSearch: string) => {
      if (createdSecretRef.current !== null) return
      setSearchState(nextSearch)
    },
    [createdSecretRef],
  )
  const selectScope = useCallback(
    (scopeKey: string) => {
      if (mode !== controllerModes.Single || createdSecretRef.current !== null)
        return false
      const scope = scopes.find((candidate) => candidate.scopeKey === scopeKey)
      if (!scope) return false
      replaceRouteRef.current?.({
        [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: selectedAccount,
        [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: scope.routeKey,
      })
      return true
    },
    [mode, scopes, selectedAccount, createdSecretRef, replaceRouteRef],
  )
  const clearNativeOwner = useCallback(() => {
    sessionRef.current = null
    collectionRef.current = null
    activeResourceBoundaryRef.current = null
  }, [])
  return {
    currentResourceBoundary,
    isCurrentResourceRef,
    isAcceptedResourceRef,
    rows,
    setSearch,
    selectScope,
    clearNativeOwner,
    scopes,
    setScopes,
    selectedScope,
    setSelectedScope,
    selectedScopeRef,
    setLoadingResourceBoundary,
    acceptedRows,
    setResourceScopes,
    acceptedRowsRef,
    failures,
    setFailures,
    scopeInventoryFailure,
    setScopeInventoryFailure,
    isScopeInventoryLoading,
    setIsScopeInventoryLoading,
    settledAccountIds,
    setSettledAccountIds,
    progress,
    setProgress,
    isLoading,
    setIsLoading,
    notice,
    setNotice,
    search,
    statusFilter,
    setStatusFilter,
    collectionRef,
    sessionRef,
    activeResourceBoundaryRef,
    getResourceScope,
    rememberResourceScopes,
    replaceAcceptedRows,
  }
}
export type AccountKeyResourceInventoryStateOwner = ReturnType<
  typeof useAccountKeyResourceInventoryState
>
