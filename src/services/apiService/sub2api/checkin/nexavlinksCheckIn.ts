import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { createCheckInCodeEnvelopeParser } from "~/services/apiService/sub2api/checkin/codeEnvelope"
import {
  createNexaVlinksCheckInStatusEndpoint,
  NEXAVLINKS_CHECK_IN_ENDPOINT,
  resolveNexaVlinksCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/nexavlinksCheckInProtocol"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"

const { parseEnvelopeData, invalidResponse } =
  createCheckInCodeEnvelopeParser("NexaVlinks")

const toSettingsRecord = (value: unknown): Record<string, unknown> | null => {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Status DTO observed at https://asia.nexavlinks.com/check-in on 2026-10-17.
 *
 * Unlike the sibling FreeAPI/Clawhud contracts this one carries no `enabled`
 * flag: it reports `eligible`, which stays false until today's or yesterday's
 * usage clears the deployment's threshold. An account already checked in today
 * still owns an enabled method, so eligibility alone cannot decide
 * availability.
 */
export function parseNexaVlinksCheckInStatusResponse(
  response: ApiTransportResponse<unknown>,
) {
  const endpoint = createNexaVlinksCheckInStatusEndpoint(
    resolveNexaVlinksCheckInTimezone(),
  )
  const data = parseEnvelopeData(response, endpoint)
  if (typeof data.checked_in_today !== "boolean") {
    throw invalidResponse(endpoint)
  }
  if (data.eligible !== undefined && typeof data.eligible !== "boolean") {
    throw invalidResponse(endpoint)
  }
  if (
    data.settings !== undefined &&
    data.settings !== null &&
    toSettingsRecord(data.settings) === null
  ) {
    throw invalidResponse(endpoint)
  }

  const eligible = data.eligible !== false
  return {
    enabled: data.checked_in_today || eligible,
    checkedInToday: data.checked_in_today,
  }
}

/**
 * Reads today's state without mutating it.
 *
 * The deployment shares the read and the claim path, and only GET is
 * side-effect free, so this is the sole discovery and status route.
 */
export async function fetchNexaVlinksDailyCheckInStatus(
  request: ApiServiceRequest,
) {
  const endpoint = createNexaVlinksCheckInStatusEndpoint(
    resolveNexaVlinksCheckInTimezone(),
  )
  return executeAuthenticatedSub2ApiRequest(
    request,
    NEXAVLINKS_CHECK_IN_ENDPOINT,
    async (authenticatedRequest) => {
      const response = await fetchApiResponse<unknown>(authenticatedRequest, {
        endpoint,
        options: { method: "GET", cache: "no-store" },
      })
      return parseNexaVlinksCheckInStatusResponse(response)
    },
    {
      proactiveRefresh: false,
      recoverMissingAccessToken: false,
      recoverUnauthorized: false,
    },
  )
}
