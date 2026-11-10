import {
  BROWSER_LOGIN_FAILURE_REASONS,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import { BROWSER_OAUTH_REQUEST_FAILURE_REASONS } from "~/constants/browserOAuth"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
import {
  BrowserLoginResponseError,
  readBrowserLoginJson,
} from "~/services/browserLogin/contentResponse"
import {
  BrowserOAuthRequestError,
  fetchBrowserOAuthRequest,
} from "~/services/browserOAuth/contentRequest"
import { isRecord } from "~/utils/core/object"

export type PasswordLoginContentRequest = {
  origin?: unknown
  requestId?: unknown
  expectedIdentity?: unknown
  credentials?: unknown
}

/** Bind credential submission to the initiating origin and saved identity. */
export function validatePasswordLoginRequest(
  request: PasswordLoginContentRequest,
) {
  const requestId = validatePasswordLoginContext(request)
  const credentials = normalizePasswordCredentials(request.credentials)
  if (
    typeof request.expectedIdentity !== "string" ||
    !request.expectedIdentity.trim() ||
    !credentials
  )
    throw new Error("Invalid login context")
  return {
    credentials,
    requestId,
    expectedIdentity: request.expectedIdentity.trim(),
  }
}

/** Cleanup carries no password and may only address this origin's request. */
export function validatePasswordLoginContext(
  request: PasswordLoginContentRequest,
): string {
  if (
    request.origin !== location.origin ||
    !["https:", "http:"].includes(location.protocol) ||
    typeof request.requestId !== "string" ||
    !request.requestId.trim()
  )
    throw new Error("Invalid login context")
  return request.requestId
}

/** Authentication failures never return upstream bodies or exception text. */
export function runPasswordLoginContentAction(
  reply: (result: AccountLoginResult) => void,
  work: () => Promise<AccountLoginResult>,
  hasEstablishedSession: () => boolean = () => false,
): true {
  void work()
    .then(reply)
    .catch((error) =>
      reply({
        status:
          hasEstablishedSession() ||
          (error instanceof BrowserLoginResponseError && error.mutationRisk) ||
          (error instanceof BrowserOAuthRequestError &&
            error.reason === BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain)
            ? BROWSER_LOGIN_STATUS.Uncertain
            : BROWSER_LOGIN_STATUS.Failed,
        ...(error instanceof BrowserLoginResponseError
          ? { reason: error.reason }
          : {}),
      }),
    )
  return true
}

/** Fixed protocol routes only; never replay an authentication mutation. */
export async function passwordLoginRequest(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  mutationRisk = body !== undefined,
) {
  const response = await fetchBrowserOAuthRequest(
    path,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    { mutationRisk },
  )
  let payload: unknown
  try {
    payload = await readBrowserLoginJson(response)
  } catch (error) {
    if (
      error instanceof BrowserLoginResponseError &&
      (!mutationRisk ||
        error.reason === BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired)
    )
      throw new BrowserLoginResponseError(error.reason, mutationRisk)
    throw BrowserOAuthRequestError.fromMutationRisk(mutationRisk)
  }
  if (!response.ok)
    throw BrowserOAuthRequestError.fromMutationRisk(
      response.status >= 500 && mutationRisk,
    )
  if (!isRecord(payload))
    throw BrowserOAuthRequestError.fromMutationRisk(mutationRisk)
  return payload
}
