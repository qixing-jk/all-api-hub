import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
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
import { readCheckInRoutePath } from "~/services/checkin/autoCheckin/configuration/routeOverrides"
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
import type { CheckInMethodStatus } from "~/types/checkIn"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import type { TurnstilePreTrigger } from "~/types/turnstile"
import { formatLocalDayKey, formatLocalMonthKey } from "~/utils/core/dayKey"

export const NEW_API_MESSAGE_KEYS = {
  turnstileIncognitoAccessRequired:
    "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
} as const

type CheckinResult = AutoCheckinProviderOutcome
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT

/**
 * Resolve this account's check-in request path.
 *
 * Most New API deployments serve the canonical `/api/user/checkin`; a fork that
 * renamed the route stores its own path as an account-level override, and every
 * operation (status, mutation, Turnstile replay) must use that same path.
 */
export function resolveCheckInEndpoint(account?: SiteAccount): string {
  return account
    ? readCheckInRoutePath(
        account.checkIn,
        AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        ENDPOINT,
      )
    : ENDPOINT
}
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
 * Resolve the availability reported alongside a status body.
 *
 * The canonical contract answers `enabled` itself. A renamed route may omit it;
 * that deployment's console reads the public `checkin_enabled` switch instead,
 * so the same switch answers here. A non-strict read keeps its historical
 * "enabled unless proven otherwise" answer when neither source exists.
 */
async function resolveAvailability(
  reported: boolean | undefined,
  request: ApiServiceRequest,
  signal: AbortSignal | undefined,
  usesRouteOverride: boolean,
): Promise<boolean | undefined> {
  if (typeof reported === "boolean") return reported
  if (!usesRouteOverride) return true
  if (signal?.aborted) return undefined
  try {
    const supported = await fetchSupportCheckIn(request, signal)
    return typeof supported === "boolean" ? supported : undefined
  } catch {
    return undefined
  }
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
      /** Absent when neither the body nor the public switch answers. */
      enabled?: boolean
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
  const endpoint = resolveCheckInEndpoint(account)
  // A deployment that renamed the route may stop reporting `enabled` inside the
  // status body; its own console reads the public `checkin_enabled` switch
  // instead. Only an overridden route consults that switch, so a default
  // deployment's missing field still counts as an invalid response.
  const usesRouteOverride = endpoint !== ENDPOINT

  try {
    const checkInData = await newApiFamilyRequests.data<NewApiCheckInStatus>(
      request,
      {
        endpoint: `${endpoint}?month=${currentMonth}`,
        ...(signal ? { options: { signal } } : {}),
      },
    )

    if (
      typeof checkInData?.stats?.checked_in_today === "boolean" &&
      (!strictResponse ||
        typeof checkInData?.enabled === "boolean" ||
        usesRouteOverride)
    ) {
      const todayQuotaAwarded = resolveTodayQuotaAwarded(
        checkInData.stats.records,
      )
      const enabled = await resolveAvailability(
        checkInData.enabled,
        request,
        signal,
        usesRouteOverride,
      )
      return {
        ...(enabled !== undefined ? { enabled } : {}),
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
 * Read one candidate route a deployment's own assets exposed.
 *
 * This is the same strict read detection performs, against a path the caller
 * supplies instead of the account's current one. Only a complete
 * `stats.checked_in_today` answer counts, so a decoy or an unrelated endpoint
 * that happens to accept the request cannot be adopted as this method's route.
 */
export async function probeCheckInRoute(input: {
  account: SiteAccount
  path: string
  request?: ApiServiceRequest
  signal?: AbortSignal
  observedAt: number
}): Promise<CheckInMethodStatus | undefined> {
  const request =
    input.request ?? createCheckInRequest(input.account, undefined, undefined)
  try {
    const status = await newApiFamilyRequests.data<NewApiCheckInStatus>(
      request,
      {
        endpoint: `${input.path}?month=${formatLocalMonthKey()}`,
        ...(input.signal ? { options: { signal: input.signal } } : {}),
      },
    )
    if (typeof status?.stats?.checked_in_today !== "boolean") return undefined
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      ...(typeof status.enabled === "boolean"
        ? {
            availability: status.enabled
              ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
              : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
          }
        : {}),
      today: status.stats.checked_in_today
        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: input.observedAt,
      },
    }
  } catch {
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
