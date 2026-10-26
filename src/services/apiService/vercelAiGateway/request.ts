import {
  VERCEL_AI_GATEWAY_API_ORIGIN,
  VERCEL_API_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import { createProviderJsonRequests } from "~/services/apiService/common/providerRequest"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import { decodeVercelResponseError } from "./errors"

/** Vercel JSON requests with the provider's two documented error envelopes. */
export const vercelRequests = createProviderJsonRequests(
  decodeVercelResponseError,
)

/** Reads the saved Vercel access token; it is the account's only credential. */
function readVercelAccessToken(request: ApiServiceRequest): string {
  const accessToken = request.auth.accessToken?.trim() ?? ""
  if (!accessToken) {
    throw new ApiError(
      "Vercel AI Gateway requires a Vercel access token",
      undefined,
      undefined,
      API_ERROR_CODES.HTTP_401,
    )
  }
  return accessToken
}

/**
 * Builds an account-API request. The saved URL stays the console origin (it
 * owns the login session and the token page); `managementApiBaseUrl` carries
 * the account API address, matching the shared transport's split-origin rule.
 */
export function createVercelAccountRequest(
  request: ApiServiceRequest,
): ApiServiceRequest {
  return createVercelRequest(request, VERCEL_API_ORIGIN)
}

/**
 * Builds an inference-API request. `/v1/credits` and `/v1/models` answer on the
 * gateway origin; both accept the account's access token when the team is
 * named on the request.
 */
export function createVercelGatewayRequest(
  request: ApiServiceRequest,
): ApiServiceRequest {
  return createVercelRequest(request, VERCEL_AI_GATEWAY_API_ORIGIN)
}

/** Both APIs use the same account credential rules and retain transport context. */
function createVercelRequest(
  request: ApiServiceRequest,
  origin: string,
): ApiServiceRequest {
  return {
    ...request,
    baseUrl: origin,
    managementApiBaseUrl: origin,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken: readVercelAccessToken(request),
      cookie: undefined,
    },
  }
}

/** Appends defined query parameters, preserving the order callers declare. */
export function withVercelQuery(
  path: string,
  params: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&")
  return query ? `${path}?${query}` : path
}
