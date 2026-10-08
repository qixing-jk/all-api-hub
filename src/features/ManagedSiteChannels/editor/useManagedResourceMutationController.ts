import { useCallback, useEffect, useRef, useState } from "react"

import { useManagedResourceDeletionSession } from "~/features/ManagedSiteChannels/deletion/useManagedResourceDeletionSession"
import { type ChannelDialogOpeningState } from "~/features/ManagedSiteChannels/editor/ChannelDialog/components/ChannelDialogOpening"
import {
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import {
  ACTIVE_MUTATION_SESSIONS,
  MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS,
  MANAGED_RESOURCE_SESSION_PHASES,
  type ActiveMutationSession,
  type ManagedResourceEditorFeedback,
  type ManagedResourceMutationOptions,
  type ManagedResourceSessionPhase,
} from "~/features/ManagedSiteChannels/editor/managedResourceMutationTypes"
import { acceptManagedResourceSubmission } from "~/features/ManagedSiteChannels/editor/managedResourceSubmission"
import { type ManagedResourceRowData } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import {
  EMPTY_MANAGED_RESOURCE_CAPABILITIES,
  toSafeManagedResourceFailure,
} from "~/features/ManagedSiteChannels/utils/managedResource"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
} from "~/features/ManagedSiteChannels/workspace/managedResourceControllerAnalytics"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceDisplayFacts,
  type ResourceEditor,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { collectManagedResourceSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

/** Owns native detail/editor/delete lifecycles and mutation certainty boundaries. */
export function useManagedResourceMutationController({
  workspace,
  refresh,
  resolveRef,
  mapFacts,
  acceptMutationResult,
  acceptDeletionResults,
  onMutationStart,
  onMutationSuccess,
  onMutationConfirmed,
  analytics,
  readEditor,
}: ManagedResourceMutationOptions) {
  const [opening, setOpening] = useState<ChannelDialogOpeningState>({
    attemptId: 0,
    status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
  })
  const retryOpeningRef = useRef<(() => void) | undefined>(undefined)
  const [detail, setDetail] = useState<ManagedResourceRowData | null>(null)
  const [detailFailure, setDetailFailure] = useState<ResourceFailure | null>(
    null,
  )
  const [editor, setEditor] = useState<ResourceEditor | null>(null)
  const [editorMode, setEditorMode] =
    useState<ManagedResourceEditorMode | null>(null)
  const [editorFeedback, setEditorFeedback] =
    useState<ManagedResourceEditorFeedback | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const activeMutationSession = useRef<ActiveMutationSession | null>(null)
  const sessionPhase = useRef<ManagedResourceSessionPhase>(
    MANAGED_RESOURCE_SESSION_PHASES.Idle,
  )
  const generation = useRef(0)
  const activeAbort = useRef<AbortController | undefined>(undefined)
  const submitPromise = useRef<
    Promise<ResourceDisplayFacts | undefined> | undefined
  >(undefined)
  const activeSubmitAnalytics = useRef<
    ManagedResourceAnalyticsCompletion | undefined
  >(undefined)
  const activeEditorAnalytics = useRef<
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

  const clearEditorFeedback = useCallback(() => setEditorFeedback(null), [])
  const {
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
  } = useManagedResourceDeletionSession({
    workspace,
    refresh,
    resolveRef,
    acceptDeletionResults,
    onMutationStart,
    analytics,
    session: {
      phase: sessionPhase,
      active: activeMutationSession,
      begin: beginMutationSession,
      end: endMutationSession,
    },
    onFreshReadRecovered: clearEditorFeedback,
  })

  const invalidate = useCallback(() => {
    sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
    activeMutationSession.current = null
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    submitPromise.current = undefined
    activeEditorAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeEditorAnalytics.current = undefined
    activeSubmitAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeSubmitAnalytics.current = undefined
    invalidateDeletion()
  }, [invalidateDeletion])
  useEffect(() => {
    invalidate()
    setOpening({
      attemptId: generation.current,
      status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
    })
    retryOpeningRef.current = undefined
    setDetail(null)
    setEditor(null)
    setEditorMode(null)
    setEditorFeedback(null)
    setIsSaving(false)
    resetDeletion()
    return invalidate
  }, [invalidate, resetDeletion, workspace])

  const runSession = useCallback(
    async <T>(
      mode: "create" | "edit" | "view",
      loadingPhase:
        | typeof MANAGED_RESOURCE_SESSION_PHASES.DetailLoading
        | typeof MANAGED_RESOURCE_SESSION_PHASES.EditorLoading,
      openPhase:
        | typeof MANAGED_RESOURCE_SESSION_PHASES.DetailOpen
        | typeof MANAGED_RESOURCE_SESSION_PHASES.EditorOpen,
      operation: (signal: AbortSignal) => Promise<T>,
      accept: (value: T) => void,
      isStillCurrent: () => boolean = () => true,
    ) => {
      if (sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle) return
      sessionPhase.current = loadingPhase
      const current = ++generation.current
      const controller = new AbortController()
      activeAbort.current = controller
      setOpening({
        attemptId: current,
        status: "loading",
        mode,
        reveal: "delayed",
      })
      try {
        const value = await operation(controller.signal)
        if (current === generation.current && isStillCurrent()) {
          accept(value)
          setOpening({
            attemptId: current,
            status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
          })
          sessionPhase.current = openPhase
        } else if (current === generation.current) {
          setOpening({
            attemptId: current,
            status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
          })
          sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
        }
      } catch (error) {
        if (
          current === generation.current &&
          toSafeManagedResourceFailure(error).code !==
            MANAGED_RESOURCE_FAILURE_CODES.Aborted
        ) {
          setOpening({
            attemptId: current,
            status: "failure",
            mode,
            failure: toSafeManagedResourceFailure(error),
          })
          sessionPhase.current = openPhase
          throw error
        } else if (current === generation.current) {
          setOpening({
            attemptId: current,
            status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
          })
        }
      } finally {
        if (
          current === generation.current &&
          sessionPhase.current === loadingPhase
        )
          sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
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
        getManagedResourceRefKey(currentRef) ===
          getManagedResourceRefKey(expectedRef)
      )
    },
    [resolveRef],
  )

  const openDetail = useCallback(
    (rowKey: string) => {
      if (
        !workspace ||
        !mapFacts ||
        sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle ||
        deleteState.requiresFreshRead
      )
        return Promise.resolve()
      let ref: ManagedResourceRef
      try {
        ref = resolveRowRef(rowKey)
      } catch (error) {
        setDetailFailure(toSafeManagedResourceFailure(error))
        return Promise.resolve()
      }
      retryOpeningRef.current = () => {
        void openDetail(rowKey)
      }
      return runSession(
        "view",
        MANAGED_RESOURCE_SESSION_PHASES.DetailLoading,
        MANAGED_RESOURCE_SESSION_PHASES.DetailOpen,
        (signal) => workspace.get(ref, { signal }),
        (value) => {
          setDetailFailure(null)
          setDetail(mapFacts(value))
        },
        () => isSameRowRef(rowKey, ref),
      ).catch(async (error) => {
        const failure = toSafeManagedResourceFailure(error)
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

  const openCreate = useCallback(() => {
    if (
      !workspace?.capabilities.canCreate ||
      sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle ||
      deleteState.requiresFreshRead
    )
      return Promise.resolve()
    const analyticsCompletion = startManagedResourceControllerAction(
      analytics,
      PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    activeEditorAnalytics.current = analyticsCompletion
    retryOpeningRef.current = () => {
      void openCreate()
    }
    return runSession(
      "create",
      MANAGED_RESOURCE_SESSION_PHASES.EditorLoading,
      MANAGED_RESOURCE_SESSION_PHASES.EditorOpen,
      (signal) => workspace.openCreateEditor({ signal }),
      (value) => {
        setEditorFeedback(null)
        setEditor(value)
        setEditorMode(MANAGED_RESOURCE_EDITOR_MODES.Create)
      },
    ).catch((error) => {
      if (activeEditorAnalytics.current === analyticsCompletion) {
        analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
        activeEditorAnalytics.current = undefined
      }
      setEditorFeedback({
        kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.OpenFailed,
        failure: toSafeManagedResourceFailure(error),
      })
    })
  }, [analytics, deleteState.requiresFreshRead, runSession, workspace])

  const openEdit = useCallback(
    (rowKey: string) => {
      if (
        !workspace?.capabilities.canUpdate ||
        sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.Idle ||
        deleteState.requiresFreshRead
      )
        return Promise.resolve()
      let ref: ManagedResourceRef
      try {
        ref = resolveRowRef(rowKey)
      } catch (error) {
        setEditorFeedback({
          kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.OpenFailed,
          failure: toSafeManagedResourceFailure(error),
        })
        return Promise.resolve()
      }
      const analyticsCompletion = startManagedResourceControllerAction(
        analytics,
        PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      activeEditorAnalytics.current = analyticsCompletion
      retryOpeningRef.current = () => {
        void openEdit(rowKey)
      }
      return runSession(
        "edit",
        MANAGED_RESOURCE_SESSION_PHASES.EditorLoading,
        MANAGED_RESOURCE_SESSION_PHASES.EditorOpen,
        (signal) =>
          readEditor
            ? readEditor(
                () => workspace.openEditEditor(ref, { signal }),
                signal,
              )
            : workspace.openEditEditor(ref, { signal }),
        (value) => {
          setEditorFeedback(null)
          setEditor(value)
          setEditorMode(MANAGED_RESOURCE_EDITOR_MODES.Edit)
        },
        () => isSameRowRef(rowKey, ref),
      )
        .then(() => {
          if (
            activeEditorAnalytics.current === analyticsCompletion &&
            sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.EditorOpen
          ) {
            analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
            activeEditorAnalytics.current = undefined
          }
        })
        .catch((error) => {
          if (activeEditorAnalytics.current === analyticsCompletion) {
            analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
              errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
            })
            activeEditorAnalytics.current = undefined
          }
          setEditorFeedback({
            kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.OpenFailed,
            failure: toSafeManagedResourceFailure(error),
          })
        })
    },
    [
      analytics,
      deleteState.requiresFreshRead,
      isSameRowRef,
      resolveRowRef,
      runSession,
      readEditor,
      workspace,
    ],
  )

  const submit = useCallback(
    (values: EditableResourceProjection) => {
      if (submitPromise.current) return submitPromise.current
      if (
        !editor ||
        sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.EditorOpen
      )
        return Promise.resolve(undefined)
      const validation = editor.validate(values)
      if (!validation.valid) {
        setEditorFeedback({
          kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveFailed,
          failure: {
            code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
            fieldIssues: validation.issues,
          },
        })
        return Promise.resolve(undefined)
      }
      if (!beginMutationSession(ACTIVE_MUTATION_SESSIONS.Submit))
        return Promise.resolve(undefined)
      sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Submit
      const current = generation.current
      const submittedMode = editorMode ?? MANAGED_RESOURCE_EDITOR_MODES.Edit
      const analyticsCompletion =
        activeEditorAnalytics.current ??
        startManagedResourceControllerAction(
          analytics,
          editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateManagedSiteChannel
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
          editorMode === MANAGED_RESOURCE_EDITOR_MODES.Create
            ? PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar
            : PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        )
      activeEditorAnalytics.current = undefined
      activeSubmitAnalytics.current = analyticsCompletion
      onMutationStart?.()
      const controller = new AbortController()
      activeAbort.current = controller
      setIsSaving(true)
      let closesEditor = false
      const secretCollection = collectManagedResourceSecrets(values)
      const submitEditor = () =>
        editor.submit(values, { signal: controller.signal })
      const promise = acceptManagedResourceSubmission(
        readEditor
          ? readEditor(submitEditor, controller.signal)
          : submitEditor(),
        {
          submittedMode,
          isCurrent: () => current === generation.current,
          closeEditor: () => {
            closesEditor = true
            setEditor(null)
            setEditorMode(null)
          },
          setEditorFeedback,
          requestFreshRead,
          requireFreshRead,
          acceptMutationResult,
          onMutationConfirmed,
          onMutationSuccess,
          analyticsCompletion,
          secretCollection,
        },
      ).finally(() => {
        if (current === generation.current) {
          setIsSaving(false)
          submitPromise.current = undefined
          if (activeSubmitAnalytics.current === analyticsCompletion)
            activeSubmitAnalytics.current = undefined
          endMutationSession(ACTIVE_MUTATION_SESSIONS.Submit)
          if (sessionPhase.current === MANAGED_RESOURCE_SESSION_PHASES.Submit)
            sessionPhase.current = closesEditor
              ? MANAGED_RESOURCE_SESSION_PHASES.Idle
              : MANAGED_RESOURCE_SESSION_PHASES.EditorOpen
        }
      })
      submitPromise.current = promise
      return promise
    },
    [
      analytics,
      acceptMutationResult,
      beginMutationSession,
      editor,
      readEditor,
      editorMode,
      endMutationSession,
      onMutationStart,
      onMutationSuccess,
      onMutationConfirmed,
      requestFreshRead,
      requireFreshRead,
    ],
  )

  const capabilities =
    workspace?.capabilities ?? EMPTY_MANAGED_RESOURCE_CAPABILITIES

  const closeDetail = useCallback(() => {
    if (
      sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.DetailLoading &&
      sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.DetailOpen
    )
      return
    setOpening({
      attemptId: generation.current + 1,
      status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
    })
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
    setDetail(null)
    setDetailFailure(null)
  }, [])

  const closeEditor = useCallback(() => {
    if (
      sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.EditorLoading &&
      sessionPhase.current !== MANAGED_RESOURCE_SESSION_PHASES.EditorOpen
    )
      return
    setOpening({
      attemptId: generation.current + 1,
      status: MANAGED_RESOURCE_SESSION_PHASES.Idle,
    })
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    sessionPhase.current = MANAGED_RESOURCE_SESSION_PHASES.Idle
    activeEditorAnalytics.current?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
    activeEditorAnalytics.current = undefined
    setEditor(null)
    setEditorMode(null)
    setEditorFeedback(null)
  }, [])

  const retryOpening = useCallback(() => {
    if (opening.status !== "failure") return
    if (opening.mode === "view") closeDetail()
    else closeEditor()
    retryOpeningRef.current?.()
  }, [opening, closeDetail, closeEditor])

  const editorFailure =
    editorFeedback && "failure" in editorFeedback
      ? editorFeedback.failure
      : null

  return {
    capabilities,
    opening,
    retryOpening,
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
    openBulkDelete,
  }
}
