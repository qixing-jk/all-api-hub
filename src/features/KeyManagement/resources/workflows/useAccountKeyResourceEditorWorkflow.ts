import type { TFunction } from "i18next"
import { useCallback } from "react"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  EditorMode,
  MutationAnalyticsMode,
  OpenResourceSession,
  RefreshAfterMutation,
  ResolveResourceActionContext,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  awaitAbortable,
  boundariesMatch,
  boundaryFromResourceRef,
  boundaryIdentity,
  completeKeyMutationAnalytics,
  isAborted,
  keyManagementAnalyticsContext,
  refIdentity,
  resolveCreateDestinationBoundary,
  toFailure,
  USER_KEY_MANAGEMENT_EXECUTION,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceEditorStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorState"
import type { AccountKeyResourceInventoryStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import { NATIVE_RESOURCE_EDITOR_LOADING_REVEALS } from "~/features/ResourceEditor/opening/nativeResourceEditorOpeningState"
import toast from "~/lib/notify"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
  type AccountKeyResourceRef,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createLogger } from "~/utils/core/logger"

type WorkflowInputs = {
  state: {
    mode: ControllerMode
    mutationAnalyticsMode: MutationAnalyticsMode
    t: TFunction<"translation", undefined>
  }
  actions: {
    isFreshReadRequiredForBoundary: (
      boundary: ActiveResourceBoundary,
    ) => boolean
    isAcceptedResourceRef: (ref: AccountKeyResourceRef) => boolean
    isCurrentResourceRef: (ref: AccountKeyResourceRef) => boolean
    resolveResourceActionContext: ResolveResourceActionContext
    openSession: OpenResourceSession
    requireFreshRead: (boundary: ActiveResourceBoundary) => void
    refreshAfterMutation: RefreshAfterMutation
  }
  requests: AccountKeyResourceRequestLifecycle
  inventoryState: AccountKeyResourceInventoryStateOwner
  editorState: AccountKeyResourceEditorStateOwner
  routing: AccountKeyResourceRouteStateOwner
}

