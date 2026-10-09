import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  ACCOUNT_KEY_STATUS_FILTERS,
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  ControllerNotice,
  LoadProgress,
  ResourceActionContext,
  StatusFilter,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  boundariesMatch,
  boundaryIdentity,
  refIdentity,
  refMatchesBoundary,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import {
  type AccountKeyResourceCollection,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
  type AccountKeyScope,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

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
  const nativeOwner = useRef<
    Readonly<{
      session: AccountKeyResourceSession | null
      collection: AccountKeyResourceCollection | null
      boundary: ActiveResourceBoundary | null
    }>
  >({ session: null, collection: null, boundary: null })
  const readNativeOwner = useCallback(() => nativeOwner.current, [])
  const acceptActionContext = useCallback((context: ResourceActionContext) => {
    const { session, collection, boundary } = context
    nativeOwner.current = { session, collection, boundary }
  }, [])
  // Creating refreshes authorization without replacing the accepted collection.
  const adoptCreationSession = useCallback(
    (session: AccountKeyResourceSession) => {
      nativeOwner.current = { ...nativeOwner.current, session }
    },
    [],
  )
  const isNativeOwnerCurrent = useCallback(
    (context: Pick<ResourceActionContext, "session" | "boundary">) => {
      const current = nativeOwner.current
      return (
        current.session === context.session &&
        current.boundary !== null &&
        boundariesMatch(current.boundary, context.boundary)
      )
    },
    [],
  )
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
  const beginInventoryLoad = useCallback(
    ({ preserveRows, idle }: { preserveRows: boolean; idle: boolean }) => {
      setScopes([])
      setSelectedScope(null)
      setLoadingResourceBoundary(null)
      if (!preserveRows || idle) {
        setResourceScopes(new Map())
        replaceAcceptedRows([])
      }
      setFailures({})
      setScopeInventoryFailure(null)
      setNotice(null)
      setIsLoading(!idle)
    },
    [replaceAcceptedRows],
  )
  const readAcceptedRows = useCallback(() => acceptedRowsRef.current, [])
  const acceptEditedResource = useCallback(
    (facts: AccountKeyResourceFacts) => {
      replaceAcceptedRows(
        acceptedRowsRef.current.map((row) =>
          refIdentity(row.ref) === refIdentity(facts.ref) ? facts : row,
        ),
      )
    },
    [replaceAcceptedRows],
  )
  const acceptDeletedResource = useCallback(
    (ref: AccountKeyResourceRef) => {
      replaceAcceptedRows(
        acceptedRowsRef.current.filter(
          (row) => refIdentity(row.ref) !== refIdentity(ref),
        ),
      )
    },
    [replaceAcceptedRows],
  )
  const acceptInventory = useCallback(
    (
      inventory: ResourceActionContext & {
        scopes: readonly AccountKeyScope[]
        selectedScope: AccountKeyScope
        scopeFailure: ResourceFailure | null
        rows: readonly AccountKeyResourceFacts[]
      },
    ) => {
      acceptActionContext(inventory)
      setLoadingResourceBoundary(null)
      setScopes(inventory.scopes)
      setSelectedScope(inventory.selectedScope)
      setScopeInventoryFailure(inventory.scopeFailure)
      rememberResourceScopes(inventory.boundary, inventory.scopes)
      replaceAcceptedRows(inventory.rows)
    },
    [acceptActionContext, rememberResourceScopes, replaceAcceptedRows],
  )
  const acceptScopeInventory = useCallback(
    (
      boundary: ActiveResourceBoundary,
      availableScopes: readonly AccountKeyScope[],
    ) => {
      const currentScope = selectedScopeRef.current
      const nextSelectedScope = currentScope
        ? availableScopes.find(
            (scope) => scope.scopeKey === currentScope.scopeKey,
          ) ?? currentScope
        : availableScopes.find((scope) => scope.isDefault) ??
          availableScopes[0] ??
          null
      const nextScopes =
        nextSelectedScope &&
        !availableScopes.some(
          (scope) => scope.scopeKey === nextSelectedScope.scopeKey,
        )
          ? [nextSelectedScope, ...availableScopes]
          : availableScopes
      rememberResourceScopes(boundary, nextScopes)
      setScopes(nextScopes)
      setSelectedScope(nextSelectedScope)
      setScopeInventoryFailure(null)
    },
    [rememberResourceScopes],
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
      const boundary = nativeOwner.current.boundary
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
    nativeOwner.current = { session: null, collection: null, boundary: null }
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
    selectedScope,
    setLoadingResourceBoundary,
    acceptedRows,
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
    readNativeOwner,
    acceptActionContext,
    adoptCreationSession,
    isNativeOwnerCurrent,
    readAcceptedRows,
    acceptEditedResource,
    acceptDeletedResource,
    acceptInventory,
    beginInventoryLoad,
    acceptScopeInventory,
    getResourceScope,
    rememberResourceScopes,
    replaceAcceptedRows,
  }
}
export type AccountKeyResourceInventoryStateOwner = ReturnType<
  typeof useAccountKeyResourceInventoryState
>
