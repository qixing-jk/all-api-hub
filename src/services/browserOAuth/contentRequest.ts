import { BROWSER_LOGIN_FAILURE_REASONS } from "~/constants/browserLogin"
import {
  BROWSER_OAUTH_REQUEST_FAILURE_REASONS,
  type BrowserOAuthRequestFailureReason,
} from "~/constants/browserOAuth"
import { BrowserLoginResponseError } from "~/services/browserLogin/contentResponse"
import { isProtectionResponse } from "~/services/protectionBypass/response"

const BROWSER_OAUTH_REQUEST_TIMEOUT_MS = 15_000

export class BrowserOAuthRequestError extends Error {
  constructor(readonly reason: BrowserOAuthRequestFailureReason) {
    super(reason)
  }

  /** A lost or unusable mutation response cannot establish that the request failed. */
  static fromMutationRisk(mutationRisk: boolean): BrowserOAuthRequestError {
    return new BrowserOAuthRequestError(
      mutationRisk
        ? BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain
        : BROWSER_OAUTH_REQUEST_FAILURE_REASONS.RequestFailed,
    )
  }
}

type BrowserOAuthContentReply = (response: unknown) => void

/** Settles one asynchronous content action without exposing upstream payloads. */
export function runBrowserOAuthContentAction(
  reply: BrowserOAuthContentReply,
  work: () => Promise<Record<string, unknown>>,
): true {
  void work()
    .then(reply)
    .catch((error) => {
      if (error instanceof BrowserLoginResponseError) {
        reply({
          success: false,
          reason: error.reason,
          ...(error.mutationRisk ? { mutationRisk: true } : {}),
        })
        return
      }
      reply({
        success: false,
        reason:
          error instanceof BrowserOAuthRequestError
            ? error.reason
            : BROWSER_OAUTH_REQUEST_FAILURE_REASONS.RequestFailed,
      })
    })
  return true
}

/**
 * Runs a bounded same-origin request from an OAuth content action. A lost
 * mutation response is uncertain because the server may already have applied it.
 */
export async function fetchBrowserOAuthRequest(
  path: string,
  init: RequestInit = {},
  options: { mutationRisk?: boolean } = {},
): Promise<Response> {
  const mutationRisk =
    options.mutationRisk ??
    !["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase())
  let response: Response
  let challenged: boolean
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(BROWSER_OAUTH_REQUEST_TIMEOUT_MS),
    })
    // Inspect a clone so callers retain their response status and readable body.
    challenged =
      isProtectionResponse(undefined, response.headers) ||
      isProtectionResponse(await response.clone().text(), response.headers)
  } catch {
    throw BrowserOAuthRequestError.fromMutationRisk(mutationRisk)
  }
  if (challenged) {
    throw new BrowserLoginResponseError(
      BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
      mutationRisk,
    )
  }
  return response
}
