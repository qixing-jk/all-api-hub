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
import {
  DENXIO_DAILY_CHECK_IN_ERROR_CODES,
  DENXIO_DAILY_CHECK_IN_RESULT_KINDS,
  fetchDenxioDailyCheckInStatus,
  performDenxioDailyCheckIn,
} from "~/services/apiService/sub2api/denxioCheckIn"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const createReadRequest = (
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

const createMutationRequest = (
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

const readStatus = async (context: AutoCheckinProviderReadContext) => {
  const status = await fetchDenxioDailyCheckInStatus(createReadRequest(context))
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
      observedAt: context.observedAt,
    },
  } as const
}

const failed = (
  reasonCode: AutoCheckinProviderResult["reasonCode"],
  retryable?: boolean,
  rawMessage?: string,
): AutoCheckinProviderResult => ({
  status: CHECKIN_RESULT_STATUS.FAILED,
  reasonCode,
  ...(typeof retryable === "boolean" ? { retryable } : {}),
  ...(rawMessage
    ? { rawMessage }
    : {
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      }),
})

const mapMutationError = (
  error: unknown,
  context: AutoCheckinProviderContext,
): AutoCheckinProviderResult => {
  const persistenceStatus = getSub2ApiAuthPersistenceStatus(error)
  if (
    persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH
  ) {
    return failed(AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED, false)
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING) {
    return failed(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE, false)
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED) {
    return failed(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE, false)
  }

  if (error instanceof ApiError) {
    if (
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.AlreadyChecked
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: getSafeErrorMessage(error),
      }
    }
    if (error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.Disabled) {
      return failed(
        AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
        false,
        getSafeErrorMessage(error),
      )
    }
    if (error.statusCode === 401) {
      return failed(AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED)
    }
    if (error.statusCode === 404 || error.statusCode === 405) {
      return failed(AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED, false)
    }
    if (
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.NoSponsor ||
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionInvalid ||
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionPending
    ) {
      return failed(
        AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
        false,
        getSafeErrorMessage(error),
      )
    }
  }

  if (context.mutationLifecycle?.dispatched) {
    return {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
    }
  }

  switch (classifyAutoCheckinError(error)) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return failed(AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED)
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return failed(AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED)
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return failed(AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR)
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return failed(AUTO_CHECKIN_SKIP_REASON.TIMEOUT)
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return failed(AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE)
    default:
      return failed(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
  }
}

export const denxioProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,

  getReadiness(account) {
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
  },

  detect(context) {
    return detectWithStatusReadback(context, readStatus)
  },

  getStatus: readStatus,

  async checkIn(account, context) {
    const status = context.statusProof
    if (
      status?.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return failed(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
    }

    try {
      const result = await performDenxioDailyCheckIn(
        createMutationRequest(account as SiteAccount, context),
        { beforeRecoveredMutation: context.beforeRecoveredMutation },
      )
      switch (result.kind) {
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Applied:
          return {
            status: CHECKIN_RESULT_STATUS.SUCCESS,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
            data: { rewardAmount: result.rewardAmount },
          }
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked:
          return {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          }
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.Disabled:
          return failed(AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED, false)
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable:
          return failed(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE, false)
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed:
          return failed(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE, false)
      }
    } catch (error) {
      return mapMutationError(error, context)
    }
  },
}
