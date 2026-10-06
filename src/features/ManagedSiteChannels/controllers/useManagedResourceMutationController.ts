import { useCallback, useEffect, useRef, useState } from "react"

import { type ChannelDialogOpeningState } from "~/components/dialogs/ChannelDialog/components/ChannelDialogOpening"
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
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations"
import { collectManagedResourceSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import {
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "../presentation/managedResourceFieldPolicy"
import { type ManagedResourceRowData } from "../presentation/managedResourcePresentation"
import {
  EMPTY_MANAGED_RESOURCE_CAPABILITIES,
  toSafeManagedResourceFailure,
} from "../utils/managedResource"
import {
  startManagedResourceControllerAction,
  type ManagedResourceAnalyticsCompletion,
} from "./managedResourceControllerAnalytics"
import {
  canAcceptMutationEffectsLocally,
  projectManagedResourceMutationFailure,
} from "./managedResourceMutationPolicy"
import {
  type ActiveMutationSession,
  type ManagedResourceEditorFeedback,
  type ManagedResourceMutationOptions,
  type ManagedResourceSessionPhase,
} from "./managedResourceMutationTypes"
import { useManagedResourceDeletionSession } from "./useManagedResourceDeletionSession"

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
    status: "idle",
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
  const sessionPhase = useRef<ManagedResourceSessionPhase>("idle")
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
    sessionPhase.current = "idle"
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
    setOpening({ attemptId: generation.current, status: "idle" })
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
          setOpening({ attemptId: current, status: "idle" })
          sessionPhase.current = openPhase
        } else if (current === generation.current) {
          setOpening({ attemptId: current, status: "idle" })
          sessionPhase.current = "idle"
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
          setOpening({ attemptId: current, status: "idle" })
        }
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
        sessionPhase.current !== "idle" ||
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
        "detail-loading",
        "detail-open",
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
      sessionPhase.current !== "idle" ||
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
      "editor-loading",
      "editor-open",
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
        kind: "open-failed",
        failure: toSafeManagedResourceFailure(error),
      })
    })
  }, [analytics, deleteState.requiresFreshRead, runSession, workspace])

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
        "editor-loading",
        "editor-open",
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
            sessionPhase.current !== "editor-open"
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
            kind: "open-failed",
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
      const promise = (
        readEditor
          ? readEditor(submitEditor, controller.signal)
          : submitEditor()
      )
        .then(async (mutationResult) => {
          if (current !== generation.current) return undefined
          assertManagedSiteMutationResult<
            ResourceDisplayFacts,
            ManagedSiteMutationConfirmedEffect
          >(mutationResult, {
            idempotent: submittedMode !== MANAGED_RESOURCE_EDITOR_MODES.Create,
          })
          switch (mutationResult.outcome) {
            case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded: {
              onMutationConfirmed?.(submittedMode)
              let mutationAccepted = false
              try {
                mutationAccepted =
                  mutationResult.data !== undefined &&
                  canAcceptMutationEffectsLocally(
                    submittedMode,
                    mutationResult.data.ref,
                    mutationResult.confirmedEffects,
                  ) &&
                  (acceptMutationResult?.(submittedMode, mutationResult.data) ??
                    false)
              } catch {
                mutationAccepted = false
              }
              const refreshAccepted =
                mutationAccepted || (await requestFreshRead())
              if (current !== generation.current) return undefined
              closesEditor = true
              setEditor(null)
              setEditorMode(null)
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
                  : {
                      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
                    },
              )
              if (refreshAccepted) onMutationSuccess?.(submittedMode)
              return refreshAccepted ? mutationResult.data : undefined
            }
            case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
              setEditorFeedback({
                kind: "save-failed",
                failure: projectManagedResourceMutationFailure(
                  mutationResult,
                  secretCollection,
                  MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected,
                ),
              })
              analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              })
              return undefined
            case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
            case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain: {
              closesEditor = true
              setEditor(null)
              setEditorMode(null)
              setEditorFeedback({
                kind: "save-uncertain",
                failure: projectManagedResourceMutationFailure(
                  mutationResult,
                  secretCollection,
                  MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
                ),
              })
              const refreshAccepted = await requestFreshRead()
              if (current !== generation.current) return undefined
              if (!refreshAccepted) requireFreshRead()
              analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
                errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              })
              return undefined
            }
          }
        })
        .catch((error: unknown) => {
          if (current !== generation.current) return undefined
          // Public managed errors include authoritative-read failures before update dispatch.
          if (!(error instanceof ManagedResourceError)) throw error
          setEditorFeedback({
            kind: "save-failed",
            failure: toSafeManagedResourceFailure(error),
          })
          analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
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
      sessionPhase.current !== "detail-loading" &&
      sessionPhase.current !== "detail-open"
    )
      return
    setOpening({ attemptId: generation.current + 1, status: "idle" })
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
    setOpening({ attemptId: generation.current + 1, status: "idle" })
    generation.current += 1
    activeAbort.current?.abort()
    activeAbort.current = undefined
    sessionPhase.current = "idle"
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
