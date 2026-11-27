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
  fetchFreeggPublicStatus,
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
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { accountAward } from "~/services/checkin/autoCheckin/awards"
import {
  createUnconfirmedCheckInResult,
  withCheckInConfirmation,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import {
  isCheckInObservationCurrent,
  readDayStableCheckInObservation,
} from "~/services/checkin/statusObservation"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import type { AutoCheckinProvider } from "./contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  resolveProviderErrorResult,
} from "./shared"

/**
 * FreeGG v1.0.0-rc.49 has a daily allowance separate from checkin_enabled.
 * The public console describes a fixed grant on the first authenticated visit.
 * Verified protocol observations: .scratch/freegg-daily-allowance/spec.md.
 *
 * Live observations establish UTC+8 days and structured type-1 grants. Log IDs
 * are presentation positions; timestamped account evidence confirms a claim.
 */
export const freeggProvider: AutoCheckinProvider = {
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
    const baseUrl = context.account?.site_url ?? context.request?.baseUrl
    let matched = false
    if (isFreeggUrl(baseUrl)) {
      const response = await fetchFreeggPublicStatus({
        baseUrl: baseUrl!,
        auth: { authType: AuthTypeEnum.None },
        directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
        abortSignal: context.signal,
      })
      matched =
        response.success === true && response.data?.system_name === "FreeGG"
    }
    return {
      outcome: matched
        ? CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
        : CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      evidence: {
        source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
        observedAt: context.observedAt,
      },
    }
  },
  async getStatus({ account, request, observedAt, signal }) {
    if (!request && account && !this.getReadiness(account).ready) return
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
    const unknown = () => ({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
      attemptedAt: observedAt,
    })
    const composed = composeAbortSignals([signal, source.abortSignal])
    try {
      const stable = await readDayStableCheckInObservation(
        () =>
          fetchFreeggAllowanceLogs({
            baseUrl: source.baseUrl,
            auth: source.auth,
            accountId: source.accountId,
            siteType: source.siteType,
            directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
            abortSignal: composed.signal,
          }),
        FREEGG_ALLOWANCE_RESET_TIME_ZONE,
      )
      if (!stable) return unknown()
      const { records, complete, serverTime } = stable.observation
      observedAt = stable.observedAt
      if (
        serverTime !== undefined &&
        !isCheckInObservationCurrent(
          serverTime,
          FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          observedAt,
        )
      )
        return unknown()
      const businessDay = getDayKeyFromUnixSeconds(
        observedAt / 1000,
        FREEGG_ALLOWANCE_RESET_TIME_ZONE,
      )
      if (
        records.some(
          (r) =>
            !isValidFreeggLog(r, source.auth.userId, serverTime ?? Date.now()),
        )
      )
        return unknown()
      const checked = records.some(
        (r) =>
          isFreeggAllowanceRecord(r) &&
          getDayKeyFromUnixSeconds(
            r.created_at as number,
            FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          ) === businessDay,
      )
      if (!checked && !complete) return unknown()
      return {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        today: checked
          ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
          : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        resetTimeZone: FREEGG_ALLOWANCE_RESET_TIME_ZONE,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt,
        },
      }
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
    if (!this.getReadiness(account).ready) {
      return createUnconfirmedCheckInResult(account)
    }
    let triggerAttempted = false
    try {
      const storedRequest =
        createAccountApiRequestFromStoredAccount(account).request
      // Direct token requests only: even opening a recovery page could credit
      // the allowance before the explicit trigger or issue it for another user.
      const request = {
        baseUrl: account.site_url,
        accountId: account.id,
        siteType: account.site_type,
        auth: storedRequest.auth,
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
      }
      const baselineRequestedAt = Date.now()
      const baseline = await fetchFreeggAllowanceLogs(request)
      if (
        !baseline.complete ||
        (baseline.serverTime !== undefined &&
          !isCheckInObservationCurrent(
            baseline.serverTime,
            FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          ))
      )
        return createUnconfirmedCheckInResult(account)
      const before = baseline.records
      if (
        before.some(
          (r) =>
            !isValidFreeggLog(
              r,
              account.account_info.id,
              baseline.serverTime ?? Date.now(),
            ),
        )
      )
        return createUnconfirmedCheckInResult(account)
      const day = getDayKeyFromUnixSeconds(
        Date.now() / 1000,
        FREEGG_ALLOWANCE_RESET_TIME_ZONE,
      )
      const already = before.find(
        (item) =>
          isFreeggAllowanceRecord(item) &&
          getDayKeyFromUnixSeconds(
            item.created_at as number,
            FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          ) === day,
      )
      if (already)
        return withCheckInConfirmation(
          account,
          {
            status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
            messageKey:
              AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
          },
          {
            kind: "observed",
            status: {
              outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
              today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
              resetTimeZone: FREEGG_ALLOWANCE_RESET_TIME_ZONE,
              evidence: {
                source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
                observedAt: Date.now(),
              },
            },
          },
        )
      if (
        context.beforeRecoveredMutation &&
        !(await context.beforeRecoveredMutation())
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      if (
        getDayKeyFromUnixSeconds(
          Date.now() / 1000,
          FREEGG_ALLOWANCE_RESET_TIME_ZONE,
        ) !== day
      )
        return createUnconfirmedCheckInResult(account)
      // HTTP Date and ledger events have second precision. Include the entire
      // baseline request interval and elapsed admission time in the server-clock
      // bound. A record in the ambiguous dispatch second cannot prove new income.
      let startedAt: number | undefined
      const dispatchAbort = new AbortController()
      triggerAttempted = true
      let response: Awaited<ReturnType<typeof triggerFreeggDailyAllowance>>
      let triggerResponseLost = false
      try {
        response = await triggerFreeggDailyAllowance({
          ...request,
          abortSignal: dispatchAbort.signal,
          observer: {
            ...context.mutationLifecycle,
            onDispatch() {
              if (
                getDayKeyFromUnixSeconds(
                  Date.now() / 1000,
                  FREEGG_ALLOWANCE_RESET_TIME_ZONE,
                ) !== day
              ) {
                dispatchAbort.abort(
                  new Error("FreeGG baseline day expired before dispatch"),
                )
                return
              }
              startedAt =
                baseline.serverTime === undefined
                  ? Math.floor(Date.now() / 1000) + 1
                  : Math.ceil(
                      (baseline.serverTime +
                        1000 +
                        Date.now() -
                        baselineRequestedAt) /
                        1000,
                    )
              context.mutationLifecycle?.onDispatch()
            },
            onResponse() {
              context.mutationLifecycle?.onResponse()
            },
          },
        })
      } catch {
        // A lost response may have credited the grant. Read logs once below;
        // never replay self and never assume its missing identity matched.
        triggerResponseLost = true
      }
      if (startedAt === undefined)
        return createUnconfirmedCheckInResult(account)
      const expectedIdentity = String(account.account_info.id)
      if (
        !triggerResponseLost &&
        (!response?.id || String(response.id) !== expectedIdentity)
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      const readback = await fetchFreeggAllowanceLogs(request)
      if (
        !readback.complete ||
        (readback.serverTime !== undefined &&
          !isCheckInObservationCurrent(
            readback.serverTime,
            FREEGG_ALLOWANCE_RESET_TIME_ZONE,
          ))
      )
        return createUnconfirmedCheckInResult(account)
      const after = readback.records
      if (
        after.some(
          (r) =>
            !isValidFreeggLog(
              r,
              account.account_info.id,
              readback.serverTime ?? Date.now(),
            ),
        )
      )
        return createUnconfirmedCheckInResult(account)
      const completedAt = Math.floor((readback.serverTime ?? Date.now()) / 1000)
      const record = after.find(
        (item) =>
          isFreeggAllowanceRecord(item) &&
          (!triggerResponseLost || String(item.user_id) === expectedIdentity) &&
          (item.created_at as number) >= startedAt! &&
          (item.created_at as number) <= completedAt,
      )
      if (!record) return createUnconfirmedCheckInResult(account)
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
      return resolveProviderErrorResult({
        error,
      })
    }
  },
}
