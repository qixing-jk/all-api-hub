/**
 * Veloera auto check-in provider.
 *
 * Endpoint: POST `/api/user/check_in`.
 */

import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { fetchApi, fetchApiData } from "~/services/apiTransport/request"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  isAlreadyCheckedMessage,
  normalizeCheckinMessage,
  resolveProviderErrorResult,
} from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"

type CheckinResult = AutoCheckinProviderResult

const ENDPOINT = "/api/user/check_in"

// https://github.com/Veloera/Veloera — /api/user/check_in_status is the
// provider-owned read-only capability/status endpoint.

/**
 * Perform check-in for a Veloera account
 * @param account - The site account to check in
 * @returns Check-in result with status and message
 */
async function checkinVeloera(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<CheckinResult> {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  const protectionBypassExecution = context.protectionBypassExecution
  const { site_url, account_info, authType } = account

  try {
    // Call the check-in API endpoint
    const response = await fetchApi<unknown>(
      {
        baseUrl: site_url,
        accountId: account.id,
        cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
        auth: {
          authType,
          userId: account_info.id,
          accessToken: account_info.access_token,
        },
        tempWindowRequestSource,
        ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
      },
      {
        endpoint: ENDPOINT,
        options: { method: "POST" },
      },
    )

    const responseMessage = normalizeCheckinMessage(response?.message)

    // Check if response.message indicates already checked in
    if (responseMessage && isAlreadyCheckedMessage(responseMessage)) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        data: response.data ?? undefined,
      }
    }

    // Success case
    if (response.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: response.data,
      }
    }

    // Other failure cases
    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: response ?? undefined,
    }
  } catch (error: unknown) {
    return resolveProviderErrorResult({ error: getErrorMessage(error) })
  }
}

/**
 * Check if an account can be checked in
 * @param account - The site account to check
 * @returns true if account meets check-in requirements
 */
function canCheckIn(account: SiteAccount): boolean {
  if (!account.account_info?.id) {
    return false
  }

  const authType = account.authType

  if (authType === AuthTypeEnum.AccessToken) {
    return Boolean(account.account_info?.access_token)
  }

  return true
}

const getStatus: NonNullable<AutoCheckinProvider["getStatus"]> = async ({
  account,
  request,
  observedAt,
  signal,
}) => {
  const statusRequest =
    request ??
    (account
      ? {
          baseUrl: account.site_url,
          accountId: account.id,
          cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
          auth: {
            authType: account.authType,
            userId: account.account_info.id,
            accessToken: account.account_info.access_token,
          },
        }
      : undefined)
  if (!statusRequest) return undefined
  const data = await fetchApiData<{ can_check_in?: boolean }>(statusRequest, {
    endpoint: "/api/user/check_in_status",
    ...(signal ? { options: { signal } } : {}),
  })
  return typeof data.can_check_in === "boolean"
    ? {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        today: data.can_check_in
          ? CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
          : CHECK_IN_METHOD_TODAY_STATUSES.Checked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt,
        },
      }
    : undefined
}

export const veloeraProvider: AutoCheckinProvider = {
  canCheckIn,
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  checkIn: checkinVeloera,
}
