import { useCallback } from "react"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  MutationAnalyticsMode,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  boundariesMatch,
  boundaryIdentity,
  completeKeyMutationAnalytics,
  keyManagementAnalyticsContext,
  toFailure,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceEditorStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyEditorSubmitResult,
  type AccountKeyResourceEditor,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

type SubmissionContext = {
  boundary: ActiveResourceBoundary
  resolveDestination: (
    editor: AccountKeyResourceEditor,
    values: EditableResourceProjection,
  ) => ActiveResourceBoundary
}

/** Shared validation, duplicate-write exclusion and stale-response handling, independent of lists and routes. */
export function useAccountKeyEditorSubmission({
  editorState,
  requests,
  resolveContext,
  requireFreshRead,
  onUncertain,
  onSubmitted,
  mutationAnalyticsMode,
}: {
  editorState: Pick<
    AccountKeyResourceEditorStateOwner,
    "captureSubmission" | "transitionEditor" | "completeSubmission"
  >
  requests: AccountKeyResourceRequestLifecycle
  resolveContext: () => SubmissionContext | null
  requireFreshRead: (boundary: ActiveResourceBoundary) => void
  onUncertain: (boundary: ActiveResourceBoundary) => Promise<unknown>
  onSubmitted: (
    result: AccountKeyEditorSubmitResult,
    boundary: ActiveResourceBoundary,
    mode: "create" | "edit",
  ) => Promise<void>
  mutationAnalyticsMode: MutationAnalyticsMode
}) {
  const { captureSubmission, transitionEditor, completeSubmission } =
    editorState
  return useCallback(
    async (editorId: number, values: EditableResourceProjection) => {
      const submission = captureSubmission()
      const nativeEditor = submission.nativeEditor
      const state = submission.state
      const context = resolveContext()
      if (
        !nativeEditor ||
        !state ||
        state.editorId !== editorId ||
        !submission.boundary ||
        !context ||
        !boundariesMatch(context.boundary, submission.boundary)
      )
        return
      const feedback = (error: Parameters<typeof toFailure>[0]) => {
        const failure = toFailure(error)
        transitionEditor((previous) =>
          previous?.editorId === editorId
            ? { ...previous, feedback: failure }
            : previous,
        )
        return failure
      }
      const validation = nativeEditor.validate(values)
      if (!validation.valid) {
        transitionEditor((previous) =>
          previous?.editorId === editorId
            ? {
                ...previous,
                feedback: {
                  code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
                  fieldIssues: validation.issues,
                },
              }
            : previous,
        )
        return
      }
      let boundary: ActiveResourceBoundary
      try {
        boundary = context.resolveDestination(nativeEditor, values)
      } catch (error) {
        feedback(error)
        return
      }
      const identity = boundaryIdentity(boundary)
      const existing = requests.getMutation(identity)
      if (existing) return existing.promise
      const version = requests.version()
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          state.mode === editorModes.Create
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccountToken
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccountToken,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      const controller = new AbortController()
      requests.assign(requestSlots.Action, controller)
      const run = (async () =>
        nativeEditor.submit(values, { signal: controller.signal }))()
        .then(async (result) => {
          if (version !== requests.version() || !submission.isCurrent()) {
            requireFreshRead(boundary)
          } else {
            completeSubmission(editorId, Boolean(result.createdSecret))
            await onSubmitted(result, boundary, state.mode)
          }
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Success,
            mutationAnalyticsMode,
            boundary.siteType,
          )
        })
        .catch(async (error: unknown) => {
          const failure = toFailure(error)
          const current =
            version === requests.version() && submission.isCurrent()
          if (current) feedback(error)
          if (
            failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
          ) {
            requireFreshRead(boundary)
            if (current) await onUncertain(boundary)
          }
          completeKeyMutationAnalytics(
            tracker,
            PRODUCT_ANALYTICS_RESULTS.Failure,
            mutationAnalyticsMode,
            boundary.siteType,
          )
        })
        .finally(() => {
          requests.releaseMutation(identity, run)
          requests.release(requestSlots.Action, controller)
        })
      requests.registerMutation(identity, { controller, promise: run })
      return run
    },
    [
      captureSubmission,
      transitionEditor,
      completeSubmission,
      resolveContext,
      requests,
      requireFreshRead,
      onUncertain,
      onSubmitted,
      mutationAnalyticsMode,
    ],
  )
}
