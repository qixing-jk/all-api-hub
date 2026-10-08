import {
  parseVoApiV2Envelope,
  type VoApiV2EnvelopeOptions,
} from "~/services/apiService/voapiV2/parsing"
import { decodeVoApiV2ResponseError } from "~/services/apiService/voapiV2/responseError"
import { fetchApi } from "~/services/apiTransport/request"
import {
  API_AUTH_TOKEN_MODES,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"

/**
 * Fetches a VoAPI v2 endpoint with the dashboard JWT sent as raw Authorization.
 */
export async function fetchVoApiV2Data<TData>(
  request: ApiServiceRequest,
  endpoint: string,
  options: RequestInit = {},
  parseOptions?: VoApiV2EnvelopeOptions,
): Promise<TData> {
  const body = await fetchApi<unknown>(request, {
    endpoint,
    options,
    authTokenMode: API_AUTH_TOKEN_MODES.Raw,
    errorResponseDecoder: decodeVoApiV2ResponseError,
  })

  return parseVoApiV2Envelope<TData>(body, endpoint, parseOptions)
}
