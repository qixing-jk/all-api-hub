/**
 * Veloera auto check-in provider.
 *
 * Endpoint: POST `/api/user/check_in`.
 */

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { fetchSupportCheckIn } from "~/services/apiService/newApiFamily/variants/veloeraCheckIn"
import { fetchApi, fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
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
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import { normalizeTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"

import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "./contracts"
import { detectWithStatusReadback } from "./detection"

type CheckinResult = AutoCheckinProviderResult

const ENDPOINT = "/api/user/check_in"

// Veloera exposes the global switch through /api/status and today's state
// through /api/user/check_in_status. Keep these independent: `can_check_in`
// alone cannot prove that the site has enabled the feature.
// https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/user.go

const createRequest = (
  account: SiteAccount,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: AutoCheckinProviderContext["protectionBypassExecution"],
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
  auth: {
    authType: account.authType,
    userId: account.account_info.id,
    accessToken: account.account_info.access_token,
  },
  ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
  ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
})

type VeloeraCheckInObservation = {
  enabled?: boolean
  canCheckIn?: boolean
}

/** Read the independent deployment switch and current user's daily state. */
async function fetchCheckInObservation(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<VeloeraCheckInObservation | undefined> {
  const enabled = await fetchSupportCheckIn(request)
  if (enabled === false) return { enabled }

  const data = await fetchApiData<{ can_check_in?: boolean }>(request, {
    endpoint: "/api/user/check_in_status",
    ...(signal ? { options: { signal } } : {}),
  })
  if (typeof data.can_check_in === "boolean") {
    return { enabled, canCheckIn: data.can_check_in }
  }

  return enabled === true ? { enabled } : undefined
}

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
  const request = createRequest(
    account,
    tempWindowRequestSource,
    context.protectionBypassExecution,
  )

  try {
    // Call the check-in API endpoint
    const response = await fetchApi<unknown>(request, {
      endpoint: ENDPOINT,
      options: { method: "POST" },
    })

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

    // Veloera's failure copy is deployment-controlled. Confirm the current
    // state before deciding whether an arbitrary message means "already".
    try {
      const observation = await fetchCheckInObservation(request)
      if (observation?.canCheckIn === false) {
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          rawMessage: responseMessage || undefined,
          data: response.data ?? undefined,
        }
      }
    } catch {
      // Preserve the original mutation failure if best-effort readback fails.
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: response ?? undefined,
    }
  } catch (error: unknown) {
    return resolveProviderErrorResult({ error })
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
  const observation = await fetchCheckInObservation(statusRequest, signal)
  if (!observation) return undefined

  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    ...(observation.enabled !== undefined
      ? {
          availability: observation.enabled
            ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
            : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        }
      : {}),
    ...(observation.canCheckIn !== undefined
      ? {
          today: observation.canCheckIn
            ? CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
            : CHECK_IN_METHOD_TODAY_STATUSES.Checked,
        }
      : {}),
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

export const veloeraProvider: AutoCheckinProvider = {
  canCheckIn,
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  checkIn: checkinVeloera,
}
