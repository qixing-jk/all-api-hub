import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import type {
  NewApiCheckInRecord,
  NewApiCheckInResponse,
  NewApiCheckInStatus,
} from "~/services/apiService/newApiFamily/checkInDto"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  readPositiveDecimalAmount,
  readQuotaReward,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { formatLocalDayKey, formatLocalMonthKey } from "~/utils/core/dayKey"

export const NEW_API_MESSAGE_KEYS = {
  turnstileManualRequired:
    "autoCheckin:providerFallback.turnstileManualRequired",
  turnstileIncognitoAccessRequired:
    "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
  nativePageIdentityMissing:
    "autoCheckin:providerFallback.nativePageIdentityMissing",
  nativePageIdentityMismatch:
    "autoCheckin:providerFallback.nativePageIdentityMismatch",
  nativePageTargetNotFound:
    "autoCheckin:providerFallback.nativePageTargetNotFound",
  nativePageTriggerFailed:
    "autoCheckin:providerFallback.nativePageTriggerFailed",
  nativePageStatusUnconfirmed:
    "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
} as const

type CheckinResult = AutoCheckinProviderOutcome
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT
/** Build the authenticated request shared by New API check-in operations. */
export function createCheckInRequest(
  account: SiteAccount,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
  mutationLifecycle?: AutoCheckinProviderContext["mutationLifecycle"],
): ApiServiceRequest {
  return {
    baseUrl: account.site_url,
    accountId: account.id,
    cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
    auth: {
      authType: getEffectiveAuthType(account),
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
    },
    tempWindowRequestSource,
    protectionBypassExecution,
    ...(mutationLifecycle ? { observer: mutationLifecycle } : {}),
  }
}

/**
 * Resolve the quota today's check-in awarded from a month's record set.
 *
 * The comparison uses the local calendar day, the same boundary the rest of the
 * extension keys days by. A deployment that resolves its own day differently
 * simply yields no match, and a record without a positive award yields none
 * either, so the row stays without an amount instead of showing a neighbouring
 * day's value or a meaningless zero.
 */
function resolveTodayQuotaAwarded(
  records: NewApiCheckInRecord[] | undefined,
): number | undefined {
  if (!Array.isArray(records)) return undefined
  const today = formatLocalDayKey()
  const todayRecord = records.find(
    (record) =>
      record &&
      typeof record.checkin_date === "string" &&
      record.checkin_date.trim() === today,
  )
  return readPositiveDecimalAmount(todayRecord?.quota_awarded)
}

