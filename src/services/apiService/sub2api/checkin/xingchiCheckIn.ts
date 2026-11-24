import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { compareDecimal, parseDecimal } from "~/services/amounts/decimal"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  classifySiblingStatusDto,
  SIBLING_DTO_VERDICTS,
} from "~/services/apiService/sub2api/checkin/siblingStatusContracts"
import {
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import {
  createXingchiDailyCheckInStatusEndpoint,
  resolveXingchiCheckInTimezone,
  XINGCHI_CHECK_IN_ENDPOINT,
} from "~/services/apiService/sub2api/checkin/xingchiCheckInProtocol"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("Xingchi")

/**
 * Xingchi's dashboard reads `claimed_today` on the same path that FreeAPI
 * uses for `checked_in_today`. The shared request interceptor supplies the
 * browser timezone (https://xingchiapi.com/dashboard, observed 2026-11-23).
 */
export function parseXingchiDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, XINGCHI_CHECK_IN_ENDPOINT)
  if (
    Object.hasOwn(data, "claimed_today") &&
    (Object.hasOwn(data, "checked_in_today") ||
      Object.hasOwn(data, "today_checked_in"))
  ) {
    throw invalidResponse(XINGCHI_CHECK_IN_ENDPOINT)
  }
  if (
    !Object.hasOwn(data, "claimed_today") &&
    classifySiblingStatusDto(
      AUTO_CHECKIN_METHOD_IDS.XingchiDailyCheckIn,
      data,
    ) === SIBLING_DTO_VERDICTS.Foreign
  ) {
    throw new ForeignCheckInContractError(XINGCHI_CHECK_IN_ENDPOINT, data)
  }
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.claimed_today !== "boolean"
  ) {
    throw invalidResponse(XINGCHI_CHECK_IN_ENDPOINT)
  }
  return { enabled: data.enabled, checkedInToday: data.claimed_today }
}

/** The dashboard consumes both the granted amount and updated status. */
export function parseXingchiDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, XINGCHI_CHECK_IN_ENDPOINT)
  const amount = data.amount
  const parsed = parseDecimal(amount)
  const status = parseXingchiDailyCheckInStatusResponse({
    ...response,
    body: { code: 0, message: "success", data: data.status },
  })
  if (
    !status.checkedInToday ||
    parsed === undefined ||
    compareDecimal(parsed, "0") < 0 ||
    (typeof amount === "string" && !/^\d+(?:\.\d+)?$/.test(amount))
  ) {
    throw invalidResponse(XINGCHI_CHECK_IN_ENDPOINT)
  }
  return { rewardAmount: amount as number | string }
}

const noCredentialRecovery = {
  proactiveRefresh: false,
  recoverMissingAccessToken: false,
  recoverUnauthorized: false,
}

/** Discovery is passive; only an authorized execution may renew its session. */
export async function fetchXingchiDailyCheckInStatus(
  request: ApiServiceRequest,
  options: { allowAuthenticationRecovery?: boolean } = {},
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    XINGCHI_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: createXingchiDailyCheckInStatusEndpoint(
          resolveXingchiCheckInTimezone(),
        ),
        options: { method: "GET", cache: "no-store" },
      })
      return parseXingchiDailyCheckInStatusResponse(response)
    },
    options.allowAuthenticationRecovery ? undefined : noCredentialRecovery,
  )
}

/** Authentication is prepared by the status read; the claim is never replayed. */
export async function performXingchiDailyCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions = {},
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    XINGCHI_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      if (
        options.beforeRecoveredMutation &&
        !(await options.beforeRecoveredMutation())
      ) {
        throw new Sub2ApiCheckInRecoveryBlockedError(
          SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
        )
      }
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: XINGCHI_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseXingchiDailyCheckInMutationResponse(response)
    },
    noCredentialRecovery,
  )
}
