import { XIAOEN_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import { invalidXiaoenResponse } from "./transport"

/** Public catalog/announcements do not borrow a saved account's console credentials. */
export async function fetchPublicEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
) {
  if (new URL(request.baseUrl).origin !== XIAOEN_WEB_ORIGIN)
    throw invalidXiaoenResponse(endpoint)
  const body = await fetchApi<unknown>(
    {
      ...request,
      auth: { authType: AuthTypeEnum.None },
      cookieAuthSessionCookie: undefined,
      cookieSession: undefined,
    },
    { endpoint, options: { cache: "no-store" } },
    false,
  )
  if (!isRecord(body) || body.success !== true)
    throw invalidXiaoenResponse(endpoint)
  return body
}
