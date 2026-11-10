import type { BrowserLoginFailureReason } from "~/constants/browserLogin"
import { BROWSER_LOGIN_FAILURE_REASONS } from "~/constants/browserLogin"
import {
  BROWSER_OAUTH_COMPLETION_STATUS,
  BROWSER_OAUTH_REQUEST_FAILURE_REASONS,
  BROWSER_OAUTH_STATUS,
} from "~/constants/browserOAuth"
import type { AccountLoginCredential } from "~/services/apiAdapters/contracts/accountLogin"
import {
  BrowserLoginOriginMismatchError,
  createBrowserLoginContext,
  type BrowserLoginContextOptions,
  type BrowserLoginResult,
  type BrowserLoginSession,
} from "~/services/browserLogin/browserLogin"
import { BrowserLoginResponseError } from "~/services/browserLogin/contentResponse"
import { getBrowserLoginPageFailureReason } from "~/services/browserLogin/pageProtection"
import { isMessageReceiverUnavailableError } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

const logger = createLogger("BrowserOAuth")
const INTERACTIVE_TIMEOUT_MS = 2 * 60 * 1000
const UNATTENDED_TIMEOUT_MS = 45 * 1000
export type BrowserOAuthFailureStatus = Exclude<
  BrowserLoginResult<never>,
  { status: typeof BROWSER_OAUTH_STATUS.Authenticated }
>["status"]

type BrowserOAuthFailure = {
  status: BrowserOAuthFailureStatus
  reason?: BrowserLoginFailureReason
  message?: string
}
export type BrowserOAuthContextOptions = BrowserLoginContextOptions

export type BrowserOAuthPreparation =
  { authorizationUrl: string } | BrowserOAuthFailure

export type BrowserOAuthCompletion<Evidence> =
  | {
      status: typeof BROWSER_OAUTH_COMPLETION_STATUS.Verified
      identity: string
      evidence: Evidence
    }
  | { status: typeof BROWSER_OAUTH_COMPLETION_STATUS.Invalid; message?: string }
  | BrowserOAuthFailure

export interface BrowserOAuthFlow<Evidence> {
  id: string
  concurrencyKey: string
  displayName: string
  loginPath: string
  prepareAction: string
  prepareDetails?: Record<string, unknown>
  completeAction: string
  clearEvidenceAction: string
  captureCredential?: (
    tabId: number,
    origin: string,
  ) => Promise<AccountLoginCredential | null>
  authorizationInteraction?: {
    action: string
    isInteractionUrl(currentUrl: URL, requestedUrl: URL): boolean
  }
  parsePreparation(response: unknown): BrowserOAuthPreparation | null
  parseCompletion(response: unknown): BrowserOAuthCompletion<Evidence>
  isAuthorizationUrl(url: URL): boolean
  isCompletionUrl(url: URL, origin: string): boolean
}

/** Shared request failures retain their outcome before provider-specific parsing. */
function contentActionFailure(
  response: unknown,
  afterCallback = false,
): BrowserOAuthFailure | null {
  if (!isRecord(response) || response.success !== false) return null
  if (
    response.reason === BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain ||
    (afterCallback &&
      response.reason === BROWSER_OAUTH_REQUEST_FAILURE_REASONS.RequestFailed)
  )
    return { status: BROWSER_OAUTH_STATUS.Uncertain }
  if (
    response.reason !== BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired &&
    response.reason !== BROWSER_LOGIN_FAILURE_REASONS.PageUnavailable
  )
    return null
  return {
    status:
      afterCallback || response.mutationRisk === true
        ? BROWSER_OAUTH_STATUS.Uncertain
        : response.reason === BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired
          ? BROWSER_OAUTH_STATUS.InteractionRequired
          : BROWSER_OAUTH_STATUS.Failed,
    reason: response.reason,
  }
}

/** Sends site work through readiness while preserving its pre/post-callback outcome. */
async function sendOAuthSiteAction(
  session: BrowserLoginSession,
  action: string,
  afterCallback = false,
  details?: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await session.sendSiteAction(action, {
      ...details,
      origin: session.input.origin,
    })
  } catch (error) {
    const reason = getBrowserLoginPageFailureReason(error)
    if (!reason) {
      if (
        afterCallback ||
        (error instanceof BrowserLoginResponseError && error.mutationRisk)
      )
        return {
          success: false,
          reason: BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain,
        }
      throw error
    }
    return {
      success: false,
      reason,
      mutationRisk: afterCallback,
    }
  }
}

