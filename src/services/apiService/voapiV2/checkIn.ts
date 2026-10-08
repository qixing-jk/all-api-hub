import { fetchVoApiV2Data } from "~/services/apiService/voapiV2/dashboardRequest"
import { parseVoApiV2Envelope } from "~/services/apiService/voapiV2/parsing"
import { decodeVoApiV2ResponseError } from "~/services/apiService/voapiV2/responseError"
import {
  VOAPI_V2_ENDPOINTS,
  VOAPI_V2_PROTOCOL_CODES,
  type VoApiV2CheckInStats,
  type VoApiV2CheckInSubmitData,
  type VoApiV2Envelope,
} from "~/services/apiService/voapiV2/type"
import { fetchApi } from "~/services/apiTransport/request"
import {
  API_AUTH_TOKEN_MODES,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"

type VoApiV2CheckInSubmitResult =
  | VoApiV2CheckInSubmitData
  | { alreadySigned: true }

/**
 * Fetches VoAPI v2 check-in stats for final status confirmation.
 */
export const fetchVoApiV2CheckInStats = (request: ApiServiceRequest) =>
  fetchVoApiV2Data<VoApiV2CheckInStats>(
    request,
    VOAPI_V2_ENDPOINTS.CheckInStats,
    { cache: "no-store" },
  )

/**
 * Submits the VoAPI v2 API check-in and classifies same-day repeats.
 */
export async function submitVoApiV2CheckIn(
  request: ApiServiceRequest,
): Promise<VoApiV2CheckInSubmitResult> {
  const body = await fetchApi<VoApiV2Envelope<VoApiV2CheckInSubmitData>>(
    request,
    {
      endpoint: VOAPI_V2_ENDPOINTS.CheckInSubmit,
      options: { method: "POST" },
      authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      errorResponseDecoder: decodeVoApiV2ResponseError,
    },
  )

  const envelope = body as unknown as VoApiV2Envelope<VoApiV2CheckInSubmitData>

  if (
    envelope &&
    typeof envelope === "object" &&
    envelope.code === VOAPI_V2_PROTOCOL_CODES.AlreadySigned
  ) {
    // Code 1 is only a repeat candidate. The provider confirms the actual
    // same-day state through the read-only stats endpoint before reporting it.
    return { alreadySigned: true }
  }

  return parseVoApiV2Envelope<VoApiV2CheckInSubmitData>(
    envelope,
    VOAPI_V2_ENDPOINTS.CheckInSubmit,
  )
}
