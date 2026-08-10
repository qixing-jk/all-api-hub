import {
  createOpenRouterBootstrapLabel,
  OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES,
  OPENROUTER_BOOTSTRAP_MUTATION_STATES,
  OPENROUTER_BOOTSTRAP_VALIDATION_TIMEOUT_MS,
  type OpenRouterBootstrapNotDispatchedAttemptOutcome,
} from "~/constants/openRouterBootstrap"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { OPENROUTER_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { validateManagementKey } from "~/services/apiService/openrouter"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { t } from "~/utils/i18n/core"

import { resolveOpenRouterBootstrapIdentity } from "./accountIdentity"
import {
  cancelTempWindowOpenRouterManagementKeyAction,
  tempWindowOpenRouterManagementKeyAction,
} from "./managementKeyActionClient"
import type { TempWindowOpenRouterManagementKeyCancelResult } from "./managementKeyPageContract"
import type {
  OpenRouterAccountOnboardingResult,
  OpenRouterProvisioningOutcome,
} from "./types"

type OpenRouterProvisioningRequest = {
  requestId: string
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution: ProtectionBypassExecution
}

/** Builds recovery evidence when a create dispatch cannot be confirmed. */
function createMutationUnconfirmedOutcome(
  requestId: string,
  label: string,
): Extract<
  OpenRouterProvisioningOutcome,
  { status: "recovery_required"; reason: "mutation_unconfirmed" }
> {
  return {
    status: "recovery_required",
    reason: "mutation_unconfirmed",
    requestId,
    provisioning: {
      requestId,
      label,
      mutationState: OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed,
    },
    attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed,
  }
}

const createInitialCheckInConfig = () =>
  createCompatibilityCheckInConfig({
    siteType: SITE_TYPES.OPENROUTER,
    supported: false,
    automaticExecutionEnabled: false,
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  })

/** Creates and validates one OpenRouter Management Key without retrying mutation. */
export async function provisionOpenRouterAccount(
  request: OpenRouterProvisioningRequest,
): Promise<OpenRouterProvisioningOutcome> {
  const requestId = request.requestId.trim()
  const label = createOpenRouterBootstrapLabel(requestId)
  let postCreateRecovery:
    | Extract<
        OpenRouterProvisioningOutcome,
        {
          status: "recovery_required"
          reason: "post_create_validation_failed"
        }
      >
    | undefined

  try {
    const created = await tempWindowOpenRouterManagementKeyAction({
      requestId,
      operation: { kind: "create", label },
      ...(request.tempWindowRequestSource
        ? { tempWindowRequestSource: request.tempWindowRequestSource }
        : {}),
      protectionBypassExecution: request.protectionBypassExecution,
    })

    if (!created) return createMutationUnconfirmedOutcome(requestId, label)

    if (
      created.mutationState ===
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.NotDispatched
    ) {
      return {
        status: "failed",
        requestId,
        mutationState: created.mutationState,
        attemptOutcome: created.attemptOutcome,
      }
    }

    if (
      created.mutationState ===
      OPENROUTER_BOOTSTRAP_MUTATION_STATES.DispatchedUnconfirmed
    ) {
      return {
        status: "recovery_required",
        reason: "mutation_unconfirmed",
        requestId,
        provisioning: {
          requestId,
          label: created.label,
          mutationState: created.mutationState,
        },
        attemptOutcome: created.attemptOutcome,
      }
    }

    const provisioning = {
      requestId,
      label: created.label,
      mutationState: created.mutationState,
    }

    if (
      created.attemptOutcome ===
      OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledAfterCreate
    ) {
      return {
        status: "recovery_required",
        reason: "cancelled_after_create",
        requestId,
        provisioning,
        createdCredential: { accessToken: created.accessToken },
        attemptOutcome: created.attemptOutcome,
      }
    }

    postCreateRecovery = {
      status: "recovery_required",
      reason: "post_create_validation_failed",
      requestId,
      provisioning,
      createdCredential: { accessToken: created.accessToken },
      attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.ValidationFailed,
    }

    const validationController = new AbortController()
    let validationTimeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      const credentialIdentity = await Promise.race([
        validateManagementKey({
          accessToken: created.accessToken,
          signal: validationController.signal,
        }),
        new Promise<never>((_, reject) => {
          validationTimeoutId = setTimeout(() => {
            validationController.abort()
            reject(new Error("OpenRouter credential validation timed out"))
          }, OPENROUTER_BOOTSTRAP_VALIDATION_TIMEOUT_MS)
        }),
      ])
      const identity = resolveOpenRouterBootstrapIdentity({
        sessionIdentity: created.sessionIdentity,
        creatorUserId: credentialIdentity.userId,
      })

      return {
        status: "completed",
        data: {
          username: identity.username,
          siteName: OPENROUTER_DISPLAY_NAME,
          accessToken: created.accessToken,
          userId: identity.userId,
          exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
          authType: AuthTypeEnum.AccessToken,
          checkIn: createInitialCheckInConfig(),
        },
        provisioning,
        attemptOutcome: OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Success,
      }
    } catch {
      return postCreateRecovery
    } finally {
      if (validationTimeoutId) clearTimeout(validationTimeoutId)
    }
  } catch {
    return (
      postCreateRecovery ?? createMutationUnconfirmedOutcome(requestId, label)
    )
  }
}

/** Maps provider provisioning into the canonical Account dialog workflow. */
export async function onboardOpenRouterAccount(
  request: OpenRouterProvisioningRequest,
): Promise<OpenRouterAccountOnboardingResult> {
  const outcome = await provisionOpenRouterAccount(request)

  if (outcome.status === "recovery_required") {
    return {
      ...outcome,
      kind: "bootstrap_recovery",
      success: false,
      message:
        outcome.reason === "mutation_unconfirmed"
          ? t("messages:openrouter.bootstrap.mutationUnconfirmed")
          : outcome.reason === "cancelled_after_create"
            ? t("messages:openrouter.bootstrap.cancelledAfterCreate")
            : t("messages:openrouter.bootstrap.validationFailed"),
    }
  }

  if (outcome.status === "failed") {
    return {
      kind: "bootstrap_failure",
      success: false,
      message: getOpenRouterBootstrapFailureMessage(outcome.attemptOutcome),
      requestId: outcome.requestId,
      mutationState: outcome.mutationState,
      attemptOutcome: outcome.attemptOutcome,
    }
  }

  return {
    kind: "bootstrap_completed",
    success: true,
    message: t("accountDialog:messages.autoDetectSuccess"),
    data: {
      ...outcome.data,
      siteType: SITE_TYPES.OPENROUTER,
    },
    provisioning: outcome.provisioning,
    attemptOutcome: outcome.attemptOutcome,
  }
}

/** Returns localized recovery guidance for a pre-dispatch creation failure. */
function getOpenRouterBootstrapFailureMessage(
  outcome: OpenRouterBootstrapNotDispatchedAttemptOutcome,
) {
  switch (outcome) {
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.LoggedOut:
      return t("messages:openrouter.bootstrap.logged_out")
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.PageChanged:
      return t("messages:openrouter.bootstrap.page_changed")
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.InvalidOrigin:
      return t("messages:openrouter.bootstrap.invalid_origin")
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Timeout:
      return t("messages:openrouter.bootstrap.timeout")
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.CancelledBeforeCreate:
      return t("messages:openrouter.bootstrap.cancelled_before_create")
    case OPENROUTER_BOOTSTRAP_ATTEMPT_OUTCOMES.Failed:
      return t("messages:openrouter.bootstrap.failed")
  }
}

/** Cancels only the in-flight local OpenRouter provisioning request. */
export async function cancelOpenRouterAccountProvisioning(
  requestId: string,
): Promise<TempWindowOpenRouterManagementKeyCancelResult> {
  const normalizedRequestId = requestId.trim()
  if (!normalizedRequestId) {
    return { requestId: normalizedRequestId, certainty: "unknown" }
  }
  try {
    return await cancelTempWindowOpenRouterManagementKeyAction(
      normalizedRequestId,
    )
  } catch {
    return { requestId: normalizedRequestId, certainty: "unknown" }
  }
}
