import {
  parseSub2ApiEnvelope,
  parseSub2ApiUserIdentity,
} from "~/services/apiService/sub2api/parsing"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  type Sub2ApiAuthMeData,
  type Sub2ApiAuthMeResponse,
} from "~/services/apiService/sub2api/type"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Reads Sub2API's canonical dashboard identity with an already-prepared request. */
export async function fetchSub2ApiAuthIdentity(request: ApiServiceRequest) {
  const body = (await fetchApi<Sub2ApiAuthMeResponse>(request, {
    endpoint: SUB2API_AUTH_ME_ENDPOINT,
    options: {
      method: "GET",
      cache: "no-store",
    },
    errorResponseDecoder: decodeSub2ApiResponseError,
  })) as unknown as Sub2ApiAuthMeResponse
  const data = parseSub2ApiEnvelope<Sub2ApiAuthMeData>(
    body,
    SUB2API_AUTH_ME_ENDPOINT,
  )

  return {
    data,
    identity: parseSub2ApiUserIdentity(data),
  }
}
