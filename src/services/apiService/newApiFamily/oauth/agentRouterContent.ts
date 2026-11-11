import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import {
  BROWSER_OAUTH_CONTENT_FAILURE_REASONS,
  BROWSER_OAUTH_REQUEST_FAILURE_REASONS,
} from "~/constants/browserOAuth"
import {
  isAgentRouterLoginUrl,
  isAgentRouterSystemName,
} from "~/services/accountLogin/providers/agentrouter/config"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { AGENT_ROUTER_ACCOUNT_LOGIN } from "~/services/accountSiteDefinitions/deployments"
import {
  BrowserOAuthRequestError,
  fetchBrowserOAuthRequest,
  runBrowserOAuthContentAction as run,
} from "~/services/browserOAuth/contentRequest"
import { isRecord } from "~/utils/core/object"

const AGENT_ROUTER_OAUTH_ENDPOINTS = {
  Status: "/api/status",
  Logout: "/api/user/logout",
  State: "/api/oauth/state",
  Self: "/api/user/self",
} as const

type SendResponse = (response: unknown) => void

/** Normalized response envelope returned by AgentRouter JSON endpoints. */
interface ApiEnvelope {
  success: boolean
  data?: unknown
  message?: unknown
}

/** A usable envelope must distinguish a definite rejection from a lost reply. */
function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return isRecord(value) && typeof value.success === "boolean"
}

interface AgentRouterOAuthRequest {
  loginProvider?: unknown
}

interface LinuxDoAuthorizationRequest {
  authorizationUrl?: unknown
}

/** Narrows arbitrary JSON to a plain object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

/** Accepts canonical and verified mirror AgentRouter content-script origins. */
function isAgentRouterOrigin(): boolean {
  return isAgentRouterLoginUrl(globalThis.location.href)
}

/** Fetches a fixed same-origin endpoint and validates its success envelope. */
async function fetchEnvelope(
  path: string,
  userId?: string,
): Promise<ApiEnvelope> {
  const mutationRisk =
    path === AGENT_ROUTER_OAUTH_ENDPOINTS.Logout ||
    path.startsWith(AGENT_ROUTER_OAUTH_ENDPOINTS.State)
  const response = await fetchBrowserOAuthRequest(
    path,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(userId
          ? { [AGENT_ROUTER_ACCOUNT_LOGIN.userIdHeader]: userId }
          : {}),
      },
    },
    { mutationRisk },
  )
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw BrowserOAuthRequestError.fromMutationRisk(mutationRisk)
  }
  if (!isApiEnvelope(payload))
    throw BrowserOAuthRequestError.fromMutationRisk(mutationRisk)
  if (!response.ok || payload.success !== true) {
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : `AgentRouter request failed (${response.status})`,
    )
  }
  return payload
}

/**
 * Reads the deployment status and creates a server-signed login state. The
 * endpoint and response fields were verified against https://agentrouter.org
 * on 2026-09-05; no caller-controlled URL or OAuth provider is accepted.
 */
export function handlePrepareAgentRouterOAuth(
  request: AgentRouterOAuthRequest,
  sendResponse: SendResponse,
): true {
  return run(sendResponse, async () => {
    if (!isAgentRouterOrigin()) {
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.UnexpectedOrigin,
      }
    }

    // `checked_in` belongs to the latest OAuth callback. Never let an older
    // login result become evidence for this request.
    globalThis.localStorage.removeItem("user")

    // https://agentrouter.org, verified 2026-09-13: clear the persisted login
    // credential as well as the server session before requesting fresh OAuth.
    globalThis.localStorage.removeItem("__agwt_rt")

    const status = asRecord(
      (await fetchEnvelope(AGENT_ROUTER_OAUTH_ENDPOINTS.Status)).data,
    )
    const loginProvider = request.loginProvider
    const provider =
      loginProvider === ACCOUNT_LOGIN_PROVIDERS.Github
        ? {
            available: status?.github_oauth === true,
            clientId: status?.github_client_id,
            displayName: "GitHub",
          }
        : loginProvider === ACCOUNT_LOGIN_PROVIDERS.LinuxDo
          ? {
              available: status?.linuxdo_oauth === true,
              clientId: status?.linuxdo_client_id,
              displayName: "Linux DO",
            }
          : null
    const clientId =
      typeof provider?.clientId === "string" ? provider.clientId.trim() : ""
    if (
      !provider?.available ||
      !isAgentRouterSystemName(status?.system_name) ||
      !clientId ||
      !/^[A-Za-z0-9_-]+$/.test(clientId)
    ) {
      throw new Error(
        `AgentRouter ${provider?.displayName ?? "selected"} login is unavailable.`,
      )
    }

    // The deployed callback enters account binding when a login session remains,
    // even with mode=login. Use the site's logout contract, then establish state
    // in the resulting anonymous session (verified on agentrouter.org 2026-09-13).
    await fetchEnvelope(AGENT_ROUTER_OAUTH_ENDPOINTS.Logout)
    const statePayload = await fetchEnvelope(
      `${AGENT_ROUTER_OAUTH_ENDPOINTS.State}?mode=login`,
    )
    const state =
      typeof statePayload.data === "string" ? statePayload.data.trim() : ""
    if (!state)
      throw new BrowserOAuthRequestError(
        BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain,
      )

    return { success: true, clientId, state }
  })
}

/** Clears callback-local evidence after a rejected or mismatched login. */
export function handleClearAgentRouterOAuthEvidence(
  sendResponse: SendResponse,
): true {
  return run(sendResponse, async () => {
    if (!isAgentRouterOrigin()) {
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.UnexpectedOrigin,
      }
    }
    globalThis.localStorage.removeItem("user")
    return { success: true }
  })
}

/**
 * Verifies the callback result in the same origin and browser cookie context.
 * The deployed frontend stores the callback data (including `checked_in`) in
 * `localStorage.user` before navigating to `/console/token`.
 */
export function handleCompleteAgentRouterOAuth(
  sendResponse: SendResponse,
): true {
  return run(sendResponse, async () => {
    if (!isAgentRouterOrigin()) {
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.UnexpectedOrigin,
      }
    }
    if (
      !AGENT_ROUTER_ACCOUNT_LOGIN.completionPaths.some(
        (path) => path === globalThis.location.pathname,
      )
    ) {
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.UnexpectedPage,
      }
    }

    let callbackUser: Record<string, unknown> | null
    try {
      callbackUser = asRecord(
        JSON.parse(globalThis.localStorage.getItem("user") || "null"),
      )
    } catch {
      callbackUser = null
    }

    const callbackUserId = normalizeAccountIdentity(callbackUser?.id)
    if (!callbackUserId) {
      globalThis.localStorage.removeItem("user")
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.IdentityMismatch,
      }
    }

    // https://agentrouter.org: the reported /api/user/self rejection requires
    // New-Api-User even with a logged-in cookie session. Use the callback ID as
    // a request hint, then still verify the identity returned by the server.
    const selfUser = asRecord(
      (await fetchEnvelope(AGENT_ROUTER_OAUTH_ENDPOINTS.Self, callbackUserId))
        .data,
    )
    const selfUserId = normalizeAccountIdentity(selfUser?.id)
    if (!selfUserId || callbackUserId !== selfUserId) {
      globalThis.localStorage.removeItem("user")
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.IdentityMismatch,
      }
    }

    return {
      success: true,
      userId: selfUserId,
      ...(typeof callbackUser?.checked_in === "boolean"
        ? { checkedIn: callbackUser.checked_in }
        : {}),
    }
  })
}

/** Accepts only the exact Linux DO authorization URL prepared by this flow. */
function isExpectedLinuxDoAuthorizationPage(requestedUrl: unknown): boolean {
  if (typeof requestedUrl !== "string") return false
  try {
    const requested = new URL(requestedUrl)
    const current = new URL(globalThis.location.href)
    return (
      requested.protocol === "https:" &&
      requested.hostname === "connect.linux.do" &&
      requested.pathname === "/oauth2/authorize" &&
      current.origin === requested.origin &&
      current.pathname === requested.pathname &&
      current.searchParams.get("response_type") === "code" &&
      current.searchParams.get("client_id") ===
        requested.searchParams.get("client_id") &&
      current.searchParams.get("state") ===
        requested.searchParams.get("state") &&
      Boolean(current.searchParams.get("client_id")) &&
      Boolean(current.searchParams.get("state"))
    )
  } catch {
    return false
  }
}

/** Finds one unambiguous semantic authorization control without coordinates. */
function findLinuxDoAuthorizationControl(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="button"], a[href], [role="button"]',
    ),
  ).filter((element) => {
    const formControl = element as HTMLButtonElement | HTMLInputElement
    if (
      element.hidden ||
      formControl.disabled === true ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return false
    }
    const label = (
      element.getAttribute("aria-label") ??
      (element instanceof HTMLInputElement
        ? element.value
        : element.textContent) ??
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
    return /^(authorize|allow|continue|授权|允许|同意|继续)(\s+.+)?$/i.test(
      label,
    )
  })
  const [candidate] = candidates
  return candidates.length === 1 && candidate !== undefined ? candidate : null
}

/** Waits a bounded time for SPA-rendered authorization controls. */
async function waitForLinuxDoAuthorizationControl(): Promise<HTMLElement | null> {
  const current = findLinuxDoAuthorizationControl()
  if (current) return current

  return await new Promise((resolve) => {
    let settled = false
    const finish = (control: HTMLElement | null) => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeoutId)
      observer.disconnect()
      resolve(control)
    }
    const observer = new MutationObserver(() => {
      const control = findLinuxDoAuthorizationControl()
      if (control) finish(control)
    })
    const timeoutId = globalThis.setTimeout(() => finish(null), 12_000)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "disabled",
        "hidden",
        "aria-disabled",
        "aria-hidden",
        "aria-label",
        "type",
        "value",
        "href",
        "role",
      ],
      characterData: true,
    })
  })
}

/**
 * Confirms Linux DO only on the signed authorization page opened by the
 * extension. Login, CAPTCHA, and second-factor prompts remain user-controlled.
 */
export function handleApproveLinuxDoOAuth(
  request: LinuxDoAuthorizationRequest,
  sendResponse: SendResponse,
): true {
  return run(sendResponse, async () => {
    if (!isExpectedLinuxDoAuthorizationPage(request.authorizationUrl)) {
      return {
        success: false,
        reason: BROWSER_OAUTH_CONTENT_FAILURE_REASONS.UnexpectedPage,
      }
    }

    const control = await waitForLinuxDoAuthorizationControl()
    if (!control) {
      return {
        success: false,
        reason:
          BROWSER_OAUTH_CONTENT_FAILURE_REASONS.AuthorizationControlUnavailable,
      }
    }
    control.click()
    return { success: true }
  })
}
