import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  createFreeApiDailyCheckInStatusEndpoint,
  FREE_API_CHECK_IN_ENDPOINT,
  resolveFreeApiCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/freeApiCheckInProtocol"
import {
  classifySiblingStatusDto,
  SIBLING_DTO_VERDICTS,
} from "~/services/apiService/sub2api/checkin/siblingStatusContracts"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

export const FREE_API_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: "applied",
} as const

/**
 * This deployment keeps `code` numeric on success but switches to a string
 * (`UNAUTHORIZED`) on transport-level failures, and failure envelopes carry
 * their classification in `reason` (verified 2026-10-16 at
 * https://freeapi.site/checkin). Preserve both for the provider's mapping.
 */
const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("FreeAPI")

/**
 * https://freeapi.site/checkin on 2026-10-16 reports `checked_in_today`
 * alongside its reward window and totals. Sibling classification comes from
 * the shared discriminator table; missing or malformed status fields remain
 * unknown.
 */
export function parseFreeApiDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, FREE_API_CHECK_IN_ENDPOINT)
  if (
    Object.hasOwn(data, "checked_in_today") &&
    Object.hasOwn(data, "today_checked_in")
  ) {
    throw invalidResponse(FREE_API_CHECK_IN_ENDPOINT)
  }
  if (
    !Object.hasOwn(data, "checked_in_today") &&
    classifySiblingStatusDto(
      AUTO_CHECKIN_METHOD_IDS.FreeApiDailyCheckIn,
      data,
    ) === SIBLING_DTO_VERDICTS.Foreign
  ) {
    throw new ForeignCheckInContractError(FREE_API_CHECK_IN_ENDPOINT, data)
  }
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean"
  ) {
    throw invalidResponse(FREE_API_CHECK_IN_ENDPOINT)
  }
  return { enabled: data.enabled, checkedInToday: data.checked_in_today }
}

/**
 * `CheckInView` posts without a body and renders the granted award from
 * `result.amount`, formatted with the dashboard's USD currency formatter. The
 * field's wire type is unobserved in a live grant sample, so decimal strings
 * are accepted alongside numbers; anything else is not a claimable award.
 */
export function parseFreeApiDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, FREE_API_CHECK_IN_ENDPOINT)
  const amount = data.amount
  const parsed =
    typeof amount === "number"
      ? amount
      : typeof amount === "string" && /^\d+(?:\.\d+)?$/.test(amount)
        ? Number(amount)
        : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw invalidResponse(FREE_API_CHECK_IN_ENDPOINT)
  }
  return {
    kind: FREE_API_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    data: { rewardAmount: parsed },
  }
}

/** Reads deployment status with the same timezone query as its dashboard. */
export async function fetchFreeApiDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  const endpoint = createFreeApiDailyCheckInStatusEndpoint(
    resolveFreeApiCheckInTimezone(),
  )
  return executeAuthenticatedSub2ApiRequest(
    request,
    FREE_API_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      return parseFreeApiDailyCheckInStatusResponse(response)
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/**
 * Submit once after the provider's authoritative status gate. The dashboard
 * never posts a second time while `checked_in_today` is set, and the duplicate
 * answer this deployment would give is unverified, so any failure is left to
 * outer status reconciliation without repeating the write here.
 */
export async function performFreeApiDailyCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    FREE_API_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint: FREE_API_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseFreeApiDailyCheckInMutationResponse(response)
    },
    { recoverUnauthorized: false },
  )
}
