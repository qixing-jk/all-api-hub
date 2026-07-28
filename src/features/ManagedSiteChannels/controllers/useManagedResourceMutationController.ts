import { useCallback, useEffect, useRef, useState } from "react"

import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ManagedResourceWorkspace,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import type { ManagedChannelsRowViewModel } from "../presentation/contracts"
import { mapSettledWithConcurrency } from "./managedResourceConcurrency"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
  type ManagedResourceControllerAnalytics,
} from "./managedResourceControllerAnalytics"

const safeFailure = (error: unknown): ResourceFailure =>
  error instanceof ManagedResourceError
    ? error.failure
    : { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }

const refIdentity = (ref: ManagedResourceRef) =>
  JSON.stringify([ref.siteType, ref.kind, ref.scopeKey, ref.resourceId])

type DeleteResult = {
  rowKey: string
  status: "success" | "failed" | "uncertain"
  resultKey: string
}

type DeleteState = {
  isOpen: boolean
  isExecuting: boolean
  rowKeys: string[]
  results: DeleteResult[]
  requiresRefresh: boolean
  requiresFreshRead: boolean
  failure: ResourceFailure | null
}

type ActiveMutationSession = "submit" | "delete"
type ManagedResourceEditorFeedback =
  | { kind: "open-failed"; failure: ResourceFailure }
  | { kind: "save-failed"; failure: ResourceFailure }
  | { kind: "save-uncertain"; failure: ResourceFailure }
  | { kind: "saved-refresh-failed" }

type ManagedResourceSessionPhase =
  | "idle"
  | "detail-loading"
  | "detail-open"
  | "editor-loading"
  | "editor-open"
  | "delete-confirmation"
  | "submit"
  | "delete-execution"

const createDeleteState = (): DeleteState => ({
  isOpen: false,
  isExecuting: false,
  rowKeys: [],
  results: [],
  requiresRefresh: false,
  requiresFreshRead: false,
  failure: null,
})

