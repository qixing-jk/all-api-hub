import { useCallback } from "react"
import type { Dispatch, SetStateAction } from "react"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  DeleteState,
  MutationAnalyticsMode,
  RefreshAfterMutation,
  ResolveResourceActionContext,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  boundaryFromResourceRef,
  boundaryIdentity,
  completeKeyMutationAnalytics,
  keyManagementAnalyticsContext,
  refIdentity,
  toFailure,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceInventoryStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import { buildAccountKeyResourceLinkedCleanupInput } from "~/services/accounts/accountKeyResourceCleanup"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { deleteWithLinkedChannelCleanup } from "~/services/managedSites/linkedChannelCleanup"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

type WorkflowInputs = {
  state: {
    mode: ControllerMode
    setDeleteState: Dispatch<SetStateAction<DeleteState>>
    deleteState: DeleteState
    mutationAnalyticsMode: MutationAnalyticsMode
  }
  actions: {
    isFreshReadRequiredForBoundary: (
      boundary: ActiveResourceBoundary,
    ) => boolean
    isAcceptedResourceRef: (ref: AccountKeyResourceRef) => boolean
    isCurrentResourceRef: (ref: AccountKeyResourceRef) => boolean
    resolveResourceActionContext: ResolveResourceActionContext
    requireFreshRead: (boundary: ActiveResourceBoundary) => void
    refreshAfterMutation: RefreshAfterMutation
  }
  requests: AccountKeyResourceRequestLifecycle
  inventoryState: AccountKeyResourceInventoryStateOwner
  routing: AccountKeyResourceRouteStateOwner
}

