import { useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  KEY_MANAGEMENT_ROUTE_PARAMS,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  DeleteState,
  DetailState,
  OpenResourceSession,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  awaitAbortable,
  boundariesMatch,
  isAborted,
  readScopeInventory,
  toFailure,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import { readAllAccountKeyResourceInventories } from "~/features/KeyManagement/resources/workflows/readAllAccountKeyResourceInventories"
import type { AccountKeyResourceEditorStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorState"
import type { AccountKeyResourceInventoryStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceFacts,
  type AccountKeyScope,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { collectAccountKeyResourceInventory } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"

type WorkflowInputs = {
  state: {
    selectedAccount: string
    mode: ControllerMode
    setDetail: Dispatch<SetStateAction<DetailState>>
    setDeleteState: Dispatch<SetStateAction<DeleteState>>
  }
  actions: {
    clearDialogs: () => void
    clearTerminalResourceState: ({
      preserveCreatedSecret,
    }?: {
      preserveCreatedSecret?: boolean | undefined
    }) => void
    clearActiveResourceRefs: () => void
    openSession: OpenResourceSession
    acceptFreshRead: (boundary: ActiveResourceBoundary) => void
  }
  requests: AccountKeyResourceRequestLifecycle
  editorState: AccountKeyResourceEditorStateOwner
  inventoryState: AccountKeyResourceInventoryStateOwner
  routing: AccountKeyResourceRouteStateOwner
}

/** Owns inventory commands while the controller coordinates shared lifecycle boundaries. */
export function useAccountKeyResourceInventoryWorkflow({
  state: { selectedAccount, mode, setDetail, setDeleteState },
  actions: {
    clearDialogs,
    clearTerminalResourceState,
    clearActiveResourceRefs,
    openSession,
    acceptFreshRead,
  },
  requests,
  editorState,
  inventoryState,
  routing,
}: WorkflowInputs) {
  const {
    clearDeferredContextReload,
    accountsRef,
    routeRef,
    expectTransition,
    replaceRouteRef,
    creationIntentRef,
    transitionCreatedSecret,
  } = routing

  const {
    abortEditorFieldLoads,
    captureReloadState,
    resetForSecretRefresh,
    projectRehydration,
    acceptRehydration,
  } = editorState
  const {
    acceptedRowsRef,
    sessionRef,
    collectionRef,
    activeResourceBoundaryRef,
    selectedScopeRef,
    setIsScopeInventoryLoading,
    setScopes,
    setSelectedScope,
    setLoadingResourceBoundary,
    setResourceScopes,
    setFailures,
    setScopeInventoryFailure,
    setNotice,
    setIsLoading,
    setSettledAccountIds,
    setProgress,
    search,
    replaceAcceptedRows,
    rememberResourceScopes,
  } = inventoryState

  const load = useCallback(
    async (
      options: {
        protectionBypassExecution?: ProtectionBypassExecution
        preserveCreatedSecret?: boolean
        preserveEditor?: boolean
        preserveRows?: boolean
        retryAccountIds?: readonly string[]
        targetScopeKey?: string
        routeTransitionId?: string
      } = {},
    ) => {
      requests.cancel(requestSlots.Inventory)
      requests.cancel(requestSlots.Scopes)
      requests.release(requestSlots.Scopes)
      setIsScopeInventoryLoading(false)
      if (!options.preserveCreatedSecret) clearDeferredContextReload()
      const { editorId: preservedEditorId, preserveEditor } =
        captureReloadState(options.preserveEditor, selectedAccount)
      const controller = new AbortController()
      requests.assign(requestSlots.Inventory, controller)
      const current = requests.advance()
      requests.setInventoryLoading(mode !== controllerModes.Idle)
      if (options.preserveCreatedSecret) {
        requests.cancel(requestSlots.Action)
        requests.release(requestSlots.Action)
        resetForSecretRefresh()
        setDetail(null)
        setDeleteState({
          isOpen: false,
          isExecuting: false,
          ref: null,
          failure: null,
        })
      } else if (preserveEditor) {
        requests.cancel(requestSlots.Action)
        requests.release(requestSlots.Action)
        abortEditorFieldLoads()
        setDetail(null)
        transitionCreatedSecret(null)
        setDeleteState({
          isOpen: false,
          isExecuting: false,
          ref: null,
          failure: null,
        })
      } else {
        clearDialogs()
      }
      setScopes([])
      setSelectedScope(null)
      setLoadingResourceBoundary(null)
      if (!options.preserveRows || mode === controllerModes.Idle) {
        setResourceScopes(new Map())
        replaceAcceptedRows([])
      }
      setFailures({})
      setScopeInventoryFailure(null)
      setNotice(null)
      setIsLoading(mode !== controllerModes.Idle)

      if (mode === controllerModes.Idle) {
        setSettledAccountIds([])
        clearTerminalResourceState()
        requests.setInventoryLoading(false)
        setProgress({ total: 0, loaded: 0, loading: 0, error: 0 })
        setIsLoading(false)
        return false
      }

      const activeAccounts = accountsRef.current.filter(
        (account) =>
          (mode === controllerModes.All
            ? true
            : account.id === selectedAccount) &&
          Boolean(
            getSiteTypeCapabilities(account.siteType).account
              ?.keyResourceManagement,
          ),
      )
      const retryIds =
        mode === controllerModes.All && options.retryAccountIds
          ? new Set(options.retryAccountIds)
          : null
      const loadingAccounts = retryIds
        ? activeAccounts.filter((account) => retryIds.has(account.id))
        : activeAccounts
      const retainedAccountIds = retryIds
        ? activeAccounts
            .filter((account) => !retryIds.has(account.id))
            .map((account) => account.id)
        : []
      setSettledAccountIds(retainedAccountIds)
      setProgress({
        total: activeAccounts.length,
        loaded: retainedAccountIds.length,
        loading: loadingAccounts.length,
        error: 0,
      })

      const acceptProgress = (loaded: boolean) => {
        if (current !== requests.version() || controller.signal.aborted) return
        setProgress((previous) => ({
          ...previous,
          loaded: previous.loaded + (loaded ? 1 : 0),
          error: previous.error + (loaded ? 0 : 1),
          loading: Math.max(0, previous.loading - 1),
        }))
      }

      try {
        if (mode === controllerModes.All) {
          clearActiveResourceRefs()
          const rowsByAccount = new Map<
            string,
            readonly AccountKeyResourceFacts[]
          >()
          if (options.preserveRows) {
            for (const row of acceptedRowsRef.current) {
              const rows = rowsByAccount.get(row.ref.accountId) ?? []
              rowsByAccount.set(row.ref.accountId, [...rows, row])
            }
          }
          const settledAccounts = new Set(retainedAccountIds)
          const acceptAccountResult = (
            account: DisplaySiteData,
            result: PromiseSettledResult<{
              rows: AccountKeyResourceFacts[]
              scope: AccountKeyScope | null
            }>,
          ) => {
            if (current !== requests.version() || controller.signal.aborted)
              return
            if (result.status === "fulfilled") {
              if (result.value.scope) {
                const scope = result.value.scope
                rememberResourceScopes(
                  { accountId: account.id, siteType: account.siteType },
                  [scope],
                )
                acceptFreshRead({
                  accountId: account.id,
                  siteType: account.siteType,
                  scopeKey: scope.scopeKey,
                  routeKey: scope.routeKey,
                })
              }
              rowsByAccount.set(account.id, result.value.rows)
              replaceAcceptedRows(
                activeAccounts.flatMap(
                  (candidate) => rowsByAccount.get(candidate.id) ?? [],
                ),
              )
              acceptProgress(true)
            } else {
              const failure = toFailure(result.reason)
              if (isAborted(failure)) return
              setFailures((currentFailures) => ({
                ...currentFailures,
                [account.id]: failure,
              }))
              acceptProgress(false)
            }
            settledAccounts.add(account.id)
            setSettledAccountIds(
              activeAccounts
                .filter((candidate) => settledAccounts.has(candidate.id))
                .map((candidate) => candidate.id),
            )
          }
          await readAllAccountKeyResourceInventories({
            accounts: loadingAccounts,
            search: search.trim(),
            signal: controller.signal,
            openSession: (account, signal) =>
              openSession(account, signal, options.protectionBypassExecution),
            onSettled: acceptAccountResult,
          })
          if (current !== requests.version()) return false
          return true
        }

        const account = activeAccounts[0]
        if (!account) {
          clearTerminalResourceState({
            preserveCreatedSecret: options.preserveCreatedSecret,
          })
          return false
        }
        const session = await openSession(
          account,
          controller.signal,
          options.protectionBypassExecution,
        )
        if (!session) {
          clearTerminalResourceState({
            preserveCreatedSecret: options.preserveCreatedSecret,
          })
          acceptProgress(true)
          setSettledAccountIds([account.id])
          return true
        }
        const scopeInventory = await awaitAbortable(
          readScopeInventory(session, { signal: controller.signal }),
          controller.signal,
        )
        const defaultScope = await awaitAbortable(
          session.resolveDefaultScope({ signal: controller.signal }),
          controller.signal,
        )
        const listedScopes = scopeInventory.scopes
        if (current !== requests.version()) return false
        const availableScopes = listedScopes.some(
          (scope) => scope.scopeKey === defaultScope.scopeKey,
        )
          ? listedScopes
          : [defaultScope, ...listedScopes]
        const requestedRouteKey =
          routeRef.current?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]?.trim()
        const routeMatchesAccount =
          routeRef.current?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId] ===
          account.id
        const requestedScope =
          routeMatchesAccount && requestedRouteKey
            ? availableScopes.find(
                (scope) => scope.routeKey === requestedRouteKey,
              )
            : undefined
        const targetScope = options.targetScopeKey
          ? availableScopes.find(
              (candidate) => candidate.scopeKey === options.targetScopeKey,
            )
          : undefined
        if (options.targetScopeKey && !targetScope) {
          throw new AccountKeyResourceError({
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
          })
        }
        const canonicalDefaultScope =
          availableScopes.find(
            (scope) => scope.scopeKey === defaultScope.scopeKey,
          ) ?? defaultScope
        const scope = targetScope ?? requestedScope ?? canonicalDefaultScope
        const needsCanonicalRoute =
          !routeMatchesAccount ||
          requestedScope === undefined ||
          (!!targetScope && targetScope.scopeKey !== requestedScope.scopeKey)
        if (needsCanonicalRoute) {
          if (
            !targetScope &&
            requestedRouteKey &&
            (!routeMatchesAccount || requestedScope === undefined)
          ) {
            setNotice({ kind: "workspace-fallback" })
          }
          const nextRoute = {
            [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: account.id,
            [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: scope.routeKey,
          }
          if (options.routeTransitionId !== undefined) {
            expectTransition({
              id: options.routeTransitionId,
              // The route effect cleans up this generation before it receives
              // the replacement. Acknowledgement is valid only for that next
              // generation, never for a later same-value route update.
              generation: current + 1,
              selectedAccount,
              accountId: account.id,
              siteType: account.siteType,
              scopeKey: scope.scopeKey,
              routeKey: scope.routeKey,
            })
          }
          if (options.routeTransitionId) {
            replaceRouteRef.current?.(nextRoute, {
              id: options.routeTransitionId,
            })
          } else {
            replaceRouteRef.current?.(nextRoute)
          }
        }
        const activeBoundary: ActiveResourceBoundary = {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: scope.scopeKey,
          routeKey: scope.routeKey,
        }
        setLoadingResourceBoundary(activeBoundary)
        const collection = await awaitAbortable(
          session.openCollection(scope.scopeKey, { signal: controller.signal }),
          controller.signal,
        )
        const rows = await collectAccountKeyResourceInventory(collection, {
          search: search.trim(),
          signal: controller.signal,
        })
        if (current !== requests.version()) return false
        let rehydratedEditor: ReturnType<typeof projectRehydration> = null
        if (preserveEditor && preservedEditorId !== undefined) {
          const nativeEditor = await awaitAbortable(
            session.openCreateEditor(
              scope.scopeKey,
              {
                signal: controller.signal,
              },
              creationIntentRef.current,
            ),
            controller.signal,
          )
          if (current !== requests.version()) return false
          rehydratedEditor = projectRehydration(
            nativeEditor,
            activeBoundary,
            preservedEditorId,
          )
        }
        if (current !== requests.version()) return false
        sessionRef.current = session
        collectionRef.current = collection
        activeResourceBoundaryRef.current = activeBoundary
        acceptRehydration(rehydratedEditor, activeBoundary)
        acceptFreshRead(activeBoundary)
        setLoadingResourceBoundary(null)
        setScopes(availableScopes)
        setSelectedScope(scope)
        setScopeInventoryFailure(scopeInventory.partialFailure ?? null)
        rememberResourceScopes(activeBoundary, availableScopes)
        replaceAcceptedRows(rows)
        acceptProgress(true)
        setSettledAccountIds([account.id])
        return true
      } catch (error) {
        const failure = toFailure(error)
        if (current === requests.version() && !isAborted(failure)) {
          clearTerminalResourceState({
            preserveCreatedSecret: options.preserveCreatedSecret,
          })
          const account = activeAccounts[0]
          if (account) setFailures({ [account.id]: failure })
          acceptProgress(false)
          if (account) setSettledAccountIds([account.id])
        }
        return false
      } finally {
        if (current === requests.version()) {
          requests.setInventoryLoading(false)
          setLoadingResourceBoundary(null)
          setIsLoading(false)
          requests.release(requestSlots.Inventory, controller)
        }
      }
    },
    [
      captureReloadState,
      resetForSecretRefresh,
      projectRehydration,
      acceptRehydration,
      abortEditorFieldLoads,
      acceptFreshRead,
      clearActiveResourceRefs,
      clearTerminalResourceState,
      clearDialogs,
      mode,
      openSession,
      replaceAcceptedRows,
      rememberResourceScopes,
      search,
      selectedAccount,
      transitionCreatedSecret,
      requests,
      setIsScopeInventoryLoading,
      clearDeferredContextReload,
      setDetail,
      setDeleteState,
      setScopes,
      setSelectedScope,
      setLoadingResourceBoundary,
      setResourceScopes,
      setFailures,
      setScopeInventoryFailure,
      setNotice,
      setIsLoading,
      setSettledAccountIds,
      setProgress,
      accountsRef,
      acceptedRowsRef,
      routeRef,
      expectTransition,
      replaceRouteRef,
      creationIntentRef,
      sessionRef,
      collectionRef,
      activeResourceBoundaryRef,
    ],
  )

  const retryScopeInventory = useCallback(async () => {
    const session = sessionRef.current
    const boundary = activeResourceBoundaryRef.current
    const refreshInventory =
      session?.refreshScopeInventory ?? session?.listScopeInventory
    if (
      mode !== controllerModes.Single ||
      !session ||
      !boundary ||
      !refreshInventory
    ) {
      return false
    }

    requests.cancel(requestSlots.Scopes)
    const controller = new AbortController()
    requests.assign(requestSlots.Scopes, controller)
    const currentGeneration = requests.version()
    setIsScopeInventoryLoading(true)
    const isCurrentRequest = () =>
      !controller.signal.aborted &&
      requests.version() === currentGeneration &&
      sessionRef.current === session &&
      activeResourceBoundaryRef.current !== null &&
      boundariesMatch(activeResourceBoundaryRef.current, boundary)

    try {
      const inventory = await awaitAbortable(
        refreshInventory.call(session, { signal: controller.signal }),
        controller.signal,
      )
      if (!isCurrentRequest()) return false
      if (inventory.partialFailure) {
        setScopeInventoryFailure(inventory.partialFailure)
        return false
      }

      const currentScope = selectedScopeRef.current
      const nextSelectedScope = currentScope
        ? inventory.scopes.find(
            (scope) => scope.scopeKey === currentScope.scopeKey,
          ) ?? currentScope
        : inventory.scopes.find((scope) => scope.isDefault) ??
          inventory.scopes[0] ??
          null
      const nextScopes =
        nextSelectedScope &&
        !inventory.scopes.some(
          (scope) => scope.scopeKey === nextSelectedScope.scopeKey,
        )
          ? [nextSelectedScope, ...inventory.scopes]
          : inventory.scopes
      rememberResourceScopes(boundary, nextScopes)
      setScopes(nextScopes)
      setSelectedScope(nextSelectedScope)
      setScopeInventoryFailure(null)
      return true
    } catch (error) {
      const failure = toFailure(error)
      if (isCurrentRequest() && !isAborted(failure)) {
        setScopeInventoryFailure(failure)
      }
      return false
    } finally {
      if (requests.owns(requestSlots.Scopes, controller)) {
        requests.release(requestSlots.Scopes)
        setIsScopeInventoryLoading(false)
      }
    }
  }, [
    mode,
    rememberResourceScopes,
    sessionRef,
    activeResourceBoundaryRef,
    requests,
    setIsScopeInventoryLoading,
    setScopeInventoryFailure,
    selectedScopeRef,
    setScopes,
    setSelectedScope,
  ])
  return { load, retryScopeInventory }
}
