const BROWSER_OAUTH_REQUEST_TIMEOUT_MS = 15_000

export type BrowserOAuthRequestFailureReason = "request_failed" | "uncertain"

export class BrowserOAuthRequestError extends Error {
  constructor(readonly reason: BrowserOAuthRequestFailureReason) {
    super(reason)
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
    .catch((error) =>
      reply({
        success: false,
        reason:
          error instanceof BrowserOAuthRequestError
            ? error.reason
            : "request_failed",
      }),
    )
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
  try {
    return await fetch(path, {
      ...init,
      credentials: "include",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(BROWSER_OAUTH_REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new BrowserOAuthRequestError(
      options.mutationRisk ? "uncertain" : "request_failed",
    )
  }
}