/** Owns deletion commands while the controller coordinates shared lifecycle boundaries. */
export function useAccountKeyResourceDeletionWorkflow({
  state: { mode, setDeleteState, deleteState, mutationAnalyticsMode },
  actions: {
    isFreshReadRequiredForBoundary,
    isAcceptedResourceRef,
    isCurrentResourceRef,
    resolveResourceActionContext,
    requireFreshRead,
    refreshAfterMutation,
  },
  requests,
  inventoryState,
  routing,
}: WorkflowInputs) {
  const { createdSecretRef, accountsRef } = routing

  const {
    collectionRef,
    activeResourceBoundaryRef,
    sessionRef,
    acceptedRowsRef,
    replaceAcceptedRows,
  } = inventoryState

  const openDelete = useCallback(
    (ref: AccountKeyResourceRef) => {
      const boundary = boundaryFromResourceRef(ref)
      if (
        mode === controllerModes.Idle ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        isFreshReadRequiredForBoundary(boundary) ||
        (mode === controllerModes.All
          ? !isAcceptedResourceRef(ref)
          : !collectionRef.current || !isCurrentResourceRef(ref))
      )
        return false
      setDeleteState({ isOpen: true, isExecuting: false, ref, failure: null })
      return true
    },
    [
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      createdSecretRef,
      requests,
      collectionRef,
      setDeleteState,
    ],
  )

  const cancelDelete = useCallback(() => {
    if (!deleteState.isExecuting) {
      setDeleteState({
        isOpen: false,
        isExecuting: false,
        ref: null,
        failure: null,
      })
    }
  }, [deleteState.isExecuting, setDeleteState])

  const confirmDelete = useCallback(
    async (cleanup = false): Promise<boolean> => {
      if (
        mode === controllerModes.Idle ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        !deleteState.ref ||
        (mode === controllerModes.All
          ? !isAcceptedResourceRef(deleteState.ref)
          : !collectionRef.current || !isCurrentResourceRef(deleteState.ref))
      )
        return false
      const current = requests.version()
      const ref = deleteState.ref
      const boundary: ActiveResourceBoundary =
        mode === controllerModes.All
          ? boundaryFromResourceRef(ref)
          : activeResourceBoundaryRef.current!
      if (isFreshReadRequiredForBoundary(boundary)) return false
      const mutationIdentity = boundaryIdentity(boundary)
      const existingMutation = requests.getMutation(mutationIdentity)
      if (existingMutation) return Boolean(await existingMutation.promise)
      const account = accountsRef.current.find(
        (candidate) => candidate.id === boundary.accountId,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      const controller = new AbortController()
      requests.assign(requestSlots.Action, controller)
      setDeleteState((state) => ({
        ...state,
        isExecuting: true,
        failure: null,
      }))
      const run = resolveResourceActionContext(ref, controller)
        .then(async (actionContext) => {
          if (!actionContext) {
            throw new AccountKeyResourceError({
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
            })
          }
          sessionRef.current = actionContext.session
          collectionRef.current = actionContext.collection
          activeResourceBoundaryRef.current = actionContext.boundary
          let cleanupInput: Parameters<
            typeof deleteWithLinkedChannelCleanup
          >[0] = null
          if (cleanup) {
            const keyBaseUrl = acceptedRowsRef.current.find(
              (row) => refIdentity(row.ref) === refIdentity(ref),
            )?.runtimeKey?.baseUrl
            if (!account)
              throw new AccountKeyResourceError({
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
              })
            cleanupInput = await buildAccountKeyResourceLinkedCleanupInput({
              account,
              ref,
              runtimeKeyBaseUrl: keyBaseUrl,
              resolveProvider: () =>
                actionContext.session.runtimeKey?.resolve(ref, {
                  signal: controller.signal,
                }) ?? Promise.resolve(undefined),
            })
          }
          await deleteWithLinkedChannelCleanup(cleanupInput, async () => {
            await actionContext.collection.delete(ref, {
              signal: controller.signal,
            })
          })
        })
        .then(async () => {
          if (current !== requests.version()) {
            requireFreshRead(boundary)
            completeKeyMutationAnalytics(
              tracker,
              PRODUCT_ANALYTICS_RESULTS.Success,
              mutationAnalyticsMode,
              account?.siteType,
            )
            return true
          }
          replaceAcceptedRows(
            acceptedRowsRef.current.filter(
              (row) => refIdentity(row.ref) !== refIdentity(ref),
            ),
          )
          setDeleteState({
            isOpen: false,
            isExecuting: false,
            ref: null,
            failure: null,
          })
          void refreshAfterMutation()
            .then((accepted) => {
              if (!accepted) requireFreshRead(boundary)
            })
            .catch(() => requireFreshRead(boundary))
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Success,
            mutationAnalyticsMode,
            account?.siteType,
          )
          return true
        })
        .catch(async (error: unknown) => {
          const failure = toFailure(error)
          if (current !== requests.version()) {
            if (
              failure.code ===
              ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
            )
              requireFreshRead(boundary)
            completeKeyMutationAnalytics(
              tracker,
              PRODUCT_ANALYTICS_RESULTS.Failure,
              mutationAnalyticsMode,
              account?.siteType,
            )
            return false
          }
          setDeleteState((state) => ({ ...state, isExecuting: false, failure }))
          if (
            failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          ) {
            requireFreshRead(boundary)
          }
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Failure,
            mutationAnalyticsMode,
            account?.siteType,
          )
          return false
        })
        .finally(() => {
          requests.releaseMutation(mutationIdentity, run)
          requests.release(requestSlots.Action, controller)
        })
      requests.registerMutation(mutationIdentity, {
        controller,
        promise: run,
      })
      return run
    },
    [
      deleteState.ref,
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      mutationAnalyticsMode,
      refreshAfterMutation,
      replaceAcceptedRows,
      requireFreshRead,
      resolveResourceActionContext,
      createdSecretRef,
      requests,
      collectionRef,
      activeResourceBoundaryRef,
      accountsRef,
      setDeleteState,
      sessionRef,
      acceptedRowsRef,
    ],
  )
  return { openDelete, cancelDelete, confirmDelete }
}
