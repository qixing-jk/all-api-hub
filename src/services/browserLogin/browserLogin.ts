import {
  BROWSER_LOGIN_PAGE_TIMEOUT_MS,
  BROWSER_LOGIN_STATUS,
  LOGIN_VERIFICATION_REASONS,
} from "~/constants/browserLogin"
import type {
  BrowserLoginSessionMode,
  LoginVerificationReason,
} from "~/constants/browserLogin"
import { TURNSTILE_MANUAL_WAIT_MS } from "~/constants/turnstile"
import { resolveTempWindowSize } from "~/services/browsingContext/tempPage/windowSize"
import { createKeyedTaskQueue } from "~/services/core/keyedTaskQueue"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import {
  getTab,
  onTabRemoved,
  onTabUpdated,
  queryTabs,
  removeTab,
  updateTab,
} from "~/utils/browser/tabs"
import {
  createWindow,
  onWindowRemoved,
  removeWindow,
} from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  getLoginVerificationContext,
  registerLoginVerificationContext,
  requestLoginVerificationAssist,
} from "./verificationContexts"

const logger = createLogger("BrowserLogin")
const KEEPALIVE_INTERVAL_MS = 20 * 1000
/**
 * How long a queued login waits for the shared session. Its clock starts
 * together with the flow ahead of it, so it only has to outlive that flow's own
 * bound - page load plus one interactive login - with room for the
 * content-script round trips.
 */
const SESSION_WAIT_TIMEOUT_MS =
  BROWSER_LOGIN_PAGE_TIMEOUT_MS + 2 * 60 * 1000 + 30 * 1000

// Browser flows that share a concurrency key act on the same site session, so
// they cannot run at the same time. Queue the later request instead of rejecting
// it, otherwise batch logins (for example one Linux DO and one GitHub account)
// fail with a misleading "login required" result.
const authenticationQueue = createKeyedTaskQueue()

// Concurrent logins for the same provider account share one browser flow
// instead of opening a second popup for the same identity.
const inFlightAuthentications = new Map<string, Promise<unknown>>()

interface OpenedAuthContext {
  tabId: number
  windowId?: number
}

export interface BrowserLoginInput {
  expectedIdentity?: string
  origin: string
  requestId: string
  /**
   * Whether a person is expected to complete the provider sign-in in the popup.
   * Absent means one is: only a run nobody can interact with passes `false`.
   */
  attended?: boolean
  sessionMode?: BrowserLoginSessionMode
}

type BrowserLoginProtocolFailureStatus =
  | typeof BROWSER_LOGIN_STATUS.Unsupported
  | typeof BROWSER_LOGIN_STATUS.Cancelled
  | typeof BROWSER_LOGIN_STATUS.Failed
  | typeof BROWSER_LOGIN_STATUS.IdentityMismatch
  | typeof BROWSER_LOGIN_STATUS.InteractionRequired
  | typeof BROWSER_LOGIN_STATUS.Uncertain

export type BrowserLoginFailureStatus =
  | BrowserLoginProtocolFailureStatus
  | typeof BROWSER_LOGIN_STATUS.SessionBusy

export type BrowserLoginResult<Evidence> =
  | {
      status: typeof BROWSER_LOGIN_STATUS.Authenticated
      evidence: Evidence
      identity: string
    }
  | {
      status: BrowserLoginFailureStatus
      message?: string
    }

export interface BrowserLoginContext<Evidence> {
  authenticate(input: BrowserLoginInput): Promise<BrowserLoginResult<Evidence>>
}

export interface BrowserLoginContextOptions {
  /**
   * How long a queued login waits for the shared session before it reports
   * `BROWSER_LOGIN_STATUS.SessionBusy` instead of opening another popup.
   * Defaults to a bound that outlives one interactive login ahead of it.
   */
  sessionWaitTimeoutMs?: number
}

