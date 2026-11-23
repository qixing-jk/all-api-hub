import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  fetchFreeggAllowanceLogs,
  fetchFreeggPublicStatus,
  freeggLogId,
  isFreeggAllowanceRecord,
  triggerFreeggDailyAllowance,
} from "~/services/apiService/newApiFamily/variants/freeggDailyAllowance"
import {
  FREEGG_ALLOWANCE_LOG_ENDPOINT,
  FREEGG_DAILY_ALLOWANCE_ORIGINS,
} from "~/services/apiService/newApiFamily/variants/freeggDailyAllowanceConfig"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import {
  createUnconfirmedCheckInResult,
  withCheckInResponseConfirmation,
} from "~/services/checkin/autoCheckin/confirmation"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import type { AutoCheckinProvider } from "./contracts"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  readQuotaAwards,
  resolveProviderErrorResult,
} from "./shared"

/** Only the deployment whose public assets expose daily_allowance_setting. */
function isFreeggUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "")
    return (
      !url.username &&
      !url.password &&
      FREEGG_DAILY_ALLOWANCE_ORIGINS.some((origin) => origin === url.origin)
    )
  } catch {
    return false
  }
}

/**
 * FreeGG v1.0.0-rc.49 has a daily allowance separate from checkin_enabled.
 * The public console describes a fixed grant on the first authenticated visit.
 * Execution reference: https://github.com/ZHT0711/egern-freegg-login (v2.0.0).
 * That script's top-up/positive-balance fallbacks are deliberately not evidence.
 *
 * No reset timezone or authoritative today field is public. Historical logs
 * therefore cannot establish today's state. Until that contract is available,
 * only a new, account-matched grant within this execution interval is confirmed.
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
  // No getStatus: a local-calendar interpretation of old logs would falsely
  // imply a verified site day. Discovery and refresh must never call self.
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
      const before = await fetchFreeggAllowanceLogs(request)
      if (
        before.some(
          (item) =>
            item.user_id !== undefined &&
            String(item.user_id) !== String(account.account_info.id),
        )
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      const previousIds = new Set(before.map((item) => freeggLogId(item.id)))
      const startedAt = Math.floor(Date.now() / 1000)
      triggerAttempted = true
      let identity: unknown
      let triggerResponseLost = false
      try {
        identity = await triggerFreeggDailyAllowance({
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
        (!identity || String(identity) !== expectedIdentity)
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      const after = await fetchFreeggAllowanceLogs(request)
      if (
        after.some(
          (item) =>
            item.user_id !== undefined &&
            String(item.user_id) !== expectedIdentity,
        ) ||
        (triggerResponseLost &&
          ![...before, ...after].some(
            (item) => String(item.user_id) === expectedIdentity,
          ))
      ) {
        return createUnconfirmedCheckInResult(account)
      }
      const completedAt = Math.floor(Date.now() / 1000)
      const record = after.find((item) => {
        const id = freeggLogId(item.id)
        return (
          id !== undefined &&
          !previousIds.has(id) &&
          isFreeggAllowanceRecord(item) &&
          (item.user_id === undefined ||
            String(item.user_id) === expectedIdentity) &&
          typeof item.created_at === "number" &&
          Number.isInteger(item.created_at) &&
          item.created_at >= startedAt &&
          item.created_at <= completedAt
        )
      })
      if (!record) return createUnconfirmedCheckInResult(account)
      const quota =
        typeof record.quota === "number" &&
        Number.isFinite(record.quota) &&
        record.quota > 0
          ? record.quota
          : undefined
      return withCheckInResponseConfirmation(
        account,
        {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
          awards: readQuotaAwards(account, quota, {
            id: String(record.id),
            operation: FREEGG_ALLOWANCE_LOG_ENDPOINT,
            field: "quota",
          }),
        },
        {
          timestamp: new Date(
            (record.created_at as number) * 1000,
          ).toISOString(),
        },
      )
    } catch (error) {
      return resolveProviderErrorResult({
        error,
        mutationDispatched: triggerAttempted,
      })
    }
  },
}
