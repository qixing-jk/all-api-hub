import { executeAuthenticatedSub2ApiRequest } from "~/services/apiService/sub2api/auth/authLifecycle"
import { parseSub2ApiEnvelope } from "~/services/apiService/sub2api/parsing"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const fetchSub2ApiDataWithRequest = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
  parserOptions?: { allowMissingData?: boolean },
): Promise<{ data: T; request: ApiServiceRequest }> => {
  return executeAuthenticatedSub2ApiRequest(
    request,
    endpoint,
    async (authRequest) => {
      const body = await fetchApi<unknown>(authRequest, {
        endpoint,
        options,
        errorResponseDecoder: decodeSub2ApiResponseError,
      })

      return {
        data: parseSub2ApiEnvelope<T>(body, endpoint, parserOptions),
        request: authRequest,
      }
    },
  )
}

export const fetchSub2ApiData = async <T>(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
  parserOptions?: { allowMissingData?: boolean },
): Promise<T> => {
  const result = await fetchSub2ApiDataWithRequest<T>(
    request,
    endpoint,
    options,
    parserOptions,
  )

  return result.data
}
