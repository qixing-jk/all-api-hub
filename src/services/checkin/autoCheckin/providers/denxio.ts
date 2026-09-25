import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
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
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
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

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
  AutoCheckinProviderReadContext,
} from "./contracts"
import {
  createSub2ApiCheckInMutationRequest,
  createSub2ApiCheckInReadRequest,
  getSub2ApiCheckInReadiness,
  toSub2ApiCheckInStatus,
} from "./sub2apiShared"

const readStatus = async (context: AutoCheckinProviderReadContext) => {
  const status = await fetchDenxioDailyCheckInStatus(
    createSub2ApiCheckInReadRequest(context),
  )
  return toSub2ApiCheckInStatus(status, context.observedAt)
}

const failed = (
  reasonCode: AutoCheckinSkipReason,
  rawMessage?: string,
): AutoCheckinProviderOutcome => ({
  status: CHECKIN_RESULT_STATUS.FAILED,
  reasonCode,
  ...(rawMessage
    ? { rawMessage }
    : {
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      }),
})

const mapMutationError = (
  error: unknown,
  context: AutoCheckinProviderContext,
): AutoCheckinProviderOutcome => {
  const persistenceStatus = getSub2ApiAuthPersistenceStatus(error)
  if (
    persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH
  ) {
    return failed(AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED)
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING) {
    return failed(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE)
  }
  if (persistenceStatus === SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED) {
    return createTerminalFailureResult({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_STATE_WRITE_FAILED,
    })
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
        getSafeErrorMessage(error),
      )
    }
    if (error.statusCode === 401) {
      return failed(AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED)
    }
    if (error.statusCode === 404 || error.statusCode === 405) {
      return failed(AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED)
    }
    if (
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.NoSponsor ||
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionInvalid ||
      error.upstreamCode === DENXIO_DAILY_CHECK_IN_ERROR_CODES.SessionPending
    ) {
      return failed(
        AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
        getSafeErrorMessage(error),
      )
    }
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

  getReadiness: getSub2ApiCheckInReadiness,

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
        createSub2ApiCheckInMutationRequest(account as SiteAccount, context),
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
          return failed(AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED)
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryStatusUnavailable:
          return failed(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
        case DENXIO_DAILY_CHECK_IN_RESULT_KINDS.RecoveryPreconditionFailed:
          return failed(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE)
      }
    } catch (error) {
      return mapMutationError(error, context)
    }
  },
}