export interface BrowserLoginSession {
  input: BrowserLoginInput
  send<T = unknown>(
    action: string,
    details?: Record<string, unknown>,
  ): Promise<T>
  navigate(url: string): Promise<unknown>
  assertOrigin(): Promise<void>
  canResetSession(): Promise<boolean>
  requestAssist(reason?: LoginVerificationReason): Promise<boolean>
  interactionDeadline(): number
  waitForTab(
    predicate: (tab: browser.tabs.Tab) => boolean,
    timeoutMs: number,
    onPending?: (tab: browser.tabs.Tab) => void,
  ): Promise<browser.tabs.Tab>
}

export interface BrowserLoginProtocol<Evidence> {
  id: string
  concurrencyKey: string
  displayName: string
  loginPath: string
  clearEvidenceAction: string
  preferIncognito?: boolean
  joinConcurrent?: boolean
  execute(session: BrowserLoginSession): Promise<BrowserLoginResult<Evidence>>
  failure?(error: unknown): BrowserLoginResult<Evidence>
}

class AuthCancelledError extends Error {}
class AuthTimeoutError extends Error {}

/** Opens the user-visible popup used for the configured account login flow. */
async function openVisibleAuthContext(
  origin: string,
  loginPath: string,
  preferIncognito = false,
  attended = true,
): Promise<OpenedAuthContext> {
  const loginUrl = new URL(loginPath, origin)
  if (loginUrl.origin !== origin) {
    throw new Error("The login page must use the account origin.")
  }
  const opened = await createWindow({
    ...(preferIncognito
      ? { incognito: (await isAllowedIncognitoAccess()) === true }
      : {}),
    url: loginUrl.href,
    type: "popup",
    focused: attended,
    ...(await resolveTempWindowSize()),
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
      // Retry only when the receiver is unavailable, before the action can run.
      // The shared helper never replays a dispatched action after a lost response.
      maxAttempts: 8,
      delayMs: 400,
    },
  )
}

/** Owns browser lifetime and cleanup; protocols own execution and evidence. */
async function authenticateBrowserLogin<Evidence>(
  flow: BrowserLoginProtocol<Evidence>,
  input: BrowserLoginInput,
): Promise<BrowserLoginResult<Evidence>> {
  let context: OpenedAuthContext | null = null
  let authenticated = false
  let disposeVerification: (() => void) | undefined
  let interactionDeadline = 0
  let openedReminder = false
  try {
    context = await openVisibleAuthContext(
      input.origin,
      flow.loginPath,
      flow.preferIncognito,
      input.attended !== false,
    )
    await waitForTab(
      context,
      (tab) =>
        tab.status === "complete" &&
        Boolean(tab.url?.startsWith(`${input.origin}/`)),
      BROWSER_LOGIN_PAGE_TIMEOUT_MS,
    )
    await assertTabOrigin(context, input.origin)
    const opened = context
    if (flow.preferIncognito) {
      disposeVerification = registerLoginVerificationContext(input.requestId, {
        reason: LOGIN_VERIFICATION_REASONS.Login,
        tabId: opened.tabId,
        ownerWindowId: opened.windowId,
        onOpened: () => {
          if (!openedReminder) {
            openedReminder = true
            interactionDeadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
          }
        },
      })
    }
    const result = await flow.execute({
      input,
      send: (action, details) =>
        sendContentMessage(opened.tabId, action, input.requestId, details),
      navigate: (url) => updateTab(opened.tabId, { url, active: true }),
      assertOrigin: () => assertTabOrigin(opened, input.origin),
      async canResetSession() {
        const tab = await getTab(opened.tabId)
        if (!tab.incognito) return false
        const others = await queryTabs({})
        return !others.some(
          (other) =>
            other.id !== opened.tabId &&
            other.incognito === true &&
            other.url &&
            new URL(other.url).origin === input.origin,
        )
      },
      async requestAssist(reason) {
        const registered = getLoginVerificationContext(input.requestId)
        if (registered) registered.reason = reason
        return requestLoginVerificationAssist(input.requestId)
      },
      interactionDeadline: () => interactionDeadline,
      waitForTab: (predicate, timeoutMs, onPending) =>
        waitForTab(opened, predicate, timeoutMs, onPending),
    })
    authenticated = result.status === BROWSER_LOGIN_STATUS.Authenticated
    return result
  } catch (error) {
    if (error instanceof AuthCancelledError)
      return { status: BROWSER_LOGIN_STATUS.Cancelled, message: error.message }
    if (error instanceof AuthTimeoutError)
      return {
        status: BROWSER_LOGIN_STATUS.InteractionRequired,
        message: error.message,
      }
    if (flow.failure) return flow.failure(error)
    logger.warn(`${flow.displayName} authentication failed`, {
      error: getErrorMessage(error),
      flowId: flow.id,
      requestId: input.requestId,
    })
    return {
      status: BROWSER_LOGIN_STATUS.Failed,
      message: getErrorMessage(error),
    }
  } finally {
    if (!authenticated && context) {
      try {
        await assertTabOrigin(context, input.origin)
        await sendContentMessage(
          context.tabId,
          flow.clearEvidenceAction,
          input.requestId,
          { origin: input.origin },
        )
      } catch {
        // The document may already be closed or outside the account origin.
      }
    }
    disposeVerification?.()

    if (context) await closeAuthContext(context)
  }
}

