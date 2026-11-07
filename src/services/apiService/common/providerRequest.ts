import { ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS } from "~/constants/accountLogin"
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
> & {
  /** A provider-declared safe GET read; never set for credential issuance or writes. */
  credentialRecovery?: typeof ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read
}

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
  const withDecoder = ({
    credentialRecovery: _credentialRecovery,
    ...options
  }: ProviderJsonRequestOptions): FetchApiOptions & {
    responseType: "json"
  } => ({
    ...options,
    responseType: "json",
    errorResponseDecoder,
  })

  const run = async <T>(
    request: ApiTransportRequest,
    options: ProviderJsonRequestOptions,
    runner: (request: ApiTransportRequest) => Promise<T>,
  ): Promise<T> => {
    if (
      request.allowAccountCredentialRecovery === true &&
      options.credentialRecovery ===
        ACCOUNT_CREDENTIAL_RECOVERY_OPERATIONS.Read &&
      (options.options?.method ?? "GET").toUpperCase() === "GET"
    ) {
      // Recovery depends on the adapter registry; load it after registration.
      const { executeWithAccountCredentialRecovery } = await import(
        "~/services/accountCredentialRecovery"
      )
      return executeWithAccountCredentialRecovery(request, runner)
    }
    return runner(request)
  }

  return {
    async data<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<T> {
      return await run(request, options, (next) =>
        fetchTransportApiData<T>(next, withDecoder(options)),
      )
    },
    async envelope<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<ApiResponse<T>> {
      return await run(request, options, (next) =>
        fetchTransportApi<T>(next, withDecoder(options), false),
      )
    },
    async payload<T>(
      request: ApiTransportRequest,
      options: ProviderJsonRequestOptions,
    ): Promise<T> {
      return await run(request, options, (next) =>
        fetchTransportApi<T>(next, withDecoder(options), true),
      )
    },
  }
}