/** Owns editor commands while the controller coordinates shared lifecycle boundaries. */
export function useAccountKeyResourceEditorWorkflow({
  state: { mode, mutationAnalyticsMode, t },
  actions: {
    isFreshReadRequiredForBoundary,
    isAcceptedResourceRef,
    isCurrentResourceRef,
    resolveResourceActionContext,
    openSession,
    requireFreshRead,
    refreshAfterMutation,
  },
  requests,
  inventoryState,
  editorState,
  routing,
}: WorkflowInputs) {
  const {
    createdSecretRef,
    accountsRef,
    creationIntentRef,
    onCreatedRef,
    nextTransitionId,
    transitionCreatedSecret,
  } = routing

  const {
    activeResourceBoundaryRef,
    sessionRef,
    collectionRef,
    acceptedRowsRef,
    scopes,
    replaceAcceptedRows,
  } = inventoryState
  const {
    setFocusWorkflowId,
    editorOpeningRef,
    editorRef,
    editorBoundaryRef,
    editorWorkflowSequence,
    editorOpeningAttemptId,
    editorOpeningRequestRef,
    editorInstanceId,
    editorStateRef,
    terminalCloseEditorRef,
    editorGeneration,
    abortEditorFieldLoads,
    transitionEditor,
    transitionEditorOpening,
    transitionTerminalCloseEditor,
  } = editorState

  const openEditor = useCallback(
    async (
      editorMode: EditorMode,
      ref?: AccountKeyResourceRef,
      retryAttemptId?: number,
    ) => {
      const boundary =
        editorMode === editorModes.Edit && mode === controllerModes.All && ref
          ? boundaryFromResourceRef(ref)
          : activeResourceBoundaryRef.current
      if (
        mode === controllerModes.Idle ||
        (editorMode === editorModes.Create &&
          mode !== controllerModes.Single) ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        !boundary ||
        isFreshReadRequiredForBoundary(boundary) ||
        (editorMode === editorModes.Edit &&
          (!ref ||
            (mode === controllerModes.All
              ? !isAcceptedResourceRef(ref)
              : !isCurrentResourceRef(ref))))
      )
        return
      const session = sessionRef.current
      const collection = collectionRef.current
      if (
        (editorMode === editorModes.Create && !session) ||
        (editorMode === editorModes.Edit &&
          mode === controllerModes.Single &&
          !collection)
      )
        return
      const previousOpening = editorOpeningRef.current
      if (
        retryAttemptId !== undefined
          ? previousOpening.status !== "failure" ||
            previousOpening.attemptId !== retryAttemptId
          : previousOpening.status === "loading"
      )
        return
      // A replacement editor is a new session even while its provider open is
      // pending, so no callback from the prior session may update it.
      abortEditorFieldLoads()
      requests.cancel(requestSlots.Action)
      editorRef.current = null
      editorBoundaryRef.current = null
      transitionEditor(() => null)
      if (retryAttemptId === undefined) {
        setFocusWorkflowId(
          `account-key-resource-editor-${++editorWorkflowSequence.current}`,
        )
      }
      const attemptId = ++editorOpeningAttemptId.current
      editorOpeningRequestRef.current = { mode: editorMode, ref, boundary }
      transitionEditorOpening({
        attemptId,
        status: "loading",
        mode: editorMode,
        reveal:
          retryAttemptId === undefined
            ? NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Delayed
            : NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Immediate,
      })
      const controller = new AbortController()
      requests.assign(requestSlots.Action, controller)
      const current = requests.version()
      try {
        const actionContext =
          editorMode === editorModes.Edit
            ? await resolveResourceActionContext(ref!, controller)
            : null
        let nativeEditor: AccountKeyResourceEditor
        if (editorMode === editorModes.Edit) {
          if (!actionContext) {
            throw new AccountKeyResourceError({
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
            })
          }
          sessionRef.current = actionContext.session
          collectionRef.current = actionContext.collection
          activeResourceBoundaryRef.current = actionContext.boundary
          nativeEditor = await awaitAbortable(
            actionContext.collection.openEditEditor(ref!, {
              signal: controller.signal,
            }),
            controller.signal,
          )
        } else {
          const account = accountsRef.current.find(
            (candidate) => candidate.id === boundary.accountId,
          )
          const creationSession = account
            ? await openSession(
                account,
                controller.signal,
                USER_KEY_MANAGEMENT_EXECUTION,
              )
            : null
          if (!creationSession) {
            throw new AccountKeyResourceError({
              code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
            })
          }
          sessionRef.current = creationSession
          nativeEditor = await awaitAbortable(
            creationSession.openCreateEditor(
              boundary.scopeKey,
              {
                signal: controller.signal,
              },
              creationIntentRef.current,
            ),
            controller.signal,
          )
        }
        if (
          current !== requests.version() ||
          editorOpeningRef.current.status !== "loading" ||
          editorOpeningRef.current.attemptId !== attemptId ||
          !boundariesMatch(
            activeResourceBoundaryRef.current ?? boundary,
            boundary,
          )
        )
          return
        editorRef.current = nativeEditor
        editorBoundaryRef.current = boundary
        transitionEditor(() => ({
          editorId: ++editorInstanceId.current,
          siteType: boundary.siteType,
          mode: editorMode,
          fields: nativeEditor.fields,
          initialValues: nativeEditor.initialValues,
          values: nativeEditor.initialValues,
          optionsByField: {},
          optionFailuresByField: {},
          loadingFieldIds: [],
          feedback: null,
        }))
        editorOpeningRequestRef.current = null
        transitionEditorOpening({ attemptId, status: "idle" })
      } catch (error) {
        const failure = toFailure(error)
        if (
          current !== requests.version() ||
          isAborted(failure) ||
          editorOpeningRef.current.status !== "loading" ||
          editorOpeningRef.current.attemptId !== attemptId
        )
          return
        transitionEditorOpening({
          attemptId,
          status: "failure",
          mode: editorMode,
          failure,
        })
      }
    },
    [
      setFocusWorkflowId,
      abortEditorFieldLoads,
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      openSession,
      resolveResourceActionContext,
      transitionEditor,
      transitionEditorOpening,
      activeResourceBoundaryRef,
      createdSecretRef,
      requests,
      sessionRef,
      collectionRef,
      editorOpeningRef,
      editorRef,
      editorBoundaryRef,
      editorWorkflowSequence,
      editorOpeningAttemptId,
      editorOpeningRequestRef,
      accountsRef,
      creationIntentRef,
      editorInstanceId,
    ],
  )

  const retryEditorOpening = useCallback(
    (attemptId: number) => {
      const opening = editorOpeningRef.current
      const request = editorOpeningRequestRef.current
      if (
        opening.status !== "failure" ||
        opening.attemptId !== attemptId ||
        !request
      )
        return
      void openEditor(request.mode, request.ref, attemptId)
    },
    [openEditor, editorOpeningRef, editorOpeningRequestRef],
  )

  const cancelEditorOpening = useCallback(
    (attemptId: number) => {
      const opening = editorOpeningRef.current
      if (
        opening.attemptId !== attemptId ||
        (opening.status !== "loading" && opening.status !== "failure")
      )
        return
      // Advance the generation before aborting so a provider that ignores its
      // signal cannot publish a late editor after the launch was dismissed.
      const nextAttemptId = ++editorOpeningAttemptId.current
      requests.cancel(requestSlots.Action)
      requests.release(requestSlots.Action)
      editorOpeningRequestRef.current = null
      transitionEditorOpening({ attemptId: nextAttemptId, status: "idle" })
      setFocusWorkflowId(null)
    },
    [
      transitionEditorOpening,
      editorOpeningRef,
      editorOpeningAttemptId,
      requests,
      editorOpeningRequestRef,
      setFocusWorkflowId,
    ],
  )

  const closeEditor = useCallback(
    (editorId: number) => {
      const currentEditor = editorStateRef.current
      if (currentEditor?.editorId !== editorId) return
      requests.cancel(requestSlots.Action)
      abortEditorFieldLoads()
      editorRef.current = null
      editorBoundaryRef.current = null
      editorOpeningRequestRef.current = null
      transitionEditorOpening({
        attemptId: editorOpeningAttemptId.current,
        status: "idle",
      })
      transitionEditor(() => null)
      if (!currentEditor.terminalRetainsFocusWorkflow) setFocusWorkflowId(null)
    },
    [
      setFocusWorkflowId,
      abortEditorFieldLoads,
      transitionEditor,
      transitionEditorOpening,
      editorStateRef,
      requests,
      editorRef,
      editorBoundaryRef,
      editorOpeningRequestRef,
      editorOpeningAttemptId,
    ],
  )

  const settleTerminalClose = useCallback(
    (editorId: number) => {
      if (terminalCloseEditorRef.current?.editorId !== editorId) return
      transitionTerminalCloseEditor(null)
    },
    [transitionTerminalCloseEditor, terminalCloseEditorRef],
  )

  const setEditorValues = useCallback(
    (editorId: number, values: EditableResourceProjection) => {
      transitionEditor((current) =>
        current?.editorId === editorId ? { ...current, values } : current,
      )
    },
    [transitionEditor],
  )

  const submitEditor = useCallback(
    async (editorId: number, values: EditableResourceProjection) => {
      const nativeEditor = editorRef.current
      const currentEditorState = editorStateRef.current
      const activeBoundary = activeResourceBoundaryRef.current
      const editorBoundary = editorBoundaryRef.current
      const editorVersion = editorGeneration.current
      if (
        mode === controllerModes.Idle ||
        (currentEditorState?.mode === editorModes.Create &&
          mode !== controllerModes.Single) ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        !nativeEditor ||
        !currentEditorState ||
        currentEditorState.editorId !== editorId ||
        !activeBoundary ||
        !editorBoundary ||
        !boundariesMatch(activeBoundary, editorBoundary) ||
        isFreshReadRequiredForBoundary(editorBoundary)
      )
        return
      const validation = nativeEditor.validate(values)
      if (!validation.valid) {
        transitionEditor((current) =>
          current && current.editorId === editorId
            ? {
                ...current,
                feedback: {
                  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
                  fieldIssues: validation.issues,
                },
              }
            : current,
        )
        return
      }
      const current = requests.version()
      const submitMode = currentEditorState.mode
      let intendedBoundary: ActiveResourceBoundary
      try {
        intendedBoundary =
          submitMode === editorModes.Create
            ? resolveCreateDestinationBoundary(
                nativeEditor,
                values,
                editorBoundary,
                scopes,
              )
            : editorBoundary
      } catch (error) {
        const failure = toFailure(error)
        transitionEditor((previous) =>
          previous && previous.editorId === editorId
            ? { ...previous, feedback: failure }
            : previous,
        )
        return
      }
      const mutationIdentity = boundaryIdentity(intendedBoundary)
      const existingMutation = requests.getMutation(mutationIdentity)
      if (existingMutation) return existingMutation.promise
      const account = accountsRef.current.find(
        (candidate) => candidate.id === editorBoundary.accountId,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          submitMode === editorModes.Create
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      const controller = new AbortController()
      requests.assign(requestSlots.Action, controller)
      const run = nativeEditor
        .submit(values, { signal: controller.signal })
        .then(async (result) => {
          if (
            current !== requests.version() ||
            editorGeneration.current !== editorVersion ||
            editorStateRef.current?.editorId !== editorId
          ) {
            requireFreshRead(intendedBoundary)
            completeKeyMutationAnalytics(
              tracker,
              PRODUCT_ANALYTICS_RESULTS.Success,
              mutationAnalyticsMode,
              account?.siteType,
            )
            return
          }
          const returnedFacts = result.facts
          const returnedScope = scopes.find(
            (scope) => scope.scopeKey === returnedFacts?.ref.scopeKey,
          )
          const returnedBoundary =
            returnedScope &&
            returnedFacts &&
            returnedFacts.ref.accountId === editorBoundary.accountId &&
            returnedFacts.ref.siteType === editorBoundary.siteType
              ? {
                  accountId: returnedFacts.ref.accountId,
                  siteType: returnedFacts.ref.siteType,
                  scopeKey: returnedScope.scopeKey,
                  routeKey: returnedScope.routeKey,
                }
              : intendedBoundary
          if (submitMode === editorModes.Edit && returnedFacts) {
            replaceAcceptedRows(
              acceptedRowsRef.current.map((facts) =>
                refIdentity(facts.ref) === refIdentity(returnedFacts.ref)
                  ? returnedFacts
                  : facts,
              ),
            )
          }
          if (result.createdSecret) {
            transitionCreatedSecret(result.createdSecret)
          } else if (submitMode === editorModes.Edit) {
            const updatedName = returnedFacts?.displayName
            toast.success(
              updatedName
                ? t("keyManagement:messages.keyUpdated", {
                    name: updatedName,
                  })
                : t("keyManagement:messages.keyUpdatedSimple"),
            )
          }
          const activeEditor = editorStateRef.current
          if (activeEditor?.editorId === editorId) {
            transitionTerminalCloseEditor({
              ...activeEditor,
              terminalClose: true,
              terminalRetainsFocusWorkflow: Boolean(result.createdSecret),
            })
          }
          editorRef.current = null
          editorBoundaryRef.current = null
          transitionEditor(() => null)
          if (
            submitMode === editorModes.Create &&
            account &&
            onCreatedRef.current
          ) {
            try {
              await onCreatedRef.current(account, {
                ...result,
                ref: result.facts?.ref ?? null,
              })
            } catch (error) {
              createLogger("AccountKeyResourceController").error(
                "Created key handoff failed",
                error,
              )
            }
          }
          const accepted = await refreshAfterMutation(
            returnedBoundary,
            result.createdSecret ? nextTransitionId() : undefined,
          )
          if (!accepted) requireFreshRead(returnedBoundary)
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Success,
            mutationAnalyticsMode,
            account?.siteType,
          )
        })
        .catch(async (error: unknown) => {
          const failure = toFailure(error)
          if (
            current !== requests.version() ||
            editorGeneration.current !== editorVersion ||
            editorStateRef.current?.editorId !== editorId
          ) {
            if (
              failure.code ===
              ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
            )
              requireFreshRead(intendedBoundary)
            completeKeyMutationAnalytics(
              tracker,
              PRODUCT_ANALYTICS_RESULTS.Failure,
              mutationAnalyticsMode,
              account?.siteType,
            )
            return
          }
          transitionEditor((previous) =>
            previous && previous.editorId === editorId
              ? { ...previous, feedback: failure }
              : previous,
          )
          if (
            failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          ) {
            requireFreshRead(intendedBoundary)
            await refreshAfterMutation(intendedBoundary)
          }
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Failure,
            mutationAnalyticsMode,
            account?.siteType,
          )
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
      isFreshReadRequiredForBoundary,
      mode,
      mutationAnalyticsMode,
      replaceAcceptedRows,
      refreshAfterMutation,
      requireFreshRead,
      scopes,
      t,
      transitionCreatedSecret,
      transitionEditor,
      transitionTerminalCloseEditor,
      editorRef,
      editorStateRef,
      activeResourceBoundaryRef,
      editorBoundaryRef,
      editorGeneration,
      createdSecretRef,
      requests,
      accountsRef,
      acceptedRowsRef,
      onCreatedRef,
      nextTransitionId,
    ],
  )
  return {
    openEditor,
    retryEditorOpening,
    cancelEditorOpening,
    closeEditor,
    settleTerminalClose,
    setEditorValues,
    submitEditor,
  }
}