/** Executes OAuth navigation and completion inside the shared account session. */
async function executeOAuth<Evidence>(
  flow: BrowserOAuthFlow<Evidence>,
  session: BrowserLoginSession,
): Promise<BrowserLoginResult<Evidence>> {
  const { input } = session
  const prepareResponse = await sendOAuthSiteAction(
    session,
    flow.prepareAction,
    false,
    flow.prepareDetails,
  )
  const prepared =
    contentActionFailure(prepareResponse) ??
    flow.parsePreparation(prepareResponse)
  if (!prepared) {
    throw new Error(`${flow.displayName} OAuth could not be prepared.`)
  }
  if ("status" in prepared) return prepared
  const authorizationUrl = new URL(prepared.authorizationUrl)
  if (!flow.isAuthorizationUrl(authorizationUrl)) {
    throw new Error(`${flow.displayName} returned an invalid OAuth URL.`)
  }

  await session.navigate(authorizationUrl.href)
  const handledInteractionUrls = new Set<string>()
  await session.waitForTab(
    (tab) => {
      if (tab.status !== "complete" || !tab.url) return false
      try {
        return flow.isCompletionUrl(new URL(tab.url), input.origin)
      } catch {
        return false
      }
    },
    input.attended === false ? UNATTENDED_TIMEOUT_MS : INTERACTIVE_TIMEOUT_MS,
    (tab) => {
      const interaction = flow.authorizationInteraction
      if (!interaction || !tab.url) return

      try {
        const currentUrl = new URL(tab.url)
        if (
          handledInteractionUrls.has(currentUrl.href) ||
          !interaction.isInteractionUrl(currentUrl, authorizationUrl)
        ) {
          return
        }
        handledInteractionUrls.add(currentUrl.href)
        void session
          .sendAuthorizationAction(interaction.action, authorizationUrl.href, {
            authorizationUrl: authorizationUrl.href,
          })
          .catch((error) => {
            if (
              error instanceof BrowserLoginOriginMismatchError ||
              isMessageReceiverUnavailableError(error)
            ) {
              handledInteractionUrls.delete(currentUrl.href)
            }
            logger.warn(
              `${flow.displayName} OAuth authorization interaction failed`,
              {
                error: getErrorMessage(error),
                flowId: flow.id,
                requestId: input.requestId,
              },
            )
          })
      } catch {
        // Ignore incomplete or invalid intermediate tab URLs.
      }
    },
  )

  const completionResponse = await sendOAuthSiteAction(
    session,
    flow.completeAction,
    true,
  )
  const completed =
    contentActionFailure(completionResponse, true) ??
    flow.parseCompletion(completionResponse)
  if (
    completed.status !== BROWSER_OAUTH_COMPLETION_STATUS.Verified &&
    completed.status !== BROWSER_OAUTH_COMPLETION_STATUS.Invalid
  ) {
    return completed
  }
  if (completed.status === BROWSER_OAUTH_COMPLETION_STATUS.Invalid) {
    throw new Error(
      completed.message ?? `${flow.displayName} OAuth could not be verified.`,
    )
  }
  if (
    input.expectedIdentity !== undefined &&
    completed.identity !== input.expectedIdentity
  ) {
    return {
      status: BROWSER_OAUTH_STATUS.IdentityMismatch,
      message: `The OAuth login belongs to a different ${flow.displayName} account.`,
    }
  }

  return {
    status: BROWSER_OAUTH_STATUS.Authenticated,
    evidence: completed.evidence,
    identity: completed.identity,
  }
}

/** Creates an OAuth protocol on the shared browser login lifecycle. */
export function createBrowserOAuthContext<Evidence>(
  flow: BrowserOAuthFlow<Evidence>,
  options: BrowserOAuthContextOptions = {},
) {
  return createBrowserLoginContext<Evidence>(
    { ...flow, execute: (session) => executeOAuth(flow, session) },
    options,
  )
}
