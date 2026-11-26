import type {
  ApiServiceRequest,
  FetchApiOptions,
} from "~/services/apiTransport/type"

import { newApiFamilyRequests } from "../request"

/** A session-bound request cannot recover into another browser session. */
export function tokenSessionRequest<T>(
  request: ApiServiceRequest,
  {
    options,
    ...dispatch
  }: Pick<FetchApiOptions, "endpoint" | "operationSemantics" | "options">,
) {
  return newApiFamilyRequests.data<T>(
    { ...request, allowAccountCredentialRecovery: false },
    {
      ...dispatch,
      options: { ...options, credentials: "omit", redirect: "error" },
      tempWindowFallback: { codes: [], statusCodes: [] },
    },
  )
}
