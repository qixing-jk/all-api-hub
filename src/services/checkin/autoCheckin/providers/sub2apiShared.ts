import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import {
  createAccountApiRequestFromStoredAccount,
  hasStoredSub2ApiRefreshToken,
} from "~/services/accounts/utils/apiServiceRequest"
import type { ConfirmedAward } from "~/services/amounts/awards"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  getSub2ApiAuthPersistenceStatus,
  SUB2API_AUTH_PERSISTENCE_STATUSES,
} from "~/services/apiService/sub2api/auth/authSession"
import {
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
  type Sub2ApiCheckInRecoveryObservation,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { ApiError } from "~/services/apiTransport/errors"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
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

const createStoredCheckInRequest = (account: SiteAccount) =>
  createAccountApiRequestFromStoredAccount(account, {
    allowStoredSub2ApiRefreshToken: true,
  }).request

export const createSub2ApiCheckInReadRequest = (
  context: AutoCheckinProviderReadContext,
  transportPolicy?: AutoCheckinProviderContext,
): ApiServiceRequest => {
  const request =
    context.request ??
    (context.account ? createStoredCheckInRequest(context.account) : null)
  if (!request) throw new Error("Sub2API account data is unavailable")
  const readRequest = {
    ...request,
    ...(context.signal ? { abortSignal: context.signal } : {}),
  }
  const recovery = context.authenticationRecovery ?? transportPolicy
  return recovery
    ? bindApiTransportRequest(
        { ...readRequest, ...recovery },
        API_DIRECT_REQUEST_REASONS.CallerManaged,
      )
    : readRequest
}

export const createSub2ApiCheckInMutationRequest = (
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): ApiServiceRequest =>
  bindApiTransportRequest(
    {
      ...createStoredCheckInRequest(account),
      tempWindowRequestSource: normalizeTempWindowRequestSource(
        context.tempWindowRequestSource,
      ),
      protectionBypassExecution: context.protectionBypassExecution,
      ...(context.mutationLifecycle
        ? { observer: context.mutationLifecycle }
        : {}),
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )

export const toSub2ApiCheckInStatus = (
  status: { enabled: boolean; checkedInToday: boolean; periodKey?: string },
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
      ...(status.periodKey ? { periodKey: status.periodKey } : {}),
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

/** Preserve the verified USD grant without a product-quota round trip. */
export function readUsdAwards(
  account: SiteAccount,
  value: unknown,
  source: { operation: string; field: string; event?: ConfirmedAward["event"] },
) {
  return value === undefined
    ? undefined
    : [
        accountAward(account, {
          id: source.field,
          ...source,
          value,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          target: AWARD_TARGETS.Wallet,
          fulfillment: AWARD_FULFILLMENT.Credited,
        }),
      ]
}

/** Shared fallback for single-step methods; Denxio owns its upstream error codes. */
export const mapSub2ApiCheckInMutationError = (
  error: unknown,
  context: AutoCheckinProviderContext,
  account: SiteAccount,
): AutoCheckinProviderOutcome => {
  if (error instanceof Sub2ApiCheckInRecoveryBlockedError) {
    switch (error.reason) {
      case SUB2API_CHECK_IN_RECOVERY_REASONS.AlreadyChecked:
        return observedSub2ApiAlreadyChecked(account, error.statusObservation)
      case SUB2API_CHECK_IN_RECOVERY_REASONS.Disabled:
        return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED)
      case SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable:
        return failedSub2ApiCheckIn(AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE)
      case SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed:
        return failedSub2ApiCheckIn(
          AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
        )
    }
  }
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

/** Recovery GETs carry observation time and the identity actually read. */
export function observedSub2ApiAlreadyChecked(
  account: SiteAccount,
  observation?: Sub2ApiCheckInRecoveryObservation,
): AutoCheckinProviderOutcome {
  if (!observation)
    return withCheckInConfirmation(
      account,
      {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
        messageKey: AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.unknownError,
      },
      { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
    )
  const result = withCheckInConfirmation(
    account,
    {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
    },
    {
      kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
      status: toSub2ApiCheckInStatus(
        observation.observation,
        observation.observedAt,
      ),
    },
  )
  return {
    ...result,
    confirmation: {
      ...result.confirmation,
      siteUrl: observation.siteUrl,
      userId: observation.userId,
    },
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
  if (
    !hasText(account.account_info?.access_token) &&
    !hasStoredSub2ApiRefreshToken(account)
  ) {
    return {
      ready: false,
      reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
    }
  }
  return { ready: true }
}
