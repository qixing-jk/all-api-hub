import {
  fetchApi as fetchTransportApi,
  fetchApiData as fetchTransportApiData,
} from "~/services/apiTransport/request"
import type {
  ApiResponse,
  ApiResponseErrorDecoder,
  ApiTransportRequest,
  FetchApiOptions,
} from "~/services/apiTransport/type"

/** JSON request options whose provider decoder is owned by the request module. */
type ProviderJsonRequestOptions = Omit<
  FetchApiOptions,
  "errorResponseDecoder" | "responseType"
>

/** Provider-owned JSON request modes with explicit response projections. */
interface ProviderJsonRequests {
  /** Decodes application errors and unwraps the response `data` field. */
  data<T>(
    request: ApiTransportRequest,
    options: ProviderJsonRequestOptions,
  ): Promise<T>

  /** Preserves a successful HTTP response envelope for provider classification. */
  envelope<T>(
    request: ApiTransportRequest,
    options: ProviderJsonRequestOptions,
  ): Promise<ApiResponse<T>>

  /** Decodes application errors and returns an envelope payload or bare JSON body. */
  payload<T>(
    request: ApiTransportRequest,
    options: ProviderJsonRequestOptions,
  ): Promise<T>
}

/** Creates one provider-owned JSON request module around the shared transport. */
export function createProviderJsonRequests(
  errorResponseDecoder: ApiResponseErrorDecoder,
): ProviderJsonRequests {
  const withDecoder = (
    options: ProviderJsonRequestOptions,
  ): FetchApiOptions & { responseType: "json" } => ({
    ...options,
    responseType: "json",
    errorResponseDecoder,
  })

  return {
    async data<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<T> {
      return await fetchTransportApiData<T>(request, withDecoder(options))
    },
    async envelope<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<ApiResponse<T>> {
      return await fetchTransportApi<T>(request, withDecoder(options), false)
    },
    async payload<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<T> {
      return await fetchTransportApi<T>(request, withDecoder(options), true)
    },
  }
}
