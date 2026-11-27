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
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import type {
  NewApiCheckInRecord,
  NewApiCheckInResponse,
  NewApiCheckInStatus,
} from "~/services/apiService/newApiFamily/checkInDto"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  FLOWBEE_CHECK_IN_POINT_ASSET,
  isFlowbeeDeployment,
} from "~/services/apiService/newApiFamily/variants/flowbeeCheckInProtocol"
import { ApiError } from "~/services/apiTransport/errors"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import { readCheckInRoutePath } from "~/services/checkin/autoCheckin/configuration/routeOverrides"
import {
  CHECK_IN_CONFIRMATION_KINDS,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import type { AutoCheckinProviderContext } from "~/services/checkin/autoCheckin/providers/contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderOutcome } from "~/services/checkin/autoCheckin/providers/types"
import { createConfirmedCheckInResult } from "~/services/checkin/autoCheckin/resultReconciliation"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import {
  TURNSTILE_PRE_TRIGGER_KINDS,
  type TurnstilePreTrigger,
} from "~/types/turnstile"
import {
  formatLocalDayKey,
  formatLocalMonthKey,
  parseDayKey,
} from "~/utils/core/dayKey"

export const NEW_API_MESSAGE_KEYS = {
  turnstileIncognitoAccessRequired:
    "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
} as const

export const NEW_API_AWARD_SOURCES = {
  Mutation: "mutation",
  Status: "status",
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
  return bindApiTransportRequest(
    {
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
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )
}

/**
 * Resolve today's native check-in record from a month's record set.
 *
 * The comparison uses the local calendar day, the same boundary the rest of the
 * extension keys days by. A deployment that resolves its own day differently
 * simply yields no match. Preserve the matching record's original amount and
 * date so zero stays known and event identity never depends on a later clock
 * read after network work.
 */
function resolveTodayCheckinRecord(
  records: NewApiCheckInRecord[] | undefined,
): NewApiCheckInRecord | undefined {
  if (!Array.isArray(records)) return undefined
  const today = formatLocalDayKey()
  const todayRecord = records.find(
    (record) =>
      record &&
      typeof record.checkin_date === "string" &&
      record.checkin_date.trim() === today,
  )
  return todayRecord
}

/** Daily records identify one grant; a missing date never becomes an invented event ID. */
export function readNewApiAwards(
  account: SiteAccount,
  record: NewApiCheckInRecord | undefined,
  source: (typeof NEW_API_AWARD_SOURCES)[keyof typeof NEW_API_AWARD_SOURCES] = NEW_API_AWARD_SOURCES.Mutation,
) {
  const day = record?.checkin_date?.trim()
  const usesPoints =
    isFlowbeeDeployment(account.site_url) &&
    record?.points_awarded !== undefined
  const field = usesPoints ? "points_awarded" : "quota_awarded"
  const value = record?.[field]
  if (value === undefined) return undefined
  const amount = newApiFinancialAmount(
    value,
    account.site_url,
    account.site_type,
  )
  return [
    accountAward(account, {
      id: "daily-checkin",
      operation: resolveCheckInEndpoint(account),
      field:
        source === NEW_API_AWARD_SOURCES.Status
          ? `stats.records[].${field}`
          : field,
      value,
      ...(usesPoints
        ? {
            asset: { kind: ASSET_KINDS.Quota, ...FLOWBEE_CHECK_IN_POINT_ASSET },
            contractVersion: "flowbee-points:1",
            target: AWARD_TARGETS.Unknown,
          }
        : {
            nativeUnitsPerAsset: amount.nativeUnitsPerAsset,
            amountInputs: amount.amountInputs,
            asset: amount.asset,
            contractVersion: amount.contractVersion,
            target: AWARD_TARGETS.Wallet,
          }),
      fulfillment: AWARD_FULFILLMENT.Credited,
      ...(day && parseDayKey(day)
        ? { event: { namespace: "new-api-checkin-day", id: day } }
        : {}),
    }),
  ]
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
    {
      baseUrl: account.site_url,
      siteType: account.site_type,
      checkIn: account.checkIn,
    },
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
  account: SiteAccount
  payload: NewApiCheckInResponse | undefined
  message?: string
}): CheckinResult | null {
  const payload = params.payload
  if (!payload) return null

  const message = params.message ?? normalizeCheckinMessage(payload.message)
  const confirmed = (result: CheckinResult) =>
    withCheckInResponseConfirmation(params.account, result, {
      day: payload.data?.checkin_date,
    })

  if (message && isAlreadyCheckedMessage(message) && !payload.success) {
    return confirmed({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      rawMessage: message || undefined,
      // A repeat answer may carry the day's record; the day-match guard keeps
      // any other day's record from being shown as today's award.
      awards: readNewApiAwards(
        params.account,
        resolveTodayCheckinRecord(payload.data ? [payload.data] : undefined),
      ),
      data: payload.data,
    })
  }

  if (payload.success) {
    return confirmed({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      rawMessage: message || undefined,
      messageKey: message
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
      // Preserve the deployment's native asset from the granted day's record.
      awards: readNewApiAwards(params.account, payload.data ?? undefined),
      data: payload.data ?? undefined,
    })
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
 * actual status after an unsuccessful attempt, including a rejected token replay.
 */
export async function fetchCheckedInTodayStatus(
  ...params: Parameters<typeof fetchSingleNewApiCheckInStatus>
) {
  const stable = await readDayStableCheckInObservation(() =>
    fetchSingleNewApiCheckInStatus(...params),
  )
  return stable
    ? { ...stable.observation, observedAt: stable.observedAt }
    : undefined
}

/** Read one complete protocol observation; the caller owns its day-boundary check. */
export async function fetchSingleNewApiCheckInStatus(
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
       * The day's native award fields, read from the same month record
       * set this call already fetched. Absent when the deployment returns no
       * records or none of them is the caller's local day.
       */
      todayRecord?: NewApiCheckInRecord
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
      const todayRecord = resolveTodayCheckinRecord(checkInData.stats.records)
      const enabled = await resolveAvailability(
        checkInData.enabled,
        request,
        signal,
        usesRouteOverride,
      )
      return {
        ...(enabled !== undefined ? { enabled } : {}),
        checkedInToday: checkInData.stats.checked_in_today,
        ...(todayRecord ? { todayRecord } : {}),
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

/** Interpret New API readback without making another request or retaining failure copy. */
export function resolveNewApiCheckInReadback(
  observation: Awaited<ReturnType<typeof fetchCheckedInTodayStatus>>,
  input: {
    account: SiteAccount
    data?: unknown
    status?:
      | typeof CHECKIN_RESULT_STATUS.SUCCESS
      | typeof CHECKIN_RESULT_STATUS.ALREADY_CHECKED
  },
) {
  if (observation?.checkedInToday !== true) return null
  const result = createConfirmedCheckInResult({
    status: input.status ?? CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    awards: readNewApiAwards(
      input.account,
      observation.todayRecord,
      NEW_API_AWARD_SOURCES.Status,
    ),
    data: input.data,
  })
  return withNewApiStatusConfirmation(input.account, result, observation)
}

/** Share observed status between intermediate fallback gates and final confirmation. */
export function withNewApiStatusConfirmation<
  T extends AutoCheckinProviderOutcome,
>(
  account: SiteAccount,
  result: T,
  observation: Awaited<ReturnType<typeof fetchCheckedInTodayStatus>>,
) {
  const observedAt = observation?.observedAt ?? Date.now()
  const status = toNewApiMethodStatus(observation, observedAt)
  return withCheckInConfirmation(
    account,
    result,
    status
      ? {
          kind: CHECK_IN_CONFIRMATION_KINDS.Observed,
          status,
          awards: observation?.checkedInToday
            ? readNewApiAwards(
                account,
                observation.todayRecord,
                NEW_API_AWARD_SOURCES.Status,
              )
            : undefined,
        }
      : { kind: CHECK_IN_CONFIRMATION_KINDS.Unavailable },
  )
}

/** Adapt optional status facts without inventing missing availability or day state. */
export function toNewApiMethodStatus(
  observation: Awaited<ReturnType<typeof fetchSingleNewApiCheckInStatus>>,
  observedAt: number,
): CheckInMethodStatus | undefined {
  if (!observation) return undefined
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    ...(typeof observation.enabled === "boolean"
      ? {
          availability: observation.enabled
            ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
            : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        }
      : {}),
    ...(typeof observation.checkedInToday === "boolean"
      ? {
          today: observation.checkedInToday
            ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
            : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        }
      : {}),
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
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
      kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
    }
  )
}
