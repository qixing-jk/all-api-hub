import { useCallback, useRef, useState } from "react"

import { MANAGED_CHANNELS_DELETE_RESULT_STATUSES } from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { mapSettledWithConcurrency } from "~/services/apiAdapters/nativeResources/concurrency"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import { EMPTY_MANAGED_RESOURCE_CAPABILITIES } from "../utils/managedResource"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
} from "./managedResourceControllerAnalytics"
import { canAcceptDeleteEffectsLocally } from "./managedResourceMutationPolicy"
import {
  ACTIVE_MUTATION_SESSIONS,
  MANAGED_RESOURCE_SESSION_PHASES,
  type DeleteExecutionResult,
  type DeleteResult,
  type DeleteState,
  type ManagedResourceMutationGate,
  type ManagedResourceMutationOptions,
} from "./managedResourceMutationTypes"

const createDeleteState = (): DeleteState => ({
  isOpen: false,
  isExecuting: false,
  rowKeys: [],
  results: [],
  requiresRefresh: false,
  requiresFreshRead: false,
  failure: null,
})

/** Owns delete confirmation, bounded execution, cancellation, and mandatory fresh-read recovery. */
export function useManagedResourceDeletionSession({
  workspace,
  refresh,
  resolveRef,
  acceptDeletionResults,
  onMutationStart,
  analytics,
  session,
  onFreshReadRecovered,
}: Pick<
  ManagedResourceMutationOptions,
  | "workspace"
  | "refresh"
  | "resolveRef"
  | "acceptDeletionResults"
  | "onMutationStart"
  | "analytics"
> & {
  session: ManagedResourceMutationGate
  onFreshReadRecovered: () => void
}) {
  const {
    phase: sessionPhase,
    active: activeMutationSession,
    begin: beginMutationSession,
    end: endMutationSession,
  } = session
  const capabilities =
    workspace?.capabilities ?? EMPTY_MANAGED_RESOURCE_CAPABILITIES
  const [deleteState, setDeleteState] = useState<DeleteState>(createDeleteState)

  const deleteGeneration = useRef(0)

  const deleteAbortControllers = useRef<Set<AbortController>>(new Set())

  const deleteSession = useRef<{
    targets: Array<{
      rowKey: string
      ref: ManagedResourceRef
    }>
    actionId:
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels
    surfaceId:
      | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions
      | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar
  } | null>(null)

  const deletePromise = useRef<Promise<DeleteResult[]> | undefined>(undefined)

  const freshReadPromise = useRef<Promise<boolean> | undefined>(undefined)

  const activeDeleteAnalytics = useRef<
    ManagedResourceAnalyticsCompletion | undefined
  >(undefined)

  const requestFreshRead = useCallback(async () => {
    try {
      return (await refresh?.()) ?? false
    } catch {
      return false
    }
  }, [refresh])

  const requireFreshRead = useCallback(() => {
    setDeleteState((currentState) => ({
      ...currentState,
      requiresRefresh: true,
      requiresFreshRead: true,
    }))
  }, [])

  const executeDeleteTargets = useCallback(
    (
      resolvedTargets: readonly {
        rowKey: string
        ref: ManagedResourceRef
      }[],
      actionId:
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
      surfaceId:
        | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions
        | typeof PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    ) => {
      if (
        !workspace ||
        activeMutationSession.current !== ACTIVE_MUTATION_SESSIONS.Delete ||
        sessionPhase.current !==
          MANAGED_RESOURCE_SESSION_PHASES.DeleteExecution ||
        deletePromise.current
      ) {
        return deletePromise.current ?? Promise.resolve([])
      }
      const rowKeys = resolvedTargets.map(({ rowKey }) => rowKey)
      const currentGeneration = ++deleteGeneration.current
      const analyticsCompletion = startManagedResourceControllerAction(
        analytics,
        actionId,
        surfaceId,
      )
      activeDeleteAnalytics.current = analyticsCompletion
      onMutationStart?.()
      setDeleteState((current) => ({
        ...current,
        isOpen: true,
        isExecuting: true,
        rowKeys,
        results: [],
        failure: null,
      }))

      const execution = mapSettledWithConcurrency(
        resolvedTargets,
        4,
        async ({ ref }) => {
          const controller = new AbortController()
          deleteAbortControllers.current.add(controller)
          try {
            const mutationResult: unknown = await workspace.delete(ref, {
              signal: controller.signal,
            })
            assertManagedSiteMutationResult<
              void,
              ManagedSiteMutationConfirmedEffect
            >(mutationResult, { idempotent: true })
            switch (mutationResult.outcome) {
              case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
                return {
                  status: MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success,
                  locallyConfirmed: canAcceptDeleteEffectsLocally(
                    ref,
                    mutationResult.confirmedEffects,
                  ),
                } satisfies DeleteExecutionResult
              case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
                return {
                  status: MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Failed,
                  locallyConfirmed: true,
                } satisfies DeleteExecutionResult
              case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
              case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
                return {
                  status: MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Uncertain,
                  locallyConfirmed: false,
                } satisfies DeleteExecutionResult
            }
          } finally {
            deleteAbortControllers.current.delete(controller)
          }
        },
      )
        .then(async (settled) => {
          const results: DeleteResult[] = []
          const locallyConfirmedSuccessIndexes = new Set<number>()
          let unexpectedFailure:
            | { readonly found: false }
            | { readonly found: true; readonly reason: unknown } = {
            found: false,
          }
          for (const [index, outcome] of settled.entries()) {
            if (outcome.status === "rejected") {
              unexpectedFailure = { found: true, reason: outcome.reason }
              break
            }

            const target = resolvedTargets[index]
            if (!target) continue
            const { locallyConfirmed, status } = outcome.value
            if (
              status === MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success &&
              locallyConfirmed
            ) {
              locallyConfirmedSuccessIndexes.add(index)
            }
            results.push({
              rowKey: target.rowKey,
              status,
              resultKey: `delete_${status}`,
            })
          }

          if (unexpectedFailure.found) {
            if (currentGeneration !== deleteGeneration.current) {
              throw unexpectedFailure.reason
            }
            const refreshAccepted = await requestFreshRead()
            if (currentGeneration === deleteGeneration.current) {
              setDeleteState({
                isOpen: false,
                isExecuting: false,
                rowKeys: [],
                results: [],
                requiresRefresh: !refreshAccepted,
                requiresFreshRead: !refreshAccepted,
                failure: refreshAccepted
                  ? null
                  : {
                      code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                    },
              })
            }
            throw unexpectedFailure.reason
          }

          if (currentGeneration !== deleteGeneration.current) return []
          const canAcceptDeletionResults =
            results.every(
              ({ status }) =>
                status !== MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Uncertain,
            ) &&
            results.every(
              ({ status }, index) =>
                status !== MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success ||
                locallyConfirmedSuccessIndexes.has(index),
            )
          let deletionAccepted = false
          if (canAcceptDeletionResults) {
            const successfulTargets = resolvedTargets.filter(
              (_, index) =>
                results[index]?.status ===
                MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success,
            )
            try {
              deletionAccepted =
                acceptDeletionResults?.(successfulTargets) ?? false
            } catch {
              deletionAccepted = false
            }
          }
          const refreshAccepted = deletionAccepted || (await requestFreshRead())
          if (currentGeneration !== deleteGeneration.current) return []
          const requiresFreshRead = !refreshAccepted
          setDeleteState({
            isOpen: false,
            isExecuting: false,
            rowKeys,
            results,
            requiresRefresh: requiresFreshRead,
            requiresFreshRead,
            failure: null,
          })
          deleteSession.current = null
          const successCount = results.filter(
            ({ status }) =>
              status === MANAGED_CHANNELS_DELETE_RESULT_STATUSES.Success,
          ).length
          const failureCount = results.length - successCount
          analyticsCompletion?.complete(
            failureCount > 0
              ? PRODUCT_ANALYTICS_RESULTS.Failure
              : PRODUCT_ANALYTICS_RESULTS.Success,
            {
              insights: {
                itemCount: results.length,
                selectedCount: rowKeys.length,
                successCount,
                failureCount,
              },
            },
          )
          return results
        })
        .finally(() => {
          if (deletePromise.current === execution)
            deletePromise.current = undefined
          if (activeDeleteAnalytics.current === analyticsCompletion)
            activeDeleteAnalytics.current = undefined
          if (currentGeneration === deleteGeneration.current) {
            deleteSession.current = null
            setDeleteState((current) =>
              current.isExecuting
                ? {
                    ...current,
                    isOpen: false,
                    isExecuting: false,
                    rowKeys: [],
                    results: [],
                    requiresRefresh: false,
                    requiresFreshRead: false,
                    failure: null,
                  }
                : current,
            )
            endMutationSession(ACTIVE_MUTATION_SESSIONS.Delete)
            if (
              sessionPhase.current ===
              MANAGED_RESOURCE_SESSION_PHASES.DeleteExecution
            )
              sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
          }
        })
      deletePromise.current = execution
      return execution
    },
    [
      analytics,
      acceptDeletionResults,
      endMutationSession,
      onMutationStart,
      requestFreshRead,
      workspace,
      sessionPhase,
      activeMutationSession,
    ],
  )

  const openBulkDelete = useCallback(
    (rowKeys: readonly string[]) => {
      if (
        !workspace ||
        !capabilities.canDelete ||
        deleteState.requiresFreshRead ||
        sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle ||
        rowKeys.length === 0 ||
        new Set(rowKeys).size !== rowKeys.length
      ) {
        setDeleteState((current) => ({
          ...current,
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
        }))
        return Promise.resolve([])
      }
      const resolvedTargets = rowKeys.map((rowKey) => {
        const ref = resolveRef?.(rowKey)
        return { rowKey, ref: ref ? { ...ref } : undefined }
      })
      const resolvedIdentities = resolvedTargets.flatMap(({ ref }) =>
        ref ? [getManagedResourceRefKey(ref)] : [],
      )
      if (
        resolvedIdentities.length !== resolvedTargets.length ||
        new Set(resolvedIdentities).size !== resolvedIdentities.length
      ) {
        setDeleteState((current) => ({
          ...current,
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
        }))
        return Promise.resolve([])
      }
      if (!beginMutationSession(ACTIVE_MUTATION_SESSIONS.Delete))
        return Promise.resolve([])
      sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.DeleteConfirmation
      deleteSession.current = {
        targets: resolvedTargets as {
          rowKey: string
          ref: ManagedResourceRef
        }[],
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      }
      setDeleteState((current) => ({
        ...current,
        isOpen: true,
        isExecuting: false,
        rowKeys: [...rowKeys],
        results: [],
        failure: null,
      }))
      return Promise.resolve([])
    },
    [
      capabilities.canDelete,
      beginMutationSession,
      deleteState.requiresFreshRead,
      resolveRef,
      workspace,
      sessionPhase,
    ],
  )

  const openDelete = useCallback(
    (rowKey: string) => {
      if (
        !workspace ||
        !capabilities.canDelete ||
        deleteState.requiresFreshRead ||
        sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle
      ) {
        setDeleteState((current) => ({
          ...current,
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
        }))
        return false
      }
      const ref = resolveRef?.(rowKey)
      if (!ref) {
        setDeleteState((current) => ({
          ...current,
          failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
        }))
        return false
      }
      if (!beginMutationSession(ACTIVE_MUTATION_SESSIONS.Delete)) return false
      sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.DeleteConfirmation
      deleteSession.current = {
        targets: [{ rowKey, ref: { ...ref } }],
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      }
      setDeleteState((current) => ({
        ...current,
        isOpen: true,
        rowKeys: [rowKey],
        results: [],
        failure: null,
      }))
      return true
    },
    [
      capabilities.canDelete,
      beginMutationSession,
      deleteState.requiresFreshRead,
      resolveRef,
      workspace,
      sessionPhase,
    ],
  )

  const confirmDelete = useCallback(() => {
    if (deletePromise.current) return deletePromise.current
    const session = deleteSession.current
    if (!session || !workspace || !capabilities.canDelete) {
      return Promise.resolve([])
    }
    if (
      sessionPhase.current !==
      MANAGED_RESOURCE_SESSION_PHASES.DeleteConfirmation
    )
      return Promise.resolve([])
    const isSessionCurrent = session.targets.every(({ rowKey, ref }) => {
      const currentRef = resolveRef?.(rowKey)
      return (
        currentRef &&
        getManagedResourceRefKey(currentRef) === getManagedResourceRefKey(ref)
      )
    })
    if (!isSessionCurrent) {
      deleteSession.current = null
      endMutationSession(ACTIVE_MUTATION_SESSIONS.Delete)
      sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
      setDeleteState((current) => ({
        ...current,
        isOpen: false,
        rowKeys: [],
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
      }))
      return Promise.resolve([])
    }
    sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.DeleteExecution
    return executeDeleteTargets(
      session.targets,
      session.actionId,
      session.surfaceId,
    )
  }, [
    capabilities.canDelete,
    endMutationSession,
    executeDeleteTargets,
    resolveRef,
    workspace,
    sessionPhase,
  ])

  const cancelDelete = useCallback(() => {
    if (deletePromise.current) return
    deleteSession.current = null
    endMutationSession(ACTIVE_MUTATION_SESSIONS.Delete)
    sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
    setDeleteState((current) => ({
      ...current,
      isOpen: false,
      rowKeys: [],
      failure: null,
    }))
  }, [endMutationSession, sessionPhase])

  const recoverFreshRead = useCallback(() => {
    if (!deleteState.requiresFreshRead) return Promise.resolve(true)
    if (freshReadPromise.current) return freshReadPromise.current
    const currentGeneration = deleteGeneration.current
    const recovery = Promise.resolve(refresh?.())
      .then((accepted) => accepted ?? false)
      .catch(() => false)
      .then((accepted) => {
        if (accepted && currentGeneration === deleteGeneration.current) {
          onFreshReadRecovered()
          setDeleteState((current) => ({
            ...current,
            requiresRefresh: false,
            requiresFreshRead: false,
            failure: null,
          }))
        }
        return accepted
      })
      .finally(() => {
        if (freshReadPromise.current === recovery)
          freshReadPromise.current = undefined
      })
    freshReadPromise.current = recovery
    return recovery
  }, [deleteState.requiresFreshRead, refresh, onFreshReadRecovered])

  /** Invalidates pending deletion and recovery work before a workspace changes. */
  const invalidateDeletion = useCallback(() => {
    deleteGeneration.current += 1
    for (const controller of deleteAbortControllers.current) controller.abort()
    deleteAbortControllers.current.clear()
    deleteSession.current = null
    deletePromise.current = undefined
    freshReadPromise.current = undefined
    activeDeleteAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeDeleteAnalytics.current = undefined
  }, [])
  /** Clears deletion feedback after the shared session invalidates the old workspace. */
  const resetDeletion = useCallback(
    () => setDeleteState(createDeleteState()),
    [],
  )
  return {
    deleteState,
    openBulkDelete,
    openDelete,
    confirmDelete,
    cancelDelete,
    recoverFreshRead,
    requestFreshRead,
    requireFreshRead,
    invalidateDeletion,
    resetDeletion,
  }
}
