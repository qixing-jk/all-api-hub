import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountIdentity, Sub2ApiAuthConfig } from "~/types"

export type Sub2ApiStoredAuthSnapshot = {
  accessToken?: string
  userId?: AccountIdentity
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type Sub2ApiPersistAuthUpdate = {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: number
}

export type Sub2ApiAuthSession = {
  getLatestAuth(accountId: string): Promise<Sub2ApiStoredAuthSnapshot | null>
  persistAuthUpdate(
    accountId: string,
    update: Sub2ApiPersistAuthUpdate,
  ): Promise<boolean>
}

export type Sub2ApiAuthSessionRequest<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = TRequest & {
  sub2apiAuthSession?: Sub2ApiAuthSession
}

/**
 * Gets the Sub2API auth-session port attached to an API service request.
 */
export function getSub2ApiAuthSession(
  request: ApiServiceRequest,
): Sub2ApiAuthSession | undefined {
  return (request as Sub2ApiAuthSessionRequest).sub2apiAuthSession
}
