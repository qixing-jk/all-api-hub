import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountIdentity, Sub2ApiAuthConfig } from "~/types"

export type Sub2ApiStoredAuthSnapshot = {
  accessToken?: string
  origin?: string
  userId?: AccountIdentity
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type Sub2ApiPersistAuthUpdate = {
  accessToken: string
  userId?: AccountIdentity
  refreshToken?: string
  tokenExpiresAt?: number
  expectedOrigin: string
  expectedUserId: AccountIdentity
}

export const SUB2API_AUTH_PERSISTENCE_STATUSES = {
  PERSISTED: "persisted",
  ACCOUNT_MISSING: "account_missing",
  IDENTITY_MISMATCH: "identity_mismatch",
  WRITE_FAILED: "write_failed",
} as const

export type Sub2ApiAuthPersistenceResult = {
  status: (typeof SUB2API_AUTH_PERSISTENCE_STATUSES)[keyof typeof SUB2API_AUTH_PERSISTENCE_STATUSES]
}

export type Sub2ApiAuthSession = {
  getLatestAuth(accountId: string): Promise<Sub2ApiStoredAuthSnapshot | null>
  persistAuthUpdate(
    accountId: string,
    update: Sub2ApiPersistAuthUpdate,
  ): Promise<Sub2ApiAuthPersistenceResult>
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
