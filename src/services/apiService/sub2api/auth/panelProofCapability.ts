import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { SITE_TYPES } from "~/constants/siteType"
import { readSub2ApiPanelSigningKey } from "~/services/apiService/sub2api/auth/panelProofStore"
import { SUB2API_AUTH_REFRESH_ENDPOINT } from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import { readSub2ApiPanelTokenBinding } from "./panelProof"
import { getSub2ApiPanelKeyThumbprint } from "./panelProofProtocol"

const apiOrigin = (baseUrl: string) =>
  new URL(resolveDeploymentApiOrigin(baseUrl)).origin

/** Keys are persisted only after matching the panel middleware, not from JWT hints. */
export async function hasSub2ApiPanelProof(baseUrl: string): Promise<boolean> {
  try {
    return Boolean(await readSub2ApiPanelSigningKey(apiOrigin(baseUrl)))
  } catch {
    return false
  }
}

/** Only a token bound to our key may bypass its original browser context. */
export async function hasSub2ApiPanelBinding(
  baseUrl: string,
  accessToken: string,
): Promise<boolean> {
  const binding = readSub2ApiPanelTokenBinding(accessToken)
  if (!binding) return false
  try {
    const pair = await readSub2ApiPanelSigningKey(apiOrigin(baseUrl))
    return Boolean(
      pair && binding === (await getSub2ApiPanelKeyThumbprint(pair)),
    )
  } catch {
    return false
  }
}

/** A missing refresh token cannot rotate a family or use the website's Cookie. */
export async function discoverSub2ApiPanelProof(
  baseUrl: string,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  if (await hasSub2ApiPanelProof(baseUrl)) return true
  try {
    await fetchApiResponse(
      {
        siteType: SITE_TYPES.SUB2API,
        baseUrl,
        auth: { authType: AuthTypeEnum.None },
        directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
        abortSignal,
      },
      {
        endpoint: SUB2API_AUTH_REFRESH_ENDPOINT,
        options: {
          method: "POST",
          body: JSON.stringify({ refresh_token: "" }),
          credentials: "omit",
          redirect: "error",
        },
      },
    )
  } catch (error) {
    abortSignal?.throwIfAborted()
    if (
      (error instanceof ApiError &&
        error.code === API_ERROR_CODES.REQUEST_PROOF_INVALID) ||
      (await hasSub2ApiPanelProof(baseUrl))
    )
      throw error
    // An unavailable optional probe is not an authentication failure.
    return false
  }
  return hasSub2ApiPanelProof(baseUrl)
}
