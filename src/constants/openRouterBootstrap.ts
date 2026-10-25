import { createAccountConnectionLabel } from "~/constants/accountConnectionLabel"

export const OPENROUTER_BOOTSTRAP_MUTATION_STATES = {
  NotDispatched: "not_dispatched",
  DispatchedUnconfirmed: "dispatched_unconfirmed",
  Created: "created",
} as const

export const OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES = {
  Known: "known",
  Unknown: "unknown",
} as const

export const OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES = {
  Success: "success",
  LoggedOut: "logged_out",
  PageChanged: "page_changed",
  InvalidOrigin: "invalid_origin",
  Timeout: "timeout",
  Failed: "failed",
  CancelledBeforeCreate: "cancelled_before_create",
  CancelledAfterCreate: "cancelled_after_create",
  ValidationFailed: "validation_failed",
} as const

/** OpenRouter shares the account-connection label format with every bootstrap. */
export const createOpenRouterBootstrapLabel = createAccountConnectionLabel

export const OPENROUTER_BOOTSTRAP_VALIDATION_TIMEOUT_MS = 15_000
export const OPENROUTER_BOOTSTRAP_CANCEL_TIMEOUT_MS = 5_000
export const OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS = 15_000
export const OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS = 5_000
export const OPENROUTER_MANAGEMENT_KEY_TRANSPORT_TIMEOUT_MS =
  OPENROUTER_MANAGEMENT_KEY_PAGE_TIMEOUT_MS +
  OPENROUTER_MANAGEMENT_KEY_TRANSPORT_MARGIN_MS

export type OpenRouterBootstrapMutationState =
  (typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES)[keyof typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES]
export type OpenRouterBootstrapAttemptOutcome =
  (typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES)[keyof typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES]
export type OpenRouterBootstrapCreatedMutationState =
  typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
export type OpenRouterBootstrapNotDispatchedMutationState =
  typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
export type OpenRouterBootstrapDispatchedUnconfirmedMutationState =
  typeof OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed
export type OpenRouterBootstrapSuccessAttemptOutcome =
  typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success
export type OpenRouterBootstrapCancelledAfterCreateAttemptOutcome =
  typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate
export type OpenRouterBootstrapValidationFailedAttemptOutcome =
  typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed
export type OpenRouterBootstrapCreatedAttemptOutcome =
  | OpenRouterBootstrapSuccessAttemptOutcome
  | OpenRouterBootstrapCancelledAfterCreateAttemptOutcome
export type OpenRouterBootstrapNotDispatchedAttemptOutcome = Exclude<
  OpenRouterBootstrapAttemptOutcome,
  | OpenRouterBootstrapCreatedAttemptOutcome
  | typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed
>
export type OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome =
  | typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout
  | typeof OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed
