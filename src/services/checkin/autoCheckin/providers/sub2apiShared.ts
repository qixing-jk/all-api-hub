import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  getSub2ApiAuthPersistenceStatus,
  SUB2API_AUTH_PERSISTENCE_STATUSES,
} from "~/services/apiService/sub2api/authSession"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  createTerminalFailureResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import type {
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
  AutoCheckinProviderReadiness,
} from "./contracts"

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const createSub2ApiCheckInReadRequest = (
  context: AutoCheckinProviderReadContext,
): ApiServiceRequest => {
  const request =
    context.request ??
    (context.account
      ? createAccountApiRequestFromStoredAccount(context.account).request
      : null)
  if (!request) throw new Error("Sub2API account data is unavailable")
  return {
    ...request,
    ...(context.signal ? { abortSignal: context.signal } : {}),
  }
}

export const createSub2ApiCheckInMutationRequest = (
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): ApiServiceRequest => ({
  ...createAccountApiRequestFromStoredAccount(account).request,
  tempWindowRequestSource: normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  ),
  protectionBypassExecution: context.protectionBypassExecution,
  ...(context.mutationLifecycle ? { observer: context.mutationLifecycle } : {}),
})

export const toSub2ApiCheckInStatus = (
  status: { enabled: boolean; checkedInToday: boolean },
  observedAt: number,
) => {
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability: status.enabled
      ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
      : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    today: status.checkedInToday
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  } as const
}

export const failedSub2ApiCheckIn = (
  reasonCode: AutoCheckinSkipReason,
): AutoCheckinProviderOutcome => ({
  status: CHECKIN_RESULT_STATUS.FAILED,
  reasonCode,
  messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
})

/** Shared fallback for single-step methods; Denxio owns its upstream error codes. */
export const mapSub2ApiCheckInMutationError = (
  error: unknown,
  context: AutoCheckinProviderContext,
): AutoCheckinProviderOutcome => {
  const persistenceStatus = getSub2ApiAuthPersistenceStatus(error)
  if (
    persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH
  ) {
    return failedSub2ApiCheckIn(
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    )
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING) {
    return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE)
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED) {
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_STATE_WRITE_FAILED,
    })
  }

  const statusCode = error instanceof ApiError ? error.statusCode : undefined
  if (statusCode === 401) {
    return failedSub2ApiCheckIn(
      AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    )
  }
  if (statusCode === 404 || statusCode === 405) {
    return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED)
  }

  if (context.mutationLifecycle?.dispatched) {
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
    }
  }

  switch (classifyAutoCheckinError(error)) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return failedSub2ApiCheckIn(
        AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      )
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED)
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR)
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.TIMEOUT)
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE)
    default:
      return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
  }
}

export const getSub2ApiCheckInReadiness = (
  account: SiteAccount,
): AutoCheckinProviderReadiness => {
  if (
    !hasText(account.id) ||
    !hasText(account.site_url) ||
    !hasText(account.account_info?.id)
  ) {
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
    }
  }
  if (!hasText(account.account_info?.access_token)) {
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
    }
  }
  return { ready: true }
}
