import {
  createWindow,
  getTab,
  onTabRemoved,
  onTabUpdated,
  onWindowRemoved,
  queryTabs,
  removeTab,
  removeWindow,
  sendTabMessageWithRetry,
  updateTab,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("BrowserOAuth")
const AUTH_TIMEOUT_MS = 4 * 60 * 1000
const INITIAL_PAGE_TIMEOUT_MS = 30 * 1000
const KEEPALIVE_INTERVAL_MS = 20 * 1000

const activeAuthenticationRequests = new Map<string, string>()

interface OpenedAuthContext {
  tabId: number
  windowId?: number
}

interface BrowserOAuthInput {
  expectedIdentity?: string
  origin: string
  requestId: string
}

export type BrowserOAuthFailureStatus =
  | "cancelled"
  | "failed"
  | "identity_mismatch"
  | "interaction_required"

export type BrowserOAuthResult<Evidence> =
  | {
      status: "authenticated"
      evidence: Evidence
      identity: string
    }
  | {
      status: BrowserOAuthFailureStatus | "uncertain"
      message?: string
    }

interface BrowserOAuthContext<Evidence> {
  authenticate(input: BrowserOAuthInput): Promise<BrowserOAuthResult<Evidence>>
}

export interface BrowserOAuthPreparation {
  authorizationUrl: string
}

export type BrowserOAuthCompletion<Evidence> =
  | { status: "verified"; identity: string; evidence: Evidence }
  | { status: "identity_mismatch" }
  | { status: "invalid"; message?: string }

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

class AuthCancelledError extends Error {}
class AuthTimeoutError extends Error {}

/** Opens the user-visible popup used for the configured OAuth flow. */
async function openVisibleAuthContext(
  origin: string,
  loginPath: string,
): Promise<OpenedAuthContext> {
  const loginUrl = new URL(loginPath, origin)
  if (loginUrl.origin !== origin) {
    throw new Error("The OAuth login page must use the account origin.")
  }
  const opened = await createWindow({
    url: loginUrl.href,
    type: "popup",
    focused: true,
    width: 520,
    height: 720,
  })
  if (!opened) throw new Error("A visible browser window could not be opened.")

  const windowId = opened.id
  const initialTab = opened.tabs?.find((tab) => typeof tab.id === "number")
  const tab =
    initialTab ??
    (typeof windowId === "number"
      ? (await queryTabs({ windowId })).find(
          (candidate) => typeof candidate.id === "number",
        )
      : undefined)
  if (typeof tab?.id !== "number") {
    if (typeof windowId === "number") await removeWindow(windowId)
    throw new Error("The authentication tab could not be opened.")
  }

  return {
    tabId: tab.id,
    ...(typeof windowId === "number" ? { windowId } : {}),
  }
}

/** Closes the temporary authentication popup or tab. */
async function closeAuthContext(context: OpenedAuthContext): Promise<void> {
  try {
    if (typeof context.windowId === "number") {
      await removeWindow(context.windowId)
    } else {
      await removeTab(context.tabId)
    }
  } catch {
    // The user may already have closed the tab/window.
  }
}

/** Waits for a tab state while listening for cancellation and bounded timeout. */
async function waitForTab(
  context: OpenedAuthContext,
  predicate: (tab: browser.tabs.Tab) => boolean,
  timeoutMs: number,
  onPending?: (tab: browser.tabs.Tab) => void,
): Promise<browser.tabs.Tab> {
  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (outcome: { tab: browser.tabs.Tab } | { error: Error }) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeoutId)
      globalThis.clearInterval(keepaliveId)
      removeUpdated()
      removeTabClosed()
      removeWindowClosed()
      if ("tab" in outcome) resolve(outcome.tab)
      else reject(outcome.error)
    }
    const inspect = (tab: browser.tabs.Tab) => {
      if (tab.id !== context.tabId) return
      if (predicate(tab)) finish({ tab })
      else onPending?.(tab)
    }
    const removeUpdated = onTabUpdated((tabId, _changeInfo, tab) => {
      if (tabId === context.tabId) inspect(tab)
    })
    const removeTabClosed = onTabRemoved((tabId) => {
      if (tabId === context.tabId) {
        finish({
          error: new AuthCancelledError("Authentication was cancelled."),
        })
      }
    })
    const removeWindowClosed = onWindowRemoved((windowId) => {
      if (windowId === context.windowId) {
        finish({
          error: new AuthCancelledError("Authentication was cancelled."),
        })
      }
    })
    const timeoutId = globalThis.setTimeout(
      () =>
        finish({ error: new AuthTimeoutError("Authentication timed out.") }),
      timeoutMs,
    )

    // Chrome MV3 workers may otherwise be suspended while the user is on the
    // identity provider. A scoped tabs API poll observes completion and keeps this
    // bounded user-visible operation alive without persisting credentials.
    const keepaliveId = globalThis.setInterval(() => {
      void getTab(context.tabId)
        .then(inspect)
        .catch(() => {
          finish({
            error: new AuthCancelledError("Authentication was cancelled."),
          })
        })
    }, KEEPALIVE_INTERVAL_MS)

    void getTab(context.tabId)
      .then(inspect)
      .catch(() => {
        finish({
          error: new AuthCancelledError("Authentication was cancelled."),
        })
      })
  })
}

