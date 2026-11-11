import {
  BROWSER_LOGIN_FAILURE_REASONS,
  type BrowserLoginFailureReason,
} from "~/constants/browserLogin"
import { isProtectionResponse } from "~/services/protectionBypass/response"

/** Safe login failure facts, independent of the site's authentication protocol. */
export class BrowserLoginResponseError extends Error {
  constructor(
    readonly reason: BrowserLoginFailureReason,
    readonly mutationRisk = false,
  ) {
    super(reason)
  }
}

/** Classifies protection before JSON decoding, without exposing response bodies. */
export async function readBrowserLoginJson(
  response: Response,
): Promise<unknown> {
  const text = await response.text()
  if (isProtectionResponse(text, response.headers))
    throw new BrowserLoginResponseError(
      BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
    )
  try {
    return JSON.parse(text)
  } catch {
    throw new BrowserLoginResponseError(
      BROWSER_LOGIN_FAILURE_REASONS.InvalidResponse,
    )
  }
}
