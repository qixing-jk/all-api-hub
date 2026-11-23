import { compareDecimal, parseDecimal } from "~/services/amounts/decimal"
import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import {
  CHATFLOWS_CHECK_IN_ENDPOINT,
  CHATFLOWS_CHECK_IN_STATUS_ENDPOINT,
  getChatflowsCheckInPeriodBounds,
} from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import {
  executeSub2ApiCheckInWithRecovery,
  type Sub2ApiCheckInRecoveryOptions,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("ChatflowsAI")

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

/** The standalone page checks numeric code and allows an absent message. */
function parseData(response: ApiTransportResponse<unknown>, endpoint: string) {
  const envelope = toRecord(response.body)
  return parseEnvelopeData(
    {
      ...response,
      ...(response.ok && envelope?.code === 401
        ? { ok: false, status: 401 }
        : {}),
      body: envelope
        ? { ...envelope, message: envelope.message ?? "" }
        : response.body,
    },
    endpoint,
  )
}

/**
 * Public /checkin/ inline script, observed 2026-11-24: can_checkin describes
 * the current noon-to-noon period, not the reader's calendar day. There is no
 * enablement flag. Keep the server period and reject an expired status rather
 * than projecting yesterday's completed period onto a new one.
 */
export function parseChatflowsCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const data = parseData(response, CHATFLOWS_CHECK_IN_STATUS_ENDPOINT)
  const currentPeriod = getChatflowsCheckInPeriodBounds(Date.now())
  const nextResetAt =
    typeof data.next_reset_at === "string"
      ? Date.parse(data.next_reset_at)
      : Number.NaN
  if (
    typeof data.can_checkin !== "boolean" ||
    data.period_key !== currentPeriod.periodKey ||
    nextResetAt !== currentPeriod.nextResetAt
  ) {
    throw invalidResponse(CHATFLOWS_CHECK_IN_STATUS_ENDPOINT)
  }
  return {
    enabled: true,
    checkedInToday: !data.can_checkin,
    periodKey: data.period_key,
    nextResetAt,
  }
}

/** HTTP/envelope 409 is a duplicate; only a valid returned amount is a grant. */
export function parseChatflowsCheckInMutationResponse(
  response: ApiTransportResponse<unknown>,
) {
  // The page's API wrapper handles authentication before the click handler
  // interprets duplicates, including mixed HTTP/envelope errors.
  if (response.status === 401 || toRecord(response.body)?.code === 401) {
    parseData(response, CHATFLOWS_CHECK_IN_ENDPOINT)
  }
  if (response.status === 409 || toRecord(response.body)?.code === 409) {
    return { kind: "already_checked" as const }
  }
  const data = parseData(response, CHATFLOWS_CHECK_IN_ENDPOINT)
  const amount = parseDecimal(data.amount)
  if (amount === undefined || compareDecimal(amount, "0") < 0) {
    throw invalidResponse(CHATFLOWS_CHECK_IN_ENDPOINT)
  }
  return { kind: "applied" as const, amount: data.amount as string | number }
}

/** Discovery never refreshes credentials, opens login, or sends a mutation. */
export async function fetchChatflowsCheckInStatus(request: ApiServiceRequest) {
  return executeAuthenticatedSub2ApiRequest(
    request,
    CHATFLOWS_CHECK_IN_STATUS_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: CHATFLOWS_CHECK_IN_STATUS_ENDPOINT,
        options: { method: "GET", cache: "no-store" },
      })
      return parseChatflowsCheckInStatusResponse(response)
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}

/** Match the page's empty-body POST; only guarded middleware-401 may recover. */
export async function performChatflowsCheckIn(
  request: ApiServiceRequest,
  options: Sub2ApiCheckInRecoveryOptions = {},
) {
  return executeSub2ApiCheckInWithRecovery(
    request,
    CHATFLOWS_CHECK_IN_ENDPOINT,
    async (authenticated) => {
      const response = await fetchApiResponse<unknown>(authenticated, {
        endpoint: CHATFLOWS_CHECK_IN_ENDPOINT,
        options: { method: "POST", cache: "no-store" },
      })
      return parseChatflowsCheckInMutationResponse(response)
    },
    fetchChatflowsCheckInStatus,
    options,
  )
}