/** Rejects navigation outside the configured account origin. */
async function assertTabOrigin(
  context: OpenedAuthContext,
  origin: string,
): Promise<void> {
  const tab = await getTab(context.tabId)
  if (!tab.url || new URL(tab.url).origin !== origin) {
    throw new Error("The authentication tab left the account origin.")
  }
}

/** Sends a fixed content-script action to the authentication tab. */
async function sendContentMessage<T>(
  tabId: number,
  action: string,
  requestId: string,
  details: Record<string, unknown> = {},
): Promise<T> {
  return await sendTabMessageWithRetry<T>(
    tabId,
    { ...details, action, requestId },
    {
      maxAttempts: 8,
      delayMs: 400,
    },
  )
}

/** Executes one guarded browser OAuth flow. */
async function authenticateBrowserOAuth<Evidence>(
  flow: BrowserOAuthFlow<Evidence>,
  input: BrowserOAuthInput,
): Promise<BrowserOAuthResult<Evidence>> {
  let context: OpenedAuthContext | null = null
  let authenticated = false
  try {
    context = await openVisibleAuthContext(input.origin, flow.loginPath)
    await waitForTab(
      context,
      (tab) =>
        tab.status === "complete" &&
        Boolean(tab.url?.startsWith(`${input.origin}/`)),
      INITIAL_PAGE_TIMEOUT_MS,
    )
    await assertTabOrigin(context, input.origin)

    const prepareResponse = await sendContentMessage<unknown>(
      context.tabId,
      flow.prepareAction,
      input.requestId,
      flow.prepareDetails,
    )
    const prepared = flow.parsePreparation(prepareResponse)
    if (!prepared) {
      throw new Error(`${flow.displayName} OAuth could not be prepared.`)
    }
    const authorizationUrl = new URL(prepared.authorizationUrl)
    if (!flow.isAuthorizationUrl(authorizationUrl)) {
      throw new Error(`${flow.displayName} returned an invalid OAuth URL.`)
    }

    await updateTab(context.tabId, {
      url: authorizationUrl.href,
      active: true,
    })
    const handledInteractionUrls = new Set<string>()
    await waitForTab(
      context,
      (tab) => {
        if (tab.status !== "complete" || !tab.url) return false
        try {
          return flow.isCompletionUrl(new URL(tab.url), input.origin)
        } catch {
          return false
        }
      },
      AUTH_TIMEOUT_MS,
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
          void sendContentMessage(
            context!.tabId,
            interaction.action,
            input.requestId,
            { authorizationUrl: authorizationUrl.href },
          ).catch((error) => {
            handledInteractionUrls.delete(currentUrl.href)
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

    await assertTabOrigin(context, input.origin)
    const completionResponse = await sendContentMessage<unknown>(
      context.tabId,
      flow.completeAction,
      input.requestId,
    )
    const completed = flow.parseCompletion(completionResponse)
    if (completed.status === "identity_mismatch") {
      return { status: "identity_mismatch" }
    }
    if (completed.status === "invalid") {
      throw new Error(
        completed.message ?? `${flow.displayName} OAuth could not be verified.`,
      )
    }
    if (
      input.expectedIdentity !== undefined &&
      completed.identity !== input.expectedIdentity
    ) {
      return {
        status: "identity_mismatch",
        message: `The OAuth login belongs to a different ${flow.displayName} account.`,
      }
    }

    authenticated = true
    return {
      status: "authenticated",
      evidence: completed.evidence,
      identity: completed.identity,
    }
  } catch (error) {
    if (error instanceof AuthCancelledError) {
      return { status: "cancelled", message: error.message }
    }
    if (error instanceof AuthTimeoutError) {
      return { status: "interaction_required", message: error.message }
    }
    logger.warn(`${flow.displayName} OAuth authentication failed`, {
      error: getErrorMessage(error),
      flowId: flow.id,
      requestId: input.requestId,
    })
    return { status: "failed", message: getErrorMessage(error) }
  } finally {
    if (!authenticated) {
      if (context) {
        try {
          await assertTabOrigin(context, input.origin)
          await sendContentMessage(
            context.tabId,
            flow.clearEvidenceAction,
            input.requestId,
          )
        } catch {
          // The tab may still be on the identity provider or already be closed.
        }
      }
    }
    if (context) await closeAuthContext(context)
  }
}

/** Creates a reusable browser OAuth context for one browser flow. */
export function createBrowserOAuthContext<Evidence>(
  flow: BrowserOAuthFlow<Evidence>,
): BrowserOAuthContext<Evidence> {
  return {
    async authenticate(input) {
      if (activeAuthenticationRequests.has(flow.concurrencyKey)) {
        return {
          status: "interaction_required",
          message: `Another ${flow.displayName} OAuth login is already in progress.`,
        }
      }

      activeAuthenticationRequests.set(flow.concurrencyKey, input.requestId)
      try {
        return await authenticateBrowserOAuth(flow, input)
      } finally {
        if (
          activeAuthenticationRequests.get(flow.concurrencyKey) ===
          input.requestId
        ) {
          activeAuthenticationRequests.delete(flow.concurrencyKey)
        }
      }
    },
  }
}
