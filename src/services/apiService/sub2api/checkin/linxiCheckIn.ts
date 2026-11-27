import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import {
  PASSIVE_CHECK_IN_AUTH,
  readAuthenticatedCheckInStatus,
  type Sub2ApiCheckInStatusAuth,
} from "~/services/apiService/sub2api/checkin/statusAuthentication"
import {
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { isCheckInObservationCurrent } from "~/services/checkin/statusObservation"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import {
  LINXI_CHECK_IN_ENDPOINT,
  LINXI_CHECK_IN_STATUS_ENDPOINT,
  LINXI_DEFAULT_RESET_TIME_ZONE,
  linxiStatusRoute,
} from "./linxiCheckInProtocol"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("Linxi")
/** Resolve the site's date to an instant within the request. */
function readCheckInDate(
  data: Record<string, unknown>,
  endpoint: string,
  requestedAt: number,
  fallbackTimeZone: string,
) {
  const resetTimeZone = data.timezone ?? fallbackTimeZone
  const day = data.check_in_date
  if (
    typeof resetTimeZone !== "string" ||
    !resetTimeZone ||
    typeof day !== "string"
  )
    throw invalidResponse(endpoint)
  try {
    const timestamp = [Date.now(), requestedAt].find(
      (instant) =>
        day === getDayKeyFromUnixSeconds(instant / 1000, resetTimeZone),
    )
    if (timestamp !== undefined) return { day, timestamp, resetTimeZone }
  } catch {
    /* An unknown site timezone cannot establish today's status. */
  }
  throw invalidResponse(endpoint)
}

/** The site's GET distinguishes a disabled feature from a claim requiring a person. */
export function parseLinxiStatus(
  response: ApiTransportResponse<unknown>,
  requestedAt = Date.now(),
) {
  const data = parseEnvelopeData(response, LINXI_CHECK_IN_STATUS_ENDPOINT)
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean" ||
    typeof data.turnstile_required !== "boolean"
  )
    throw invalidResponse(LINXI_CHECK_IN_STATUS_ENDPOINT)
  const { timestamp: observedAt, resetTimeZone } = readCheckInDate(
    data,
    LINXI_CHECK_IN_STATUS_ENDPOINT,
    requestedAt,
    LINXI_DEFAULT_RESET_TIME_ZONE,
  )
  return {
    enabled: data.enabled,
    checkedInToday: data.checked_in_today,
    requiresManualVerification: data.turnstile_required,
    observedAt,
    resetTimeZone,
  }
}

/** A fresh grant and a prior claim both require a dated, checked record. */
export function parseLinxiClaim(
  response: ApiTransportResponse<unknown>,
  requestedAt = Date.now(),
  fallbackTimeZone = LINXI_DEFAULT_RESET_TIME_ZONE,
) {
  const data = parseEnvelopeData(response, LINXI_CHECK_IN_ENDPOINT)
  const { timestamp: completedAt, ...date } = readCheckInDate(
    data,
    LINXI_CHECK_IN_ENDPOINT,
    requestedAt,
    fallbackTimeZone,
  )
  if (
    data.checked_in_today !== true ||
    typeof data.already_checked_in !== "boolean"
  )
    throw invalidResponse(LINXI_CHECK_IN_ENDPOINT)
  const completion = { ...date, completedAt }
  if (data.already_checked_in)
    return { kind: "already" as const, ...completion }
  const amount = data.reward_amount
  return {
    kind: "applied" as const,
    ...completion,
    ...(typeof amount === "number" && Number.isFinite(amount) && amount >= 0
      ? { amount }
      : {}),
    ...(data.today_pool === "paid" || data.today_pool === "free"
      ? { pool: data.today_pool }
      : {}),
  }
}

/** Discovery stays passive; an admitted execution may renew its saved authentication before GET. */
export function fetchLinxiStatus(
  request: ApiServiceRequest,
  auth: Sub2ApiCheckInStatusAuth = {},
) {
  const endpoint = linxiStatusRoute()
  return readAuthenticatedCheckInStatus(
    request,
    endpoint,
    (authenticated) => readLinxiStatus(authenticated, endpoint),
    auth,
  )
}

/** Read with the credentials and browser binding already admitted for this attempt. */
async function readLinxiStatus(request: ApiServiceRequest, endpoint: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const requestedAt = Date.now()
    const response = await fetchApiResponse(request, {
      endpoint,
      options: { method: "GET", cache: "no-store" },
    })
    const status = parseLinxiStatus(response, requestedAt)
    if (isCheckInObservationCurrent(status.observedAt, status.resetTimeZone))
      return status
  }
  throw invalidResponse(LINXI_CHECK_IN_STATUS_ENDPOINT)
}

/** Submit the ordinary claim once. Uncertain results are reconciled by the executor's GET. */
export function performLinxiClaim(
  request: ApiServiceRequest,
  admission: ReturnType<typeof parseLinxiStatus>,
  options: {
    revalidateAccount?: () => Promise<boolean>
    onAdmitted?: (mutation: {
      startedAt: number
      resetTimeZone: string
    }) => void
  } = {},
) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    LINXI_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const status = isCheckInObservationCurrent(
        admission.observedAt,
        admission.resetTimeZone,
      )
        ? admission
        : await readLinxiStatus(
            { ...authenticated, observer: undefined },
            linxiStatusRoute(),
          )
      if (
        status.checkedInToday ||
        !status.enabled ||
        status.requiresManualVerification
      )
        return { kind: "observed" as const, status }
      if (
        status !== admission &&
        options.revalidateAccount &&
        !(await options.revalidateAccount())
      )
        throw new Sub2ApiCheckInRecoveryBlockedError(
          SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
        )
      const requestedAt = Date.now()
      if (
        !isCheckInObservationCurrent(
          status.observedAt,
          status.resetTimeZone,
          requestedAt,
        )
      )
        throw new Sub2ApiCheckInRecoveryBlockedError(
          SUB2API_CHECK_IN_RECOVERY_REASONS.StatusUnavailable,
        )
      options.onAdmitted?.({
        startedAt: requestedAt,
        resetTimeZone: status.resetTimeZone,
      })
      return parseLinxiClaim(
        await fetchApiResponse(authenticated, {
          endpoint: LINXI_CHECK_IN_ENDPOINT,
          options: {
            method: "POST",
            cache: "no-store",
            body: JSON.stringify({ turnstile_token: "" }),
          },
        }),
        requestedAt,
        status.resetTimeZone,
      )
    },
    PASSIVE_CHECK_IN_AUTH,
  )
}
