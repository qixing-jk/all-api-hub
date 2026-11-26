import type {
  ApiServiceRequest,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import { newApiFamilyRequests } from "../request"
import { NEW_API_TOKEN_VERIFICATION_ERRORS } from "./protocol"

/** A session-bound request cannot recover into another browser session. */
export function tokenSessionRequest<T>(
  request: ApiServiceRequest,
  {
    options,
    ...dispatch
  }: Pick<FetchApiOptions, "endpoint" | "operationSemantics" | "options">,
) {
  if (request.auth.authType !== AuthTypeEnum.AccessToken)
    throw new Error(NEW_API_TOKEN_VERIFICATION_ERRORS.INVALID_CONTEXT)
  return newApiFamilyRequests.data<T>(
    { ...request, allowAccountCredentialRecovery: false },
    {
      ...dispatch,
      options: { ...options, credentials: "omit", redirect: "error" },
      tempWindowFallback: { codes: [], statusCodes: [] },
    },
  )
}