/** Read the canonical public site flag instead of matching backend copy. */
export async function isCheckInDisabled(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<boolean> {
  return (await fetchSupportCheckIn(request, signal)) === false
}

/**
 * Resolve a user-openable URL for manual Turnstile verification.
 */
export function resolveCheckInUrl(
  account: SiteAccount,
): Promise<string | null> {
  return resolveAccountSiteRouteUrl(
    { baseUrl: account.site_url, siteType: account.site_type },
    SITE_ROUTE_KINDS.CheckIn,
  )
}

/**
 * Normalize a New-API check-in payload into the provider result for the common
 * success/already-checked outcomes.
 *
 * Returns `null` when the payload doesn't match those outcomes so the caller
 * can fall back to Turnstile/manual-required handling.
 */
export function resolveStandardCheckinResult(params: {
  payload: NewApiCheckInResponse | undefined
  message?: string
}): CheckinResult | null {
  const payload = params.payload
  if (!payload) return null

  const message = params.message ?? normalizeCheckinMessage(payload.message)

  if (message && isAlreadyCheckedMessage(message) && !payload.success) {
    return {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: message || undefined,
      // A repeat answer may carry the day's record; the day-match guard keeps
      // any other day's record from being shown as today's award.
      reward: readQuotaReward(
        resolveTodayQuotaAwarded(payload.data ? [payload.data] : undefined),
      ),
      data: payload.data,
    }
  }

  if (payload.success) {
    return {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rawMessage: message || undefined,
      messageKey: message
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
      // The mutation answers with the day's record, whose `quota_awarded` is
      // already an internal quota amount.
      reward: readQuotaReward(payload.data?.quota_awarded),
      data: payload.data ?? undefined,
    }
  }

  return null
}

/**
 * Defensive verification: resolve whether the user is already checked in today.
 *
 * Some deployments only render Turnstile after clicking a "check-in" button.
 * That click can also advance the server-side check-in flow, so we confirm the
 * actual status when the Turnstile-assisted attempt cannot obtain a token.
 */
export async function fetchCheckedInTodayStatus(
  account: SiteAccount | undefined,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
  throwOnUnsupported = false,
  signal?: AbortSignal,
  strictResponse = false,
  existingRequest?: ApiServiceRequest,
): Promise<
  | {
      checkedInToday?: boolean
      enabled: boolean
      /**
       * The quota this day's check-in awarded, read from the same month record
       * set this call already fetched. Absent when the deployment returns no
       * records or none of them is the caller's local day.
       */
      todayQuotaAwarded?: number
    }
  | undefined
> {
  const currentMonth = formatLocalMonthKey()
  const request =
    existingRequest ??
    (account
      ? createCheckInRequest(
          account,
          tempWindowRequestSource,
          protectionBypassExecution,
        )
      : undefined)
  if (!request) return undefined

  try {
    const checkInData = await newApiFamilyRequests.data<NewApiCheckInStatus>(
      request,
      {
        endpoint: `${ENDPOINT}?month=${currentMonth}`,
        ...(signal ? { options: { signal } } : {}),
      },
    )

    if (
      typeof checkInData?.stats?.checked_in_today === "boolean" &&
      (!strictResponse || typeof checkInData?.enabled === "boolean")
    ) {
      const todayQuotaAwarded = resolveTodayQuotaAwarded(
        checkInData.stats.records,
      )
      return {
        enabled: checkInData.enabled !== false,
        checkedInToday: checkInData.stats.checked_in_today,
        ...(todayQuotaAwarded !== undefined ? { todayQuotaAwarded } : {}),
      }
    }

    return !signal?.aborted && (await isCheckInDisabled(request, signal))
      ? { enabled: false }
      : undefined
  } catch (error) {
    if (!signal?.aborted && (await isCheckInDisabled(request, signal))) {
      return { enabled: false }
    }
    if (strictResponse) throw error
    if (
      throwOnUnsupported &&
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 405)
    ) {
      throw error
    }
    if (
      error instanceof ApiError &&
      (error.statusCode === 404 || error.statusCode === 500)
    ) {
      return undefined
    }

    return undefined
  }
}

/**
 * Extract a provider error message without assuming the thrown value shape.
 */
export function getProviderErrorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>
    if (typeof record.message === "string") return record.message
  }
  return ""
}

// New API exposes GET /api/user/checkin for readback and POST for mutation.
// Its official UI treats the public /api/status checkin_enabled flag as the
// availability contract, while check-in failures are HTTP 200 message-only
// responses whose localized text is not stable enough for state detection:
// https://github.com/QuantumNous/new-api/blob/2d8e50bf36e94200b809dfb39e73624ec48b1e23/controller/misc.go
// https://github.com/QuantumNous/new-api/blob/2d8e50bf36e94200b809dfb39e73624ec48b1e23/controller/checkin.go
// https://github.com/QuantumNous/new-api/blob/2d8e50bf36e94200b809dfb39e73624ec48b1e23/common/gin.go

/**
 * Resolve the Turnstile widget pre-trigger configuration for this account.
 *
 * This is an advanced escape hatch for sites that only render Turnstile after a
 * user action (e.g. clicking a "check-in" button).
 */
export function resolveTurnstilePreTrigger(
  account: SiteAccount,
): TurnstilePreTrigger {
  return (
    account.checkIn?.customCheckIn?.turnstilePreTrigger ?? {
      kind: "checkinButton",
    }
  )
}
