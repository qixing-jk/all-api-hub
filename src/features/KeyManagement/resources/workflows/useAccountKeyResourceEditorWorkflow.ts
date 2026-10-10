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
  isAborted,
  resolveCreateDestinationBoundary,
  toFailure,
  USER_KEY_MANAGEMENT_EXECUTION,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceEditorStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorState"
import type { AccountKeyResourceInventoryStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import toast from "~/lib/notify"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
  type AccountKeyResourceRef,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { createLogger } from "~/utils/core/logger"

import { useAccountKeyEditorSubmission } from "./useAccountKeyEditorSubmission"

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
    readNativeOwner,
    acceptActionContext,
    adoptCreationSession,
    acceptEditedResource,
    scopes,
  } = inventoryState
  const {
    readEditor,
    beginOpening,
    isOpeningCurrent,
    acceptOpening,
    readRetryRequest,
    cancelOpening,
    close,
    settleTerminalClose,
    transitionEditor,
    transitionEditorOpening,
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
          : readNativeOwner().boundary
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
      const session = readNativeOwner().session
      const collection = readNativeOwner().collection
      if (
        (editorMode === editorModes.Create && !session) ||
        (editorMode === editorModes.Edit &&
          mode === controllerModes.Single &&
          !collection)
      )
        return
      const attemptId = beginOpening(
        { mode: editorMode, ref },
        () => requests.cancel(requestSlots.Action),
        retryAttemptId,
      )
      if (attemptId === null) return
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
          acceptActionContext(actionContext)
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
          adoptCreationSession(creationSession)
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
          !isOpeningCurrent(attemptId) ||
          !boundariesMatch(readNativeOwner().boundary ?? boundary, boundary)
        )
          return
        acceptOpening(attemptId, nativeEditor, boundary, editorMode)
      } catch (error) {
        const failure = toFailure(error)
        if (
          current !== requests.version() ||
          isAborted(failure) ||
          !isOpeningCurrent(attemptId)
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
      beginOpening,
      isOpeningCurrent,
      acceptOpening,
      isAcceptedResourceRef,
      isCurrentResourceRef,
      isFreshReadRequiredForBoundary,
      mode,
      openSession,
      resolveResourceActionContext,
      acceptActionContext,
      adoptCreationSession,
      transitionEditorOpening,
      readNativeOwner,
      createdSecretRef,
      requests,
      accountsRef,
      creationIntentRef,
    ],
  )

  const retryEditorOpening = useCallback(
    (attemptId: number) => {
      const request = readRetryRequest(attemptId)
      if (!request) return
      void openEditor(request.mode, request.ref, attemptId)
    },
    [openEditor, readRetryRequest],
  )

  const cancelEditorOpening = useCallback(
    (attemptId: number) => {
      cancelOpening(attemptId, () => {
        requests.cancel(requestSlots.Action)
        requests.release(requestSlots.Action)
      })
    },
    [cancelOpening, requests],
  )

  const closeEditor = useCallback(
    (editorId: number) => {
      if (readEditor()?.editorId !== editorId) return
      requests.cancel(requestSlots.Action)
      close(editorId)
    },
    [readEditor, close, requests],
  )

  const setEditorValues = useCallback(
    (editorId: number, values: EditableResourceProjection) => {
      transitionEditor((current) =>
        current?.editorId === editorId ? { ...current, values } : current,
      )
    },
    [transitionEditor],
  )

  const submitEditor = useAccountKeyEditorSubmission({
    editorState,
    requests,
    mutationAnalyticsMode,
    requireFreshRead,
    onUncertain: refreshAfterMutation,
    resolveContext: () => {
      const boundary = readNativeOwner().boundary
      const state = readEditor()
      if (
        !boundary ||
        mode === controllerModes.Idle ||
        (state?.mode === editorModes.Create &&
          mode !== controllerModes.Single) ||
        createdSecretRef.current ||
        requests.isInventoryLoading() ||
        isFreshReadRequiredForBoundary(boundary)
      )
        return null
      return {
        boundary,
        resolveDestination: (nativeEditor, values) =>
          state?.mode === editorModes.Create
            ? resolveCreateDestinationBoundary(
                nativeEditor,
                values,
                boundary,
                scopes,
              )
            : boundary,
      }
    },
    onSubmitted: async (result, intendedBoundary, submitMode) => {
      const returnedFacts = result.facts
      const returnedScope = scopes.find(
        (scope) => scope.scopeKey === returnedFacts?.ref.scopeKey,
      )
      const returnedBoundary =
        returnedScope &&
        returnedFacts &&
        returnedFacts.ref.accountId === intendedBoundary.accountId &&
        returnedFacts.ref.siteType === intendedBoundary.siteType
          ? { ...returnedFacts.ref, routeKey: returnedScope.routeKey }
          : intendedBoundary
      if (submitMode === editorModes.Edit && returnedFacts)
        acceptEditedResource(returnedFacts)
      if (result.createdSecret) transitionCreatedSecret(result.createdSecret)
      else if (submitMode === editorModes.Edit) {
        toast.success(
          returnedFacts?.displayName
            ? t("keyManagement:messages.keyUpdated", {
                name: returnedFacts.displayName,
              })
            : t("keyManagement:messages.keyUpdatedSimple"),
        )
      }
      const account = accountsRef.current.find(
        (candidate) => candidate.id === intendedBoundary.accountId,
      )
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
    },
  })
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
