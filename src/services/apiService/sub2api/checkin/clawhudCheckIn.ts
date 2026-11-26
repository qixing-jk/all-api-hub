import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import { postSub2ApiCheckIn } from "~/services/apiService/sub2api/checkin/mutationRequest"
import {
  executeSub2ApiCheckInWithRecovery,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import {
  createUserCheckInStatusEndpoint,
  resolveUserCheckInTimezone,
  USER_CHECK_IN_STATUS_ENDPOINT,
} from "~/services/apiService/sub2api/checkin/userCheckInProtocol"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

import {
  classifySiblingStatusDto,
  SIBLING_DTO_VERDICTS,
} from "./siblingStatusContracts"
import {
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "./statusAuthentication"

export const CLAWHUD_DAILY_CHECK_IN_ENDPOINT = "/api/v1/user/checkin"

/** Upstream reason carried by the duplicate-mutation error envelope. */
export const CLAWHUD_DAILY_CHECK_IN_ERROR_CODES = {
  AlreadyChecked: "CHECKIN_ALREADY_DONE",
} as const

export const CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS = {
  Applied: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
} as const

/**
 * This deployment's envelopes keep `code` numeric on success but switch to a
 * string (`UNAUTHORIZED`) on transport-level failures, and failure envelopes
 * carry their classification in `reason` (verified 2026-10-11 at
 * https://api.clawhud.com). Preserve both for the provider's mapping.
 */
const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("Clawhud")

/**
 * Deployment-owned contract observed at https://api.clawhud.com/dashboard on
 * 2026-10-11: the status DTO names its already-checked field
 * `checked_in_today`, unlike the Genius Programmer sibling that shares the
 * same path. Sibling classification comes from the shared discriminator
 * table; missing or malformed status fields remain unknown.
 */
export function parseClawhudDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, USER_CHECK_IN_STATUS_ENDPOINT)
  if (
    Object.hasOwn(data, "checked_in_today") &&
    Object.hasOwn(data, "today_checked_in")
  ) {
    throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
  }
  if (
    !Object.hasOwn(data, "checked_in_today") &&
    classifySiblingStatusDto(
      AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
      data,
    ) === SIBLING_DTO_VERDICTS.Foreign
  ) {
    throw new ForeignCheckInContractError(USER_CHECK_IN_STATUS_ENDPOINT, data)
  }
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean"
  ) {
    throw invalidResponse(USER_CHECK_IN_STATUS_ENDPOINT)
  }
  return { enabled: data.enabled, checkedInToday: data.checked_in_today }
}

/**
 * The dashboard posts without a body and reports the granted award as
 * `today_amount` (`new_balance` matched `/auth/me` on the verified grant).
 * An already-checked duplicate never reaches this success path: it answers
 * HTTP 409 with `reason: CHECKIN_ALREADY_DONE`, which surfaces through the
 * error envelope's upstream code instead.
 */
export function parseClawhudDailyCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  if (data.checked_in_today !== true) {
    throw invalidResponse(CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  }
  if (
    typeof data.today_amount !== "number" ||
    !Number.isFinite(data.today_amount) ||
    data.today_amount < 0
  ) {
    throw invalidResponse(CLAWHUD_DAILY_CHECK_IN_ENDPOINT)
  }
  return {
    kind: CLAWHUD_DAILY_CHECK_IN_RESULT_KINDS.Applied,
    data: {
      rewardAmount: data.today_amount,
      ...(typeof data.today === "string" ? { checkinDate: data.today } : {}),
      ...(typeof data.checked_in_at === "string"
        ? { checkedInAt: data.checked_in_at }
        : {}),
    },
  }
}

/** Reads deployment status with the same timezone query as its dashboard. */
export async function fetchClawhudDailyCheckInStatus(
  request: ApiServiceRequest,
  auth?: Sub2ApiCheckInStatusAuth,
) {
  const endpoint = createUserCheckInStatusEndpoint(resolveUserCheckInTimezone())
  return readAuthenticatedCheckInStatus(
    request,
    USER_CHECK_IN_STATUS_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      return parseClawhudDailyCheckInStatusResponse(response)
    },
    auth,
  )
}

/**
 * Submit once after the provider's authoritative status gate. The backend
 * answers duplicates with a classified 409 rather than a replayable failure,
 * so any other failure is left to outer status reconciliation without
 * repeating the write here.
 */
export async function performClawhudDailyCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions = {},
) {
  return executeSub2ApiCheckInWithRecovery(
    request,
    CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await postSub2ApiCheckIn(
        authenticatedRequest,
        CLAWHUD_DAILY_CHECK_IN_ENDPOINT,
      )
      return parseClawhudDailyCheckInMutationResponse(response)
    },
    fetchClawhudDailyCheckInStatus,
    options,
  )
}
