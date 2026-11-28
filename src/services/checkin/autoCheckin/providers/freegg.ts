import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { CURRENCIES } from "~/constants/money"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
} from "~/services/amounts/financialConstants"
import {
  fetchFreeggAllowanceLogs,
  isFreeggAllowanceRecord,
  isValidFreeggLog,
  readFreeggAllowanceUsd,
  triggerFreeggDailyAllowance,
} from "~/services/apiService/newApiFamily/variants/freeggDailyAllowance"
import {
  FREEGG_ALLOWANCE_LOG_ENDPOINT,
  FREEGG_ALLOWANCE_RESET_TIME_ZONE,
  isFreeggUrl,
} from "~/services/apiService/newApiFamily/variants/freeggDailyAllowanceConfig"
import { composeAbortSignals } from "~/services/apiTransport/abortableTask"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import {
  isCheckInObservationCurrent,
  readDayStableCheckInObservation,
} from "~/services/checkin/statusObservation"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import {
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
} from "~/types/autoCheckin"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import type { AutoCheckinProvider } from "./contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "./shared"

/** Report the current-day ledger status without attributing a new award. */
function alreadyClaimed(account: SiteAccount, status: CheckInMethodStatus) {
  return withCheckInConfirmation(
    account,
    {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      messageKey:
        AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
    },
    {
      kind: "observed",
      status,
    },
  )
}

/** Read one day-stable ledger observation for both status and completion. */
async function readAllowanceObservation(
  request: ApiServiceRequest,
  observedAt = Date.now(),
): Promise<{
  status: CheckInMethodStatus
  record?: Record<string, unknown>
  complete?: boolean
}> {
  const unknown = () => ({
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
      attemptedAt: observedAt,
    },
  })
  const stable = await readDayStableCheckInObservation(
    () => fetchFreeggAllowanceLogs(request),
    FREEGG_ALLOWANCE_RESET_TIME_ZONE,
  )
  if (!stable) return unknown()
  const { records, complete, serverTime } = stable.observation
  observedAt = stable.observedAt
  if (
    (serverTime !== undefined &&
      !isCheckInObservationCurrent(
        serverTime,
        FREEGG_ALLOWANCE_RESET_TIME_ZONE,
        observedAt,
      )) ||
    records.some(
      (record) =>
        !isValidFreeggLog(
          record,
          request.auth.userId,
          serverTime ?? observedAt,
        ),
    )
  )
    return unknown()
  const day = getDayKeyFromUnixSeconds(
    observedAt / 1000,
    FREEGG_ALLOWANCE_RESET_TIME_ZONE,
  )
  const record = records.find(
    (item) =>
      isFreeggAllowanceRecord(item) &&
      getDayKeyFromUnixSeconds(
        item.created_at as number,
        FREEGG_ALLOWANCE_RESET_TIME_ZONE,
      ) === day,
  )
  if (!record && !complete) return unknown()
  return {
    record,
    complete,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: record
        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      resetTimeZone: FREEGG_ALLOWANCE_RESET_TIME_ZONE,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt,
      },
    },
  }
}

/**
 * FreeGG v1.0.0-rc.49 has a daily allowance separate from checkin_enabled.
 * The public console describes a fixed grant on the first authenticated visit.
 * Verified protocol observations: .scratch/freegg-daily-allowance/spec.md.
 *
 * Live observations establish UTC+8 days and structured type-1 grants. Log IDs
 * are presentation positions; timestamped account evidence confirms a claim.
 */
