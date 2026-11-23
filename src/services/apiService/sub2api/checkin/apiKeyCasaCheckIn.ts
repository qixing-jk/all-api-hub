import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import {
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

import {
  API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT,
  createApiKeyCasaDailyCheckInStatusEndpoint,
} from "./apiKeyCasaCheckInProtocol"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("ApiKey Casa")

/** The native /redeem view uses the same status DTO after GET and POST. */
export function parseApiKeyCasaDailyCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseEnvelopeData(response, API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT)
  if (
    typeof data.checked_in !== "boolean" ||
    typeof data.reward !== "number" ||
    !Number.isFinite(data.reward) ||
    data.reward < 0
  ) {
    throw invalidResponse(API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT)
  }
  return { enabled: data.reward > 0, checkedInToday: data.checked_in }
}

const noCredentialRecovery = {
  proactiveRefresh: false,
  recoverMissingAccessToken: false,
  recoverUnauthorized: false,
}

/** Read today's eligibility without renewing or recovering credentials. */
export function fetchApiKeyCasaDailyCheckInStatus(request: ApiServiceRequest) {
  const endpoint = createApiKeyCasaDailyCheckInStatusEndpoint()
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse(authenticatedRequest, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      return parseApiKeyCasaDailyCheckInStatusResponse(response)
    },
    noCredentialRecovery,
  )
}

/** The server's duplicate behavior is unknown. Leave reconciliation to status readback. */
export function performApiKeyCasaDailyCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions = {},
) {
  const endpoint = API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticatedRequest) => {
      if (
        options.beforeRecoveredMutation &&
        !(await options.beforeRecoveredMutation())
      ) {
        throw new Sub2ApiCheckInRecoveryBlockedError(
          SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
        )
      }
      const response = await fetchApiResponse(authenticatedRequest, {
        endpoint,
        options: { method: "POST", cache: "no-store" },
      })
      if (!parseApiKeyCasaDailyCheckInStatusResponse(response).checkedInToday) {
        throw invalidResponse(endpoint)
      }
    },
    noCredentialRecovery,
  )
}
