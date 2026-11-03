import { NANOGPT_MANAGEMENT_IDENTITY_PREFIX } from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import { fetchNanoGptKeys } from "~/services/apiService/nanogpt/management"
import { parseNanoGptSubscription } from "~/services/apiService/nanogpt/parsing"
import { fetchNanoGptManagementData } from "~/services/apiService/nanogpt/transport"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Reads only the subscription snapshot permitted by the usage:read scope. */
export async function fetchNanoGptManagementSubscription(
  request: ApiServiceRequest,
) {
  return parseNanoGptSubscription(
    await fetchNanoGptManagementData(request, "/subscription/usage"),
    "/subscription/usage",
  )
}

/** A scope refusal proves neither invalid authentication nor an unavailable account. */
export async function verifyNanoGptManagementCredential(
  request: ApiServiceRequest,
) {
  try {
    return await fetchNanoGptManagementSubscription(request)
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 403) throw error
    await fetchNanoGptKeys(request)
  }
}

/** No management endpoint proves the console/deposit identity: use a local credential identity. */
export async function nanoGptManagementIdentity(
  request: ApiServiceRequest,
): Promise<string> {
  const secret = parseNanoGptCredentials(
    request.auth.accessToken,
  ).managementToken
  const bytes = new TextEncoder().encode(secret)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return (
    NANOGPT_MANAGEMENT_IDENTITY_PREFIX +
    Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
  )
}