/** Signals that a queued login never got the shared session in time. */
const SESSION_WAIT_EXPIRED = Symbol("session-wait-expired")

/**
 * Waits for the shared session, then either runs the flow or reports it busy.
 *
 * The wait bound only covers queueing: once the session is granted the bound is
 * cleared and the flow relies on its own interactive timeout.
 */
async function authenticateWithinSessionWait<Evidence>(
  flow: BrowserLoginProtocol<Evidence>,
  input: BrowserLoginInput,
  sessionWaitTimeoutMs: number,
): Promise<BrowserLoginResult<Evidence>> {
  let waitExpired = false
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined
  const waitBound = new Promise<typeof SESSION_WAIT_EXPIRED>((resolve) => {
    timeoutId = globalThis.setTimeout(() => {
      waitExpired = true
      resolve(SESSION_WAIT_EXPIRED)
    }, sessionWaitTimeoutMs)
  })

  // Origins do not share a site session, so only one origin waits on this key.
  const queued = authenticationQueue.run(
    `${flow.concurrencyKey}:${input.origin}`,
    async () => {
      globalThis.clearTimeout(timeoutId)
      if (waitExpired) return SESSION_WAIT_EXPIRED
      return await authenticateBrowserLogin(flow, input)
    },
  )

  const outcome = await Promise.race([queued, waitBound])
  if (outcome === SESSION_WAIT_EXPIRED) {
    return {
      status: BROWSER_LOGIN_STATUS.SessionBusy,
      message: `${flow.displayName} is waiting for another login that is already in progress.`,
    }
  }
  return outcome
}

/** Identifies concurrent logins that target one provider account. */
function buildJoinKey<Evidence>(
  flow: BrowserLoginProtocol<Evidence>,
  input: BrowserLoginInput,
): string | null {
  if (!input.expectedIdentity || flow.joinConcurrent === false) return null
  // Different interaction budgets cannot share one deadline. They still take
  // turns through the shared session queue.
  return `${flow.id}\u0000${input.origin}\u0000${input.expectedIdentity}\u0000${input.attended === false ? "unattended" : "attended"}`
}

/** Owns lifecycle and session scheduling for both native and OAuth protocols. */
export function createBrowserLoginContext<Evidence>(
  flow: BrowserLoginProtocol<Evidence>,
  options: BrowserLoginContextOptions = {},
): BrowserLoginContext<Evidence> {
  const sessionWaitTimeoutMs =
    options.sessionWaitTimeoutMs ?? SESSION_WAIT_TIMEOUT_MS

  return {
    async authenticate(input) {
      const joinKey = buildJoinKey(flow, input)
      const joined = joinKey ? inFlightAuthentications.get(joinKey) : undefined
      if (joined) return (await joined) as BrowserLoginResult<Evidence>

      const started = authenticateWithinSessionWait(
        flow,
        input,
        sessionWaitTimeoutMs,
      )
      if (joinKey) {
        inFlightAuthentications.set(joinKey, started)
        const releaseJoin = () => {
          if (inFlightAuthentications.get(joinKey) === started) {
            inFlightAuthentications.delete(joinKey)
          }
        }
        void started.then(releaseJoin, releaseJoin)
      }
      return await started
    },
  }
}
