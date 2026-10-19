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
  RecoverMutationFailure,
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
import { buildAccountKeyResourceLinkedCleanupInput } from "~/services/accounts/keys/accountKeyResourceCleanup"
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
    recoverMutationFailure: RecoverMutationFailure
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
    recoverMutationFailure,
  },
  requests,
  inventoryState,
  routing,
}: WorkflowInputs) {
  const { createdSecretRef, accountsRef } = routing

  const {
    readNativeOwner,
    readAcceptedRows,
    acceptActionContext,
    acceptDeletedResource,
    acceptEditedResource,
  } = inventoryState

  const openDelete = useCallback(
    (ref: AccountKeyResourceRef, operation: "delete" | "revoke" = "delete") => {
      const boundary = boundaryFromResourceRef(ref)
      if (
        mode === controllerModes.Idle ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        isFreshReadRequiredForBoundary(boundary) ||
        (mode === controllerModes.All
          ? !isAcceptedResourceRef(ref)
          : !readNativeOwner().collection || !isCurrentResourceRef(ref))
      )
        return false
      if (
        operation === "revoke" &&
        !readAcceptedRows().find(
          (facts) => refIdentity(facts.ref) === refIdentity(ref),
        )?.actions.canRevoke
      )
        return false
      setDeleteState({
        isOpen: true,
        isExecuting: false,
        ref,
        failure: null,
        operation,
      })
      return true
    },
    [
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      createdSecretRef,
      requests,
      readNativeOwner,
      readAcceptedRows,
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
          : !readNativeOwner().collection ||
            !isCurrentResourceRef(deleteState.ref))
      )
        return false
      const current = requests.version()
      const ref = deleteState.ref
      const isRevoke = deleteState.operation === "revoke"
      const boundary: ActiveResourceBoundary =
        mode === controllerModes.All
          ? boundaryFromResourceRef(ref)
          : readNativeOwner().boundary!
      if (isFreshReadRequiredForBoundary(boundary)) return false
      const mutationIdentity = boundaryIdentity(boundary)
      const existingMutation = requests.getMutation(mutationIdentity)
      if (existingMutation) return Boolean(await existingMutation.promise)
      const account = accountsRef.current.find(
        (candidate) => candidate.id === boundary.accountId,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          isRevoke
            ? PRODUCT_ANALYTICS_ACTION_IDS.RevokeAccountToken
            : PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccountToken,
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
          acceptActionContext(actionContext)
          if (isRevoke) {
            if (!actionContext.collection.revoke)
              throw new AccountKeyResourceError({
                code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
              })
            return actionContext.collection.revoke(ref, {
              signal: controller.signal,
            })
          }
          let cleanupInput: Parameters<
            typeof deleteWithLinkedChannelCleanup
          >[0] = null
          if (cleanup) {
            const keyBaseUrl = readAcceptedRows().find(
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
        .then(async (revokedFacts) => {
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
          if (revokedFacts) acceptEditedResource(revokedFacts)
          else acceptDeletedResource(ref)
          setDeleteState({
            isOpen: false,
            isExecuting: false,
            ref: null,
            failure: null,
          })
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
            await recoverMutationFailure(failure, boundary, false)
            completeKeyMutationAnalytics(
              tracker,
              PRODUCT_ANALYTICS_RESULTS.Failure,
              mutationAnalyticsMode,
              account?.siteType,
            )
            return false
          }
          setDeleteState((state) => ({ ...state, isExecuting: false, failure }))
          await recoverMutationFailure(failure, boundary, true)
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
      deleteState.operation,
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      mutationAnalyticsMode,
      acceptDeletedResource,
      acceptEditedResource,
      acceptActionContext,
      requireFreshRead,
      recoverMutationFailure,
      resolveResourceActionContext,
      createdSecretRef,
      requests,
      readNativeOwner,
      accountsRef,
      setDeleteState,
      readAcceptedRows,
    ],
  )
  const openRevoke = useCallback(
    (ref: AccountKeyResourceRef) => openDelete(ref, "revoke"),
    [openDelete],
  )
  return { openDelete, openRevoke, cancelDelete, confirmDelete }
}
