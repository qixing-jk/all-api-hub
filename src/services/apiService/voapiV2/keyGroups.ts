import { fetchVoApiV2Data } from "~/services/apiService/voapiV2/dashboardRequest"
import {
  VOAPI_V2_ENDPOINTS,
  type VoApiV2KeyGroupDescriptor,
  type VoApiV2KeyTemplate,
} from "~/services/apiService/voapiV2/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { type ApiServiceRequest } from "~/services/apiTransport/type"

/**
 * Fetches VoAPI v2 key creation metadata, including groups and model ids.
 */
const fetchVoApiV2Template = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2KeyTemplate>(
    request,
    VOAPI_V2_ENDPOINTS.KeyTemplate,
    { cache: "no-store" },
  )

export const toCanonicalPositiveInteger = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && String(parsed) === value
    ? parsed
    : null
}

/** Returns strict native group identities from the VoAPI v2 key template. */
export async function fetchVoApiV2KeyGroupDescriptors(
  request: ApiServiceRequest,
): Promise<VoApiV2KeyGroupDescriptor[]> {
  const template = await fetchVoApiV2Template(request)
  const seen = new Set<number>()

  return (template.groups ?? []).map((group) => {
    const id = toCanonicalPositiveInteger(group.id)
    if (id === null || seen.has(id)) {
      throw new ApiError(
        "VoAPI v2 key template contains invalid group identity",
        undefined,
        VOAPI_V2_ENDPOINTS.KeyTemplate,
        API_ERROR_CODES.JSON_PARSE_ERROR,
      )
    }
    seen.add(id)
    const requirementKey = String(id)
    return {
      id,
      requirementKey,
      displayName: group.name?.trim() || requirementKey,
    }
  })
}
