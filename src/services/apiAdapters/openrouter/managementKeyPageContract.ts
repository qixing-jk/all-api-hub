import type {
  OpenRouterBootstrapCreatedAttemptOutcome,
  OpenRouterBootstrapCreatedMutationState,
  OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome,
  OpenRouterBootstrapDispatchedUnconfirmedMutationState,
  OpenRouterBootstrapNotDispatchedAttemptOutcome,
  OpenRouterBootstrapNotDispatchedMutationState,
} from "~/constants/openRouterBootstrap"
import {
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
} from "~/constants/openRouterBootstrap"
import { OPENROUTER_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

import { normalizeOpenRouterManagementKeySecret } from "./managementKeySecret"
import type { OpenRouterClerkSessionIdentity } from "./types"

export const OPENROUTER_MANAGEMENT_KEYS_ORIGIN = OPENROUTER_WEB_ORIGIN
export const OPENROUTER_MANAGEMENT_KEYS_PATH = "/settings/management-keys"
export const OPENROUTER_MANAGEMENT_KEYS_URL = `${OPENROUTER_MANAGEMENT_KEYS_ORIGIN}${OPENROUTER_MANAGEMENT_KEYS_PATH}`
export const OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH = 96

export type OpenRouterManagementKeyOperation = {
  kind: "create"
  label: string
}

export type TempWindowOpenRouterManagementKeyActionParams = {
  requestId: string
  operation: OpenRouterManagementKeyOperation
  tempWindowRequestSource?: TempWindowRequestSource
  suppressMinimize?: boolean
}

export type TempWindowOpenRouterManagementKeyActionResult =
  | {
      requestId: string
      operation: "create"
      mutationState: OpenRouterBootstrapCreatedMutationState
      attemptOutcome: OpenRouterBootstrapCreatedAttemptOutcome
      accessToken: string
      label: string
      sessionIdentity?: OpenRouterClerkSessionIdentity
    }
  | {
      requestId: string
      operation: "create"
      mutationState: OpenRouterBootstrapNotDispatchedMutationState
      label: string
      attemptOutcome: OpenRouterBootstrapNotDispatchedAttemptOutcome
    }
  | {
      requestId: string
      operation: "create"
      mutationState: OpenRouterBootstrapDispatchedUnconfirmedMutationState
      label: string
      attemptOutcome: OpenRouterBootstrapDispatchedUnconfirmedAttemptOutcome
    }

export type TempWindowOpenRouterManagementKeyCancelResult =
  | {
      requestId: string
      certainty: "known"
      cancellationAccepted: boolean
      mutationState: OpenRouterBootstrapNotDispatchedMutationState
      label?: never
    }
  | {
      requestId: string
      certainty: "known"
      cancellationAccepted: boolean
      mutationState:
        | OpenRouterBootstrapDispatchedUnconfirmedMutationState
        | OpenRouterBootstrapCreatedMutationState
      label?: string
    }
  | {
      requestId: string
      certainty: "unknown"
      cancellationAccepted?: boolean
    }

const CLERK_SESSION_IDENTITY_FIELD_MAX_LENGTH = 256

/** Checks for a plain protocol payload object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Reconstructs only valid page-action evidence for the requested creation. */
export function normalizeOpenRouterManagementKeyActionResult(
  request: TempWindowOpenRouterManagementKeyActionParams,
  value: unknown,
): TempWindowOpenRouterManagementKeyActionResult {
  const unconfirmedResult = {
    requestId: request.requestId,
    operation: "create",
    mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
    attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
    label: request.operation.label,
  } as const
  if (
    !isRecord(value) ||
    value.requestId !== request.requestId ||
    value.operation !== "create" ||
    value.label !== request.operation.label
  ) {
    return unconfirmedResult
  }

  if (value.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created) {
    const accessToken = normalizeOpenRouterManagementKeySecret(
      value.accessToken,
    )
    if (
      (value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success &&
        value.attemptOutcome !==
          OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate) ||
      !accessToken
    ) {
      return unconfirmedResult
    }
    const sessionIdentity = isOpenRouterClerkSessionIdentity(
      value.sessionIdentity,
    )
      ? value.sessionIdentity
      : undefined
    return {
      requestId: request.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created,
      attemptOutcome: value.attemptOutcome,
      accessToken,
      label: request.operation.label,
      ...(sessionIdentity ? { sessionIdentity } : {}),
    }
  }

  if (
    value.mutationState ===
    OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed
  ) {
    if (
      value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout &&
      value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed
    ) {
      return unconfirmedResult
    }
    return {
      requestId: request.requestId,
      operation: "create",
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
      attemptOutcome: value.attemptOutcome,
      label: request.operation.label,
    }
  }

  if (
    value.mutationState !==
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched ||
    (value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut &&
      value.attemptOutcome !==
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged &&
      value.attemptOutcome !==
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin &&
      value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout &&
      value.attemptOutcome !== OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed &&
      value.attemptOutcome !==
        OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate)
  ) {
    return unconfirmedResult
  }
  return {
    requestId: request.requestId,
    operation: "create",
    mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    attemptOutcome: value.attemptOutcome,
    label: request.operation.label,
  }
}

/** Reconstructs only valid cancellation evidence for the requested action. */
export function normalizeOpenRouterManagementKeyCancelResult(
  requestId: string,
  value: unknown,
): TempWindowOpenRouterManagementKeyCancelResult {
  const unknownResult = {
    requestId,
    certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown,
  } as const
  if (!isRecord(value) || value.requestId !== requestId) return unknownResult

  if (
    value.certainty === OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Unknown
  ) {
    return typeof value.cancellationAccepted === "boolean"
      ? { ...unknownResult, cancellationAccepted: value.cancellationAccepted }
      : unknownResult
  }

  if (
    value.certainty !== OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known ||
    typeof value.cancellationAccepted !== "boolean"
  ) {
    return unknownResult
  }

  if (
    value.mutationState === OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
  ) {
    if ("label" in value) return unknownResult
    return {
      requestId,
      certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
      cancellationAccepted: value.cancellationAccepted,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched,
    }
  }

  if (
    value.mutationState !==
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed &&
    value.mutationState !== OPENROUTER_BOOTSTRAP_MUTATION_STATES.Created
  ) {
    return unknownResult
  }
  if (
    "label" in value &&
    (typeof value.label !== "string" ||
      !value.label.trim() ||
      value.label.length > OPENROUTER_MANAGEMENT_KEY_LABEL_MAX_LENGTH)
  ) {
    return unknownResult
  }

  return {
    requestId,
    certainty: OPENROUTER_BOOTSTRAP_CANCELLATION_CERTAINTIES.Known,
    cancellationAccepted: value.cancellationAccepted,
    mutationState: value.mutationState,
    ...(typeof value.label === "string" ? { label: value.label } : {}),
  }
}

/** Rejects identity fields outside the exact shared payload shape. */
function hasOnlyIdentityKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value)
  return (
    keys.length === 2 && keys.includes("userId") && keys.includes("username")
  )
}

/** Checks a bounded identity field that must already be normalized. */
function isNormalizedBoundedIdentityField(value: unknown, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    value.length > CLERK_SESSION_IDENTITY_FIELD_MAX_LENGTH
  ) {
    return false
  }
  const normalized = value.trim()
  return normalized === value && (allowEmpty || normalized.length > 0)
}

/** Validates the narrow normalized identity hint shared across worlds. */
export function isOpenRouterClerkSessionIdentity(
  value: unknown,
): value is OpenRouterClerkSessionIdentity {
  if (!isRecord(value) || !hasOnlyIdentityKeys(value)) return false
  return (
    isNormalizedBoundedIdentityField(value.userId) &&
    isNormalizedBoundedIdentityField(value.username, true)
  )
}