/** Owns native detail/editor/delete lifecycles and mutation certainty boundaries. */
export function useManagedResourceMutationController({
  workspace,
  refresh,
  resolveRef,
  mapFacts,
  onMutationStart,
  onMutationSuccess,
  analytics,
}: {
  workspace: ManagedResourceWorkspace | null
  refresh?: () => Promise<boolean>
  resolveRef?: (rowKey: string) => ManagedResourceRef | undefined
  mapFacts?: (facts: ResourceDisplayFacts) => ManagedChannelsRowViewModel
  onMutationStart?: () => void
  onMutationSuccess?: (mode: "create" | "edit") => void
  analytics?: ManagedResourceControllerAnalytics
}) {
  const [detail, setDetail] = useState<ManagedChannelsRowViewModel | null>(null)
  const [detailFailure, setDetailFailure] = useState<ResourceFailure | null>(
    null,
  )
  const [editor, setEditor] = useState<ResourceEditor | null>(null)
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null)
  const [editorFeedback, setEditorFeedback] =
    useState<ManagedResourceEditorFeedback | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteState, setDeleteState] = useState<DeleteState>(createDeleteState)
  const activeMutationSession = useRef<ActiveMutationSession | null>(null)
  const sessionPhase = useRef<ManagedResourceSessionPhase>("idle")
  const generation = useRef(0)
  const activeAbort = useRef<AbortController | undefined>(undefined)
  const submitPromise = useRef<
    Promise<ResourceDisplayFacts | undefined> | undefined
  >(undefined)
  const activeSubmitAnalytics = useRef<
    ManagedResourceAnalyticsCompletion | undefined
  >(undefined)
  const deleteGeneration = useRef(0)
  const deleteAbortControllers = useRef<Set<AbortController>>(new Set())
  const deleteSession = useRef<{
    rowKey: string
    ref: ManagedResourceRef
  } | null>(null)
  const deletePromise = useRef<Promise<DeleteResult[]> | undefined>(undefined)
  const freshReadPromise = useRef<Promise<boolean> | undefined>(undefined)
  const activeDeleteAnalytics = useRef<
    ManagedResourceAnalyticsCompletion | undefined
  >(undefined)

  const beginMutationSession = useCallback((session: ActiveMutationSession) => {
    if (activeMutationSession.current !== null) return false
    activeMutationSession.current = session
    return true
  }, [])

  const endMutationSession = useCallback((session: ActiveMutationSession) => {
    if (activeMutationSession.current === session) {
      activeMutationSession.current = null
    }
  }, [])

  const invalidate = useCallback(() => {
    sessionPhase.current = "idle"
    activeMutationSession.current = null
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    submitPromise.current = undefined
    activeSubmitAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeSubmitAnalytics.current = undefined
    deleteGeneration.current += 1
    for (const controller of deleteAbortControllers.current) controller.abort()
    deleteAbortControllers.current.clear()
    deleteSession.current = null
    deletePromise.current = undefined
    freshReadPromise.current = undefined
    activeDeleteAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeDeleteAnalytics.current = undefined
  }, [])
  useEffect(() => {
    invalidate()
    setDetail(null)
    setEditor(null)
    setEditorMode(null)
    setEditorFeedback(null)
    setIsSaving(false)
    setDeleteState(createDeleteState())
    return invalidate
  }, [invalidate, workspace])

  const runSession = useCallback(
    async <T>(
      loadingPhase: "detail-loading" | "editor-loading",
      openPhase: "detail-open" | "editor-open",
      operation: (signal: AbortSignal) => Promise<T>,
      accept: (value: T) => void,
      isStillCurrent: () => boolean = () => true,
    ) => {
      if (sessionPhase.current !== "idle") return
      sessionPhase.current = loadingPhase
      const current = ++generation.current
      const controller = new AbortController()
      activeAbort.current = controller
      try {
        const value = await operation(controller.signal)
        if (current === generation.current && isStillCurrent()) {
          accept(value)
          sessionPhase.current = openPhase
        } else if (current === generation.current) {
          sessionPhase.current = "idle"
        }
      } catch (error) {
        if (
          current === generation.current &&
          safeFailure(error).code !== MANAGED_RESOURCE_FAILURE_CODES.Aborted
        )
          throw error
      } finally {
        if (
          current === generation.current &&
          sessionPhase.current === loadingPhase
        )
          sessionPhase.current = "idle"
      }
    },
    [],
  )

  const resolveRowRef = useCallback(
    (rowKey: string) => {
      const ref = resolveRef?.(rowKey)
      if (!ref)
        throw new ManagedResourceError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
        })
      return ref
    },
    [resolveRef],
  )

  const isSameRowRef = useCallback(
    (rowKey: string, expectedRef: ManagedResourceRef) => {
      const currentRef = resolveRef?.(rowKey)
      return (
        currentRef !== undefined &&
        refIdentity(currentRef) === refIdentity(expectedRef)
      )
    },
    [resolveRef],
  )

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

  const openDetail = useCallback(
    (rowKey: string) => {
      if (
        !workspace ||
        !mapFacts ||
        sessionPhase.current !== "idle" ||
        deleteState.requiresFreshRead
      )
        return Promise.resolve()
      let ref: ManagedResourceRef
      try {
        ref = resolveRowRef(rowKey)
      } catch (error) {
        setDetailFailure(safeFailure(error))
        return Promise.resolve()
      }
      return runSession(
        "detail-loading",
        "detail-open",
        (signal) => workspace.get(ref, { signal }),
        (value) => {
          setDetailFailure(null)
          setDetail(mapFacts(value))
        },
        () => isSameRowRef(rowKey, ref),
      ).catch(async (error) => {
        const failure = safeFailure(error)
        setDetailFailure(failure)
        if (failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound) {
          await refresh?.()
        }
      })
    },
    [
      deleteState.requiresFreshRead,
      isSameRowRef,
      mapFacts,
      refresh,
      resolveRowRef,
      runSession,
      workspace,
    ],
  )

  const openCreate = useCallback(
    () =>
      workspace?.capabilities.canCreate &&
      sessionPhase.current === "idle" &&
      !deleteState.requiresFreshRead
        ? runSession(
            "editor-loading",
            "editor-open",
            (signal) => workspace.openCreateEditor({ signal }),
            (value) => {
              setEditorFeedback(null)
              setEditor(value)
              setEditorMode("create")
            },
          ).catch((error) =>
            setEditorFeedback({
              kind: "open-failed",
              failure: safeFailure(error),
            }),
          )
        : Promise.resolve(),
    [deleteState.requiresFreshRead, runSession, workspace],
  )

  const openEdit = useCallback(
    (rowKey: string) => {
      if (
        !workspace?.capabilities.canUpdate ||
        sessionPhase.current !== "idle" ||
        deleteState.requiresFreshRead
      )
        return Promise.resolve()
      let ref: ManagedResourceRef
      try {
        ref = resolveRowRef(rowKey)
      } catch (error) {
        setEditorFeedback({
          kind: "open-failed",
          failure: safeFailure(error),
        })
        return Promise.resolve()
      }
      return runSession(
        "editor-loading",
        "editor-open",
        (signal) => workspace.openEditEditor(ref, { signal }),
        (value) => {
          setEditorFeedback(null)
          setEditor(value)
          setEditorMode("edit")
        },
        () => isSameRowRef(rowKey, ref),
      ).catch((error) =>
        setEditorFeedback({
          kind: "open-failed",
          failure: safeFailure(error),
        }),
      )
    },
    [
      deleteState.requiresFreshRead,
      isSameRowRef,
      resolveRowRef,
      runSession,
      workspace,
    ],
  )

  const submit = useCallback(
    (values: EditableResourceProjection) => {
      if (submitPromise.current) return submitPromise.current
      if (!editor || sessionPhase.current !== "editor-open")
        return Promise.resolve(undefined)
      const validation = editor.validate(values)
      if (!validation.valid) {
        setEditorFeedback({
          kind: "save-failed",
          failure: {
            code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
            fieldIssues: validation.issues,
          },
        })
        return Promise.resolve(undefined)
      }
      if (!beginMutationSession("submit")) return Promise.resolve(undefined)
      sessionPhase.current = "submit"
      const current = generation.current
      const submittedMode = editorMode ?? "edit"
      const analyticsCompletion = startManagedResourceControllerAction(
        analytics,
        editorMode === "create"
          ? PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel
          : PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
        editorMode === "create"
          ? PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar
          : PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      activeSubmitAnalytics.current = analyticsCompletion
      onMutationStart?.()
      const controller = new AbortController()
      activeAbort.current = controller
      setIsSaving(true)
      let closesEditor = false
      const promise = editor
        .submit(values, { signal: controller.signal })
        .then(async (saved) => {
          if (current !== generation.current) return undefined
          closesEditor = true
          setEditor(null)
          setEditorMode(null)
          const refreshAccepted = await requestFreshRead()
          if (current !== generation.current) return undefined
          setEditorFeedback(
            refreshAccepted ? null : { kind: "saved-refresh-failed" },
          )
          if (!refreshAccepted) requireFreshRead()
          analyticsCompletion?.complete(
            refreshAccepted
              ? PRODUCT_ANALYTICS_RESULTS.Success
              : PRODUCT_ANALYTICS_RESULTS.Failure,
            refreshAccepted
              ? undefined
              : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
          )
          if (refreshAccepted) onMutationSuccess?.(submittedMode)
          return refreshAccepted ? saved : undefined
        })
        .catch(async (error: unknown) => {
          if (current !== generation.current) return undefined
          const failure = safeFailure(error)
          setEditorFeedback({
            kind:
              failure.code ===
              MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
                ? "save-uncertain"
                : "save-failed",
            failure,
          })
          analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          if (
            failure.code ===
              MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain ||
            failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound
          ) {
            closesEditor = true
            setEditor(null)
            setEditorMode(null)
            const refreshAccepted = await requestFreshRead()
            if (current !== generation.current) return undefined
            if (!refreshAccepted) requireFreshRead()
          }
          return undefined
        })
        .finally(() => {
          if (current === generation.current) {
            setIsSaving(false)
            submitPromise.current = undefined
            if (activeSubmitAnalytics.current === analyticsCompletion)
              activeSubmitAnalytics.current = undefined
            endMutationSession("submit")
            if (sessionPhase.current === "submit")
              sessionPhase.current = closesEditor ? "idle" : "editor-open"
          }
        })
      submitPromise.current = promise
      return promise
    },
    [
      analytics,
      beginMutationSession,
      editor,
      editorMode,
      endMutationSession,
      onMutationStart,
      onMutationSuccess,
      requestFreshRead,
      requireFreshRead,
    ],
  )

  const capabilities = workspace?.capabilities ?? {
    canSearch: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  }

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
        activeMutationSession.current !== "delete" ||
        sessionPhase.current !== "delete-execution" ||
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
            await workspace.delete(ref, { signal: controller.signal })
          } finally {
            deleteAbortControllers.current.delete(controller)
          }
        },
      )
        .then(async (settled) => {
          if (currentGeneration !== deleteGeneration.current) return []
          const results = settled.map((outcome, index) => {
            if (outcome.status === "fulfilled") {
              return {
                rowKey: resolvedTargets[index].rowKey,
                status: "success" as const,
                resultKey: "delete_success",
              }
            }
            const failure = safeFailure(outcome.reason)
            const status =
              failure.code === MANAGED_RESOURCE_FAILURE_CODES.NotFound
                ? ("success" as const)
                : failure.code ===
                    MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain
                  ? ("uncertain" as const)
                  : ("failed" as const)
            return {
              rowKey: resolvedTargets[index].rowKey,
              status,
              resultKey: `delete_${status}`,
            }
          })
          const refreshAccepted =
            (await refresh?.().catch(() => false)) ?? false
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
            ({ status }) => status === "success",
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
          endMutationSession("delete")
          if (sessionPhase.current === "delete-execution")
            sessionPhase.current = "idle"
        })
      deletePromise.current = execution
      return execution
    },
    [analytics, endMutationSession, onMutationStart, refresh, workspace],
  )

  const bulkDelete = useCallback(
    (rowKeys: readonly string[]) => {
      if (
        !workspace ||
        !capabilities.canDelete ||
        deleteState.requiresFreshRead ||
        sessionPhase.current !== "idle" ||
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
        ref ? [refIdentity(ref)] : [],
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
      if (!beginMutationSession("delete")) return Promise.resolve([])
      sessionPhase.current = "delete-execution"
      return executeDeleteTargets(
        resolvedTargets as { rowKey: string; ref: ManagedResourceRef }[],
        PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
    },
    [
      capabilities.canDelete,
      beginMutationSession,
      deleteState.requiresFreshRead,
      executeDeleteTargets,
      resolveRef,
      workspace,
    ],
  )

  const openDelete = useCallback(
    (rowKey: string) => {
      if (
        !workspace ||
        !capabilities.canDelete ||
        deleteState.requiresFreshRead ||
        sessionPhase.current !== "idle"
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
      if (!beginMutationSession("delete")) return false
      sessionPhase.current = "delete-confirmation"
      deleteSession.current = { rowKey, ref: { ...ref } }
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
    ],
  )

  const confirmDelete = useCallback(() => {
    if (deletePromise.current) return deletePromise.current
    const session = deleteSession.current
    if (!session || !workspace || !capabilities.canDelete) {
      return Promise.resolve([])
    }
    if (sessionPhase.current !== "delete-confirmation")
      return Promise.resolve([])
    const currentRef = resolveRef?.(session.rowKey)
    if (!currentRef || refIdentity(currentRef) !== refIdentity(session.ref)) {
      deleteSession.current = null
      endMutationSession("delete")
      sessionPhase.current = "idle"
      setDeleteState((current) => ({
        ...current,
        isOpen: false,
        rowKeys: [],
        failure: { code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed },
      }))
      return Promise.resolve([])
    }
    sessionPhase.current = "delete-execution"
    return executeDeleteTargets(
      [session],
      PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
  }, [
    capabilities.canDelete,
    endMutationSession,
    executeDeleteTargets,
    resolveRef,
    workspace,
  ])

  const cancelDelete = useCallback(() => {
    if (deletePromise.current) return
    deleteSession.current = null
    endMutationSession("delete")
    sessionPhase.current = "idle"
    setDeleteState((current) => ({
      ...current,
      isOpen: false,
      rowKeys: [],
      failure: null,
    }))
  }, [endMutationSession])

  const closeDetail = useCallback(() => {
    if (
      sessionPhase.current !== "detail-loading" &&
      sessionPhase.current !== "detail-open"
    )
      return
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    sessionPhase.current = "idle"
    setDetail(null)
    setDetailFailure(null)
  }, [])

  const closeEditor = useCallback(() => {
    if (
      sessionPhase.current !== "editor-loading" &&
      sessionPhase.current !== "editor-open"
    )
      return
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    sessionPhase.current = "idle"
    setEditor(null)
    setEditorMode(null)
    setEditorFeedback(null)
  }, [])

  const recoverFreshRead = useCallback(() => {
    if (!deleteState.requiresFreshRead) return Promise.resolve(true)
    if (freshReadPromise.current) return freshReadPromise.current
    const currentGeneration = deleteGeneration.current
    const recovery = Promise.resolve(refresh?.())
      .then((accepted) => accepted ?? false)
      .catch(() => false)
      .then((accepted) => {
        if (accepted && currentGeneration === deleteGeneration.current) {
          setEditorFeedback(null)
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
  }, [deleteState.requiresFreshRead, refresh])

  const editorFailure =
    editorFeedback && "failure" in editorFeedback
      ? editorFeedback.failure
      : null

  return {
    capabilities,
    detail,
    detailFailure,
    editor,
    editorMode,
    editorFailure,
    editorFeedback,
    isSaving,
    deleteState,
    openDetail,
    closeDetail,
    openCreate,
    openEdit,
    closeEditor,
    submit,
    openDelete,
    confirmDelete,
    cancelDelete,
    recoverFreshRead,
    bulkDelete,
  }
}
