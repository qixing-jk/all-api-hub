import type {
  OpenRouterBootstrapCancelledAfterCreateAttemptOutcome,
  OpenRouterBootstrapCreatedMutationState,
  OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome,
  OpenRouterBootstrapDispatchedUnconfirmedMutationState,
  OpenRouterBootstrapMutationState,
  OpenRouterBootstrapNotDispatchedAttemptOutcome,
  OpenRouterBootstrapNotDispatchedMutationState,
  OpenRouterBootstrapSuccessAttemptOutcome,
  OpenRouterBootstrapValidationFailedAttemptOutcome,
} from "~/constants/openRouterBootstrap"
import type { AutoDetectCompletionData } from "~/services/accounts/autoDetectCompletion/types"

export type OpenRouterClerkSessionIdentity = {
  userId: string
  username: string
}

export type OpenRouterProvisioningMetadata = {
  requestId: string
  label?: string
  mutationState: OpenRouterBootstrapMutationState
}

export type OpenRouterProvisioningOutcome =
  | {
      status: "completed"
      data: Omit<
        AutoDetectCompletionData,
        "siteType" | "fetchContext" | "autoDetectContext"
      >
      provisioning: OpenRouterProvisioningMetadata & {
        mutationState: OpenRouterBootstrapCreatedMutationState
      }
      attemptOutcome: OpenRouterBootstrapSuccessAttemptOutcome
    }
  | {
      status: "failed"
      requestId: string
      mutationState: OpenRouterBootstrapNotDispatchedMutationState
      attemptOutcome: OpenRouterBootstrapNotDispatchedAttemptOutcome
      data?: never
    }
  | {
      status: "recovery_required"
      reason: "mutation_unconfirmed"
      requestId: string
      provisioning: OpenRouterProvisioningMetadata & {
        mutationState: OpenRouterBootstrapDispatchedUnconfirmedMutationState
      }
      attemptOutcome: OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome
      data?: never
    }
  | {
      status: "recovery_required"
      reason: "post_create_validation_failed"
      requestId: string
      provisioning: OpenRouterProvisioningMetadata & {
        mutationState: OpenRouterBootstrapCreatedMutationState
      }
      createdCredential: { accessToken: string }
      attemptOutcome: OpenRouterBootstrapValidationFailedAttemptOutcome
      data?: never
    }
  | {
      status: "recovery_required"
      reason: "cancelled_after_create"
      requestId: string
      provisioning: OpenRouterProvisioningMetadata & {
        mutationState: OpenRouterBootstrapCreatedMutationState
      }
      createdCredential: { accessToken: string }
      attemptOutcome: OpenRouterBootstrapCancelledAfterCreateAttemptOutcome
      data?: never
    }

export type OpenRouterAccountOnboardingResult =
  | {
      kind: "bootstrap_completed"
      success: true
      message: string
      data: AutoDetectCompletionData
      provisioning: OpenRouterProvisioningMetadata & {
        mutationState: OpenRouterBootstrapCreatedMutationState
      }
      attemptOutcome: OpenRouterBootstrapSuccessAttemptOutcome
      autoDetectContext?: never
      detailedError?: never
      autoDetectFailureReason?: never
    }
  | (Extract<OpenRouterProvisioningOutcome, { status: "recovery_required" }> & {
      kind: "bootstrap_recovery"
      success: false
      message: string
      autoDetectContext?: never
      detailedError?: never
      autoDetectFailureReason?: never
    })
  | {
      kind: "bootstrap_failure"
      success: false
      message: string
      requestId: string
      mutationState: OpenRouterBootstrapNotDispatchedMutationState
      attemptOutcome: OpenRouterBootstrapNotDispatchedAttemptOutcome
      data?: never
      autoDetectContext?: never
      detailedError?: never
      autoDetectFailureReason?: never
    }
