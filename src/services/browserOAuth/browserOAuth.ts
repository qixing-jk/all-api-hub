import {
  BROWSER_OAUTH_COMPLETION_STATUS,
  BROWSER_OAUTH_STATUS,
} from "~/constants/browserOAuth"
import {
  createBrowserLoginContext,
  type BrowserLoginContextOptions,
  type BrowserLoginResult,
  type BrowserLoginSession,
} from "~/services/browserLogin/browserLogin"
import { isMessageReceiverUnavailableError } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BrowserOAuth")
const INTERACTIVE_TIMEOUT_MS = 2 * 60 * 1000
const UNATTENDED_TIMEOUT_MS = 45 * 1000
export type BrowserOAuthFailureStatus = Exclude<
  BrowserLoginResult<never>,
  { status: typeof BROWSER_OAUTH_STATUS.Authenticated }
>["status"]

type BrowserOAuthFailure = {
  status: BrowserOAuthFailureStatus
  message?: string
}
export type BrowserOAuthContextOptions = BrowserLoginContextOptions

export type BrowserOAuthPreparation =
  | { authorizationUrl: string }
  | BrowserOAuthFailure

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
  authorizationInteraction?: {
    action: string
    isInteractionUrl(currentUrl: URL, requestedUrl: URL): boolean
  }
  parsePreparation(response: unknown): BrowserOAuthPreparation | null
  parseCompletion(response: unknown): BrowserOAuthCompletion<Evidence>
  isAuthorizationUrl(url: URL): boolean
  isCompletionUrl(url: URL, origin: string): boolean
}

/** Executes OAuth navigation and completion inside the shared account session. */
async function executeOAuth<Evidence>(
  flow: BrowserOAuthFlow<Evidence>,
  session: BrowserLoginSession,
): Promise<BrowserLoginResult<Evidence>> {
  const { input } = session
  const prepareResponse = await session.send<unknown>(flow.prepareAction, {
    ...flow.prepareDetails,
    origin: input.origin,
  })
  const prepared = flow.parsePreparation(prepareResponse)
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
          .send(interaction.action, { authorizationUrl: authorizationUrl.href })
          .catch((error) => {
            if (isMessageReceiverUnavailableError(error)) {
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

  await session.assertOrigin()
  const completionResponse = await session.send<unknown>(flow.completeAction, {
    origin: input.origin,
  })
  const completed = flow.parseCompletion(completionResponse)
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
