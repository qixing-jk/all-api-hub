import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { parseSub2ApiEnvelope, parseSub2ApiUserIdentity } from "./parsing"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  type Sub2ApiAuthMeData,
  type Sub2ApiAuthMeResponse,
} from "./type"

/** Reads Sub2API's canonical dashboard identity with an already-prepared request. */
export async function fetchSub2ApiAuthIdentity(request: ApiServiceRequest) {
  const body = (await fetchApi<Sub2ApiAuthMeResponse>(
    request,
    {
      endpoint: SUB2API_AUTH_ME_ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
      },
    },
    true,
  )) as Sub2ApiAuthMeResponse
  const data = parseSub2ApiEnvelope<Sub2ApiAuthMeData>(
    body,
    SUB2API_AUTH_ME_ENDPOINT,
  )

  return {
    data,
    identity: parseSub2ApiUserIdentity(data),
  }
}
