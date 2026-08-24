/**
 * WONG公益站 auto check-in provider.
 *
 * Responsibilities:
 * - Perform daily check-in directly via POST `/api/user/checkin`.
 * - Interpret backend variations (success flags, `checked_in`, and message strings)
 *   to map the result into the project-wide `CheckinResultStatus` shape.
 * - Normalize backend variations (success flags, `checked_in`, and message strings)
 *   into the project-wide `CheckinResultStatus` shape.
 */
import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import type {
  WongCheckinApiResponse,
  WongCheckinStatusData,
} from "~/services/apiService/wong"
import { fetchApi } from "~/services/apiTransport/request"
import type {
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import {
  AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS,
  AUTO_CHECKIN_USER_CHECKIN_ENDPOINT,
  getEffectiveAuthType,
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

/**
 * WONG daily check-in endpoint.
 *
 * - GET: fetch current day's check-in status.
 * - POST: perform check-in.
 */
const ENDPOINT = AUTO_CHECKIN_USER_CHECKIN_ENDPOINT

// The observed WONG deployment contract uses GET for readback and POST for
// execution on this endpoint; passive discovery must use only the GET branch.

/**
 * Call POST /api/user/checkin to perform the daily check-in.
 */
async function performCheckin(
  account: SiteAccount,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution?: AutoCheckinProviderContext["protectionBypassExecution"],
): Promise<WongCheckinApiResponse> {
  const { site_url, account_info } = account

  return await fetchApi<WongCheckinStatusData | undefined>(
    {
      baseUrl: site_url,
      accountId: account.id,
      cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
      auth: {
        authType: getEffectiveAuthType(account),
        userId: account_info.id,
        accessToken: account_info.access_token,
      },
      tempWindowRequestSource,
      ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    },
    {
      endpoint: ENDPOINT,
      options: {
        method: "POST",
        body: "{}",
      },
    },
    false,
  )
}

/**
 * Provider entry: execute check-in directly and normalize the response.
 */
async function checkinWongGongyi(
  account: SiteAccount,
  context: AutoCheckinProviderContext,
): Promise<AutoCheckinProviderResult> {
  const tempWindowRequestSource = normalizeTempWindowRequestSource(
    context.tempWindowRequestSource,
  )
  try {
    const checkinResponse = await performCheckin(
      account,
      tempWindowRequestSource,
      context.protectionBypassExecution,
    )
    const responseMessage = normalizeCheckinMessage(checkinResponse.message)

    if (checkinResponse.data?.enabled === false) {
      return {
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: "autoCheckin:providerWong.checkinDisabled",
        rawMessage: responseMessage || undefined,
        data: checkinResponse.data,
      }
    }

    if (
      (responseMessage && isAlreadyCheckedMessage(responseMessage)) ||
      checkinResponse.data?.checked_in === true
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        data: checkinResponse.data,
      }
    }

    if (checkinResponse.success) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        rawMessage: responseMessage || undefined,
        messageKey: responseMessage
          ? undefined
          : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: checkinResponse.data,
      }
    }

    return {
      status: CHECKIN_RESULT_STATUS.FAILED,
      rawMessage: responseMessage || undefined,
      messageKey: responseMessage
        ? undefined
        : AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinFailed,
      data: checkinResponse ?? undefined,
    }
  } catch (error: unknown) {
    return resolveProviderErrorResult({ error })
  }
}

/**
 * Determine whether this account has the required configuration for WONG check-in.
 */
function canCheckIn(account: SiteAccount): boolean {
  if (!account.account_info?.id) {
    return false
  }

  const authType = getEffectiveAuthType(account)

  if (authType === AuthTypeEnum.AccessToken) {
    return !!account.account_info?.access_token
  }

  return true
}

/**
 * Exported provider implementation for `site_type = wong-gongyi`.
 */
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
            authType: getEffectiveAuthType(account),
            userId: account.account_info.id,
            accessToken: account.account_info.access_token,
          },
        }
      : undefined)
  if (!statusRequest) return undefined
  const response = await fetchApi<WongCheckinStatusData | undefined>(
    statusRequest,
    {
      endpoint: ENDPOINT,
      options: { method: "GET", cache: "no-store", signal },
    },
    false,
  )
  if (
    typeof response.data?.enabled !== "boolean" ||
    typeof response.data.checked_in !== "boolean" ||
    (!response.success && response.data.checked_in !== true)
  )
    return undefined
  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    availability:
      response.data.enabled === false
        ? CHECK_IN_METHOD_AVAILABILITIES.Disabled
        : CHECK_IN_METHOD_AVAILABILITIES.Enabled,
    today: response.data.checked_in
      ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
      : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    evidence: {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
      observedAt,
    },
  }
}

export const wongGongyiProvider: AutoCheckinProvider = {
  canCheckIn,
  detect: (context) => detectWithStatusReadback(context, getStatus),
  getStatus,
  checkIn: checkinWongGongyi,
}
