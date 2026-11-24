import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { createCheckInCodeEnvelopeParser } from "./codeEnvelope"
import {
  createLoxoCheckInStatusEndpoint,
  LOXO_CHECK_IN_ENDPOINT,
} from "./loxoCheckInProtocol"
import { resolveUserCheckInTimezone } from "./userCheckInProtocol"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("Loxo")
const passiveAuth = {
  proactiveRefresh: false,
  recoverMissingAccessToken: false,
  recoverUnauthorized: false,
} as const

/** Passive by default; admitted execution reads may use the existing auth lifecycle. */
export function fetchLoxoCheckInStatus(
  request: ApiServiceRequest,
  options: { allowAuthenticationRecovery?: boolean } = {},
) {
  const endpoint = createLoxoCheckInStatusEndpoint(resolveUserCheckInTimezone())
  return executeAuthenticatedSub2ApiRequest(
    request,
    LOXO_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse(authenticated, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      const data = parseEnvelopeData(response, LOXO_CHECK_IN_ENDPOINT)
      if (
        typeof data.enabled !== "boolean" ||
        typeof data.checked_in_today !== "boolean" ||
        typeof data.captcha_required !== "boolean"
      )
        throw invalidResponse(LOXO_CHECK_IN_ENDPOINT)
      return {
        enabled: data.enabled,
        checkedInToday: data.checked_in_today,
        requiresManualVerification: data.captcha_required,
      }
    },
    options.allowAuthenticationRecovery ? {} : passiveAuth,
  )
}

/** Submit the ordinary, unchallenged claim once. The executor reconciles an uncertain response by GET. */
export function performLoxoCheckIn(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    LOXO_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse(authenticated, {
        endpoint: LOXO_CHECK_IN_ENDPOINT,
        options: {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({}),
        },
      })
      const data = parseEnvelopeData(response, LOXO_CHECK_IN_ENDPOINT)
      if (
        typeof data.reward !== "number" ||
        !Number.isFinite(data.reward) ||
        data.reward < 0 ||
        typeof data.streak_days !== "number" ||
        !Number.isSafeInteger(data.streak_days) ||
        data.streak_days < 1
      )
        throw invalidResponse(LOXO_CHECK_IN_ENDPOINT)
      return { reward: data.reward, streakDays: data.streak_days }
    },
    passiveAuth,
  )
}
