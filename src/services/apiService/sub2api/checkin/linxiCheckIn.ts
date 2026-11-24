import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import {
  LINXI_CHECK_IN_ENDPOINT,
  LINXI_CHECK_IN_STATUS_ENDPOINT,
  linxiStatusRoute,
} from "./linxiCheckInProtocol"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("Linxi")
const passiveAuth = {
  proactiveRefresh: false,
  recoverMissingAccessToken: false,
  recoverUnauthorized: false,
} as const

/** The native calendar uses check_in_date; both observed deployments default to Asia/Shanghai. */
function checkInDay(data: Record<string, unknown>, endpoint: string) {
  const zone = data.timezone ?? "Asia/Shanghai"
  if (
    typeof zone !== "string" ||
    !zone ||
    typeof data.check_in_date !== "string"
  )
    throw invalidResponse(endpoint)
  try {
    if (
      data.check_in_date === getDayKeyFromUnixSeconds(Date.now() / 1000, zone)
    )
      return data.check_in_date
  } catch {
    /* An unknown site timezone cannot establish today's status. */
  }
  throw invalidResponse(endpoint)
}

/** The site's GET distinguishes a disabled feature from a claim requiring a person. */
export function parseLinxiStatus(response: ApiTransportResponse<unknown>) {
  const data = parseEnvelopeData(response, LINXI_CHECK_IN_STATUS_ENDPOINT)
  if (
    typeof data.enabled !== "boolean" ||
    typeof data.checked_in_today !== "boolean" ||
    typeof data.turnstile_required !== "boolean"
  )
    throw invalidResponse(LINXI_CHECK_IN_STATUS_ENDPOINT)
  checkInDay(data, LINXI_CHECK_IN_STATUS_ENDPOINT)
  return {
    enabled: data.enabled,
    checkedInToday: data.checked_in_today,
    requiresManualVerification: data.turnstile_required,
  }
}

/** A fresh grant and a prior claim both require a dated, checked record. */
export function parseLinxiClaim(response: ApiTransportResponse<unknown>) {
  const data = parseEnvelopeData(response, LINXI_CHECK_IN_ENDPOINT)
  const day = checkInDay(data, LINXI_CHECK_IN_ENDPOINT)
  if (
    data.checked_in_today !== true ||
    typeof data.already_checked_in !== "boolean"
  )
    throw invalidResponse(LINXI_CHECK_IN_ENDPOINT)
  if (data.already_checked_in) return { kind: "already" as const, day }
  const amount = data.reward_amount
  return {
    kind: "applied" as const,
    day,
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
  options: { allowAuthenticationRecovery?: boolean } = {},
) {
  const endpoint = linxiStatusRoute()
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authenticated) =>
      parseLinxiStatus(
        await fetchApiResponse(authenticated, {
          endpoint,
          options: { method: "GET", cache: "no-store" },
        }),
      ),
    options.allowAuthenticationRecovery ? {} : passiveAuth,
  )
}

/** Submit the ordinary claim once. Uncertain results are reconciled by the executor's GET. */
export function performLinxiClaim(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    LINXI_CHECK_IN_ENDPOINT,
    async (authenticated) =>
      parseLinxiClaim(
        await fetchApiResponse(authenticated, {
          endpoint: LINXI_CHECK_IN_ENDPOINT,
          options: {
            method: "POST",
            cache: "no-store",
            body: JSON.stringify({ turnstile_token: "" }),
          },
        }),
      ),
    passiveAuth,
  )
}