export const freeggProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness(account) {
    if (!isFreeggUrl(account.site_url) || !account.account_info?.id) {
      return {
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      }
    }
    // The verified API path uses the saved account bearer. Ambient sessions,
    // cookie extraction and interactive login are not part of this provider.
    return account.authType === AuthTypeEnum.AccessToken &&
      !!account.account_info.access_token?.trim()
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
        }
  },
  async detect(context) {
    context.signal?.throwIfAborted()
    const baseUrl = context.account?.site_url ?? context.request?.baseUrl
    return {
      outcome: isFreeggUrl(baseUrl)
        ? CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
        : CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      evidence: {
        source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
        observedAt: context.observedAt,
      },
    }
  },
  async getStatus({ account, request, observedAt, signal }) {
    if (!request && account && !freeggProvider.getReadiness(account).ready)
      return
    const source =
      request ??
      (account
        ? createAccountApiRequestFromStoredAccount(account).request
        : undefined)
    if (
      !source ||
      !isFreeggUrl(source.baseUrl) ||
      !source.auth.userId ||
      source.auth.authType !== AuthTypeEnum.AccessToken ||
      !source.auth.accessToken?.trim() ||
      signal?.aborted ||
      source.abortSignal?.aborted
    )
      return
    if (
      account &&
      (String(source.auth.userId) !== String(account.account_info.id) ||
        new URL(source.baseUrl).origin !== new URL(account.site_url).origin)
    )
      return
    const composed = composeAbortSignals([signal, source.abortSignal])
    try {
      return (
        await readAllowanceObservation(
          {
            baseUrl: source.baseUrl,
            auth: source.auth,
            accountId: source.accountId,
            siteType: source.siteType,
            directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
            abortSignal: composed.signal,
          },
          observedAt,
        )
      ).status
    } finally {
      composed.dispose()
    }
  },
  async checkIn(account, context) {
    if (!("site_type" in account)) {
      return resolveProviderErrorResult({
        error: new Error("FreeGG account is required"),
      })
    }
    if (!freeggProvider.getReadiness(account).ready) {
      return createUnconfirmedCheckInResult(account)
    }
    let triggerAttempted = false
    try {
      const storedRequest =
        createAccountApiRequestFromStoredAccount(account).request
      // Keep the claim bound to the saved token, independently of browser sessions.
      const request = {
        baseUrl: account.site_url,
        accountId: account.id,
        siteType: account.site_type,
        auth: storedRequest.auth,
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      }
      // The shared executor supplies its preflight status. Direct callers use
      // the same read-only status path instead of another admission policy.
      let before: CheckInMethodStatus | undefined = context.statusProof
      if (
        !before ||
        !("observedAt" in before.evidence) ||
        !isCheckInObservationCurrent(
          before.evidence.observedAt,
          FREEGG_ALLOWANCE_RESET_TIME_ZONE,
        )
      ) {
        before = await freeggProvider.getStatus?.({
          account,
          observedAt: Date.now(),
        })
      }
      if (before?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known)
        return createUnconfirmedCheckInResult(account)
      if (before.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked)
        return alreadyClaimed(account, before)
      if (before.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked)
        return createUnconfirmedCheckInResult(account)
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      triggerAttempted = true
      let response: Awaited<ReturnType<typeof triggerFreeggDailyAllowance>>
      let triggerResponseLost = false
      try {
        response = await triggerFreeggDailyAllowance({
          ...request,
          observer: context.mutationLifecycle,
        })
      } catch {
        // A lost response may have credited the grant. Read logs once below;
        // never replay self and never assume its missing identity matched.
        triggerResponseLost = true
      }
      const expectedIdentity = String(account.account_info.id)
      if (
        !triggerResponseLost &&
        (!response?.id || String(response.id) !== expectedIdentity)
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      const readback = await readAllowanceObservation(request)
      const record = readback.record
      if (
        !readback.complete ||
        !record ||
        (triggerResponseLost && String(record.user_id) !== expectedIdentity)
      )
        return createUnconfirmedCheckInResult(account)
      if (
        response?.allowanceDate &&
        response.allowanceDate !==
          getDayKeyFromUnixSeconds(
            record.created_at as number,
            FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          )
      )
        return createUnconfirmedCheckInResult(account)
      const usdAmount = readFreeggAllowanceUsd(record)
      return withCheckInResponseConfirmation(
        account,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          awards: [
            accountAward(account, {
              id: `freegg:${record.created_at}`,
              operation: FREEGG_ALLOWANCE_LOG_ENDPOINT,
              field: "other.content_parts.params.quota",
              value: usdAmount,
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              target: AWARD_TARGETS.Wallet,
              fulfillment: AWARD_FULFILLMENT.Credited,
            }),
          ],
        },
        {
          timestamp: new Date(
            (record.created_at as number) * 1000,
          ).toISOString(),
        },
      )
    } catch (error) {
      if (triggerAttempted) return createUnconfirmedCheckInResult(account)
      const reason = getCheckInMethodUnknownReason(error)
      if (
        reason ===
          CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired ||
        reason === CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied
      ) {
        return {
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: reason,
          messageKey: getAutoCheckinSkipReasonTranslationKey(reason),
        }
      }
      return resolveProviderErrorResult({
        error,
      })
    }
  },
}
