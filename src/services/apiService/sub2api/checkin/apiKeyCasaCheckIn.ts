import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { postSub2ApiCheckIn } from "~/services/apiService/sub2api/checkin/mutationRequest"
import {
  readSub2ApiCheckInAdmission,
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { isCheckInObservationCurrent } from "~/services/checkin/statusObservation"

import {
  API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE,
  API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT,
  createApiKeyCasaDailyCheckInStatusEndpoint,
} from "./apiKeyCasaCheckInProtocol"
import {
  PASSIVE_CHECK_IN_AUTH,
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "./statusAuthentication"

const { parseEnvelopeData, invalidResponse } = createCheckInCodeEnvelopeParser(
  "ApiKey Casa",
  { preserveHttpStatusForUnknownEnvelope: true },
)

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

/** Reads the native status using credentials already admitted for this request. */
async function readAuthenticatedStatus(
  request: ApiServiceRequest,
  endpoint = createApiKeyCasaDailyCheckInStatusEndpoint(),
) {
  const response = await fetchApiResponse(request, {
    endpoint,
    options: { method: "GET", cache: "no-store" },
  })
  return parseApiKeyCasaDailyCheckInStatusResponse(response)
}

/** Only an authorized execution may renew credentials while reading eligibility. */
export function fetchApiKeyCasaDailyCheckInStatus(
  request: ApiServiceRequest,
  options?: Sub2ApiCheckInStatusAuth,
) {
  const endpoint = createApiKeyCasaDailyCheckInStatusEndpoint()
  return readAuthenticatedCheckInStatus(
    request,
    endpoint,
    (authenticated) => readAuthenticatedStatus(authenticated, endpoint),
    options,
  )
}

/** The server's duplicate behavior is unknown. Leave reconciliation to status readback. */
export function performApiKeyCasaDailyCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions & { statusObservedAt?: number } = {},
) {
  const endpoint = API_KEY_CASA_DAILY_CHECK_IN_ENDPOINT
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticatedRequest) => {
      const revalidate = async () => {
        if (
          options.beforeRecoveredMutation &&
          !(await options.beforeRecoveredMutation())
        ) {
          throw new Sub2ApiCheckInRecoveryBlockedError(
            SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
          )
        }
      }
      await revalidate()
      if (
        options.statusObservedAt !== undefined &&
        !isCheckInObservationCurrent(
          options.statusObservedAt,
          API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE,
        )
      ) {
        const observedAt = await readSub2ApiCheckInAdmission(
          authenticatedRequest,
          readAuthenticatedStatus,
          undefined,
          API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE,
        )
        await revalidate()
        if (
          !isCheckInObservationCurrent(
            observedAt,
            API_KEY_CASA_CHECK_IN_RESET_TIME_ZONE,
          )
        )
          throw new Sub2ApiCheckInRecoveryBlockedError(
            SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable,
          )
      }
      const response = await postSub2ApiCheckIn(authenticatedRequest, endpoint)
      if (!parseApiKeyCasaDailyCheckInStatusResponse(response).checkedInToday) {
        throw invalidResponse(endpoint)
      }
    },
    PASSIVE_CHECK_IN_AUTH,
  )
}
