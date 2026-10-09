import {
  MANAGED_RESOURCE_EDITOR_MODES,
  type ManagedResourceEditorMode,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import {
  canAcceptMutationEffectsLocally,
  projectManagedResourceMutationFailure,
} from "~/features/ManagedSiteChannels/editor/managedResourceMutationPolicy"
import {
  MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS,
  type ManagedResourceEditorFeedback,
  type ManagedResourceMutationOptions,
} from "~/features/ManagedSiteChannels/editor/managedResourceMutationTypes"
import { toSafeManagedResourceFailure } from "~/features/ManagedSiteChannels/utils/managedResource"
import { type ManagedResourceAnalyticsCompletion } from "~/features/ManagedSiteChannels/workspace/managedResourceControllerAnalytics"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceDisplayFacts,
  type ResourceEditor,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  assertManagedSiteMutationResult,
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationConfirmedEffect,
} from "~/services/managedSites/mutations/contracts"
import { type collectManagedResourceSecrets } from "~/services/managedSites/utils/resourceSecrets"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"

type SubmissionAcceptanceOptions = Pick<
  ManagedResourceMutationOptions,
  "acceptMutationResult" | "onMutationConfirmed" | "onMutationSuccess"
> & {
  submittedMode: ManagedResourceEditorMode
  isCurrent: () => boolean
  closeEditor: () => void
  setEditorFeedback: (feedback: ManagedResourceEditorFeedback | null) => void
  requestFreshRead: () => Promise<boolean>
  requireFreshRead: () => void
  analyticsCompletion: ManagedResourceAnalyticsCompletion | undefined
  secretCollection: ReturnType<typeof collectManagedResourceSecrets>
}

/** Accepts mutation certainty, reconciles authoritative state, and publishes recovery feedback. */
export function acceptManagedResourceSubmission(
  submission: ReturnType<ResourceEditor["submit"]>,
  {
    submittedMode,
    isCurrent,
    closeEditor,
    setEditorFeedback,
    requestFreshRead,
    requireFreshRead,
    acceptMutationResult,
    onMutationConfirmed,
    onMutationSuccess,
    analyticsCompletion,
    secretCollection,
  }: SubmissionAcceptanceOptions,
) {
  return submission
    .then(async (mutationResult) => {
      if (!isCurrent()) return undefined
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
          const refreshAccepted = mutationAccepted || (await requestFreshRead())
          if (!isCurrent()) return undefined
          closeEditor()
          setEditorFeedback(
            refreshAccepted
              ? null
              : {
                  kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SavedRefreshFailed,
                },
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
            kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveFailed,
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
          closeEditor()
          setEditorFeedback({
            kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveUncertain,
            failure: projectManagedResourceMutationFailure(
              mutationResult,
              secretCollection,
              MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
            ),
          })
          const refreshAccepted = await requestFreshRead()
          if (!isCurrent()) return undefined
          if (!refreshAccepted) requireFreshRead()
          analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          })
          return undefined
        }
      }
    })
    .catch((error: unknown) => {
      if (!isCurrent()) return undefined
      // Public managed errors include authoritative-read failures before update dispatch.
      if (!(error instanceof ManagedResourceError)) throw error
      setEditorFeedback({
        kind: MANAGED_RESOURCE_EDITOR_FEEDBACK_KINDS.SaveFailed,
        failure: toSafeManagedResourceFailure(error),
      })
      analyticsCompletion?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      return undefined
    })
}
