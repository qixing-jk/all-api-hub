import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import {
  API_ERROR_CODES,
  ApiError,
  isAuthenticationRequiredError,
} from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { newApiFamilyRequests } from "../request"
import {
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES,
} from "./protocol"

const ACCESS_TOKEN_VERIFICATION_TIMEOUT_MS = 10_000

export interface NewApiAccessTokenTarget {
  baseUrl: string
  siteType: AccountSiteType
  userId: string
  accessToken: string
}

export type NewApiAccessTokenValidationResult =
  | { status: typeof VALIDATION_STATUSES.VALID }
  | { status: typeof VALIDATION_STATUSES.IDENTITY_MISMATCH }
  | { status: typeof VALIDATION_STATUSES.INVALID }
  | { status: typeof VALIDATION_STATUSES.UNAVAILABLE }

/** Both scoped token setup and entered-token verification use the New API account contract. */
export function supportsNewApiTokenSetup(siteType: AccountSiteType) {
  return siteType === SITE_TYPES.NEW_API
}

/** Read the identity of this token in isolation from browser and saved credentials. */
export async function validateNewApiAccessToken({
  baseUrl,
  siteType,
  userId,
  accessToken,
  abortSignal,
}: NewApiAccessTokenTarget & {
  abortSignal?: AbortSignal
}): Promise<NewApiAccessTokenValidationResult> {
  abortSignal?.throwIfAborted()
  const url = tryParseHttpUrl(baseUrl)
  const expectedUserId = userId.trim()
  const token = accessToken.trim()
  if (
    !supportsNewApiTokenSetup(siteType) ||
    !url ||
    url.username ||
    url.password ||
    !expectedUserId ||
    !token
  )
    return { status: VALIDATION_STATUSES.UNAVAILABLE }

  try {
    const user = await newApiFamilyRequests.data<{ id?: unknown }>(
      {
        baseUrl: url.origin,
        siteType,
        directRequestReason: API_DIRECT_REQUEST_REASONS.CredentialIsolation,
        allowAccountCredentialRecovery: false,
        requestTimeoutMs: ACCESS_TOKEN_VERIFICATION_TIMEOUT_MS,
        abortSignal,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: expectedUserId,
          accessToken: token,
        },
      },
      {
        endpoint: ENDPOINTS.SELF,
        currentTabTransport: "disabled",
        options: { method: "GET", credentials: "omit", redirect: "error" },
        tempWindowFallback: { codes: [], statusCodes: [] },
      },
    )
    abortSignal?.throwIfAborted()
    const actualUserId = normalizeAccountIdentity(user?.id)
    if (actualUserId === null)
      return { status: VALIDATION_STATUSES.UNAVAILABLE }
    return {
      status:
        actualUserId === expectedUserId
          ? VALIDATION_STATUSES.VALID
          : VALIDATION_STATUSES.IDENTITY_MISMATCH,
    }
  } catch (error) {
    abortSignal?.throwIfAborted()
    if (
      isAuthenticationRequiredError(error) ||
      (error instanceof ApiError &&
        error.statusCode === 403 &&
        !error.unattributedMessage &&
        error.code !== API_ERROR_CODES.ROBOT_CHALLENGE &&
        error.code !== API_ERROR_CODES.CONTENT_TYPE_MISMATCH &&
        error.code !== API_ERROR_CODES.JSON_PARSE_ERROR)
    )
      return { status: VALIDATION_STATUSES.INVALID }
    return { status: VALIDATION_STATUSES.UNAVAILABLE }
  }
}
