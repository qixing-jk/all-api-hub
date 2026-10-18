import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"
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
          (error instanceof BrowserOAuthRequestError &&
            error.reason === "uncertain")
            ? BROWSER_LOGIN_STATUS.Uncertain
            : BROWSER_LOGIN_STATUS.Failed,
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
  if (!response.ok)
    throw new BrowserOAuthRequestError(
      response.status >= 500 && mutationRisk ? "uncertain" : "request_failed",
    )
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new BrowserOAuthRequestError(
      mutationRisk ? "uncertain" : "request_failed",
    )
  }
  if (!isRecord(payload))
    throw new BrowserOAuthRequestError(
      mutationRisk ? "uncertain" : "request_failed",
    )
  return payload
}
