import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import { getErrorMessage } from "~/utils/core/error"

type SendResponse = (response: unknown) => void

/** Normalized response envelope returned by AgentRouter JSON endpoints. */
interface ApiEnvelope {
  success?: boolean
  data?: unknown
  message?: unknown
}

interface AgentRouterOAuthRequest {
  loginProvider?: unknown
}

interface LinuxDoAuthorizationRequest {
  authorizationUrl?: unknown
}

/** Converts the provider's numeric or string identity into a stable string. */
function normalizeIdentity(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

/** Narrows arbitrary JSON to a plain object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Accepts only the canonical HTTPS AgentRouter content-script origin. */
function isAgentRouterOrigin(): boolean {
  return isAgentRouterLoginUrl(globalThis.location.href)
}

/** Fetches a fixed same-origin endpoint and validates its success envelope. */
async function fetchEnvelope(
  path: string,
  userId?: string,
): Promise<ApiEnvelope> {
  const response = await fetch(path, {
    method: "GET",
    credentials: "include",
    redirect: "error",
    headers: {
      Accept: "application/json",
      ...(userId ? { "New-Api-User": userId } : {}),
    },
  })
  const payload = (await response.json()) as ApiEnvelope
  if (!response.ok || payload.success !== true) {
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : `AgentRouter request failed (${response.status})`,
    )
  }
  return payload
}

/** Runs an asynchronous content action and returns its response port signal. */
function run(
  sendResponse: SendResponse,
  work: () => Promise<Record<string, unknown>>,
): true {
  void work()
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        success: false,
        reason: "request_failed",
        message: getErrorMessage(error),
      })
    })
  return true
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
      return { success: false, reason: "unexpected_origin" }
    }

    // `checked_in` belongs to the latest OAuth callback. Never let an older
    // login result become evidence for this request.
    globalThis.localStorage.removeItem("user")

    // https://agentrouter.org, verified 2026-09-13: clear the persisted login
    // credential as well as the server session before requesting fresh OAuth.
    globalThis.localStorage.removeItem("__agwt_rt")

    const status = asRecord((await fetchEnvelope("/api/status")).data)
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
      status?.system_name !== "Agent Router" ||
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
    await fetchEnvelope("/api/user/logout")
    const statePayload = await fetchEnvelope("/api/oauth/state?mode=login")
    const state =
      typeof statePayload.data === "string" ? statePayload.data.trim() : ""
    if (!state) throw new Error("AgentRouter returned an invalid OAuth state.")

    return { success: true, clientId, state }
  })
}

/** Clears callback-local evidence after a rejected or mismatched login. */
export function handleClearAgentRouterOAuthEvidence(
  sendResponse: SendResponse,
): true {
  return run(sendResponse, async () => {
    if (!isAgentRouterOrigin()) {
      return { success: false, reason: "unexpected_origin" }
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
      return { success: false, reason: "unexpected_origin" }
    }
    if (globalThis.location.pathname !== "/console/token") {
      return { success: false, reason: "unexpected_page" }
    }

    let callbackUser: Record<string, unknown> | null = null
    try {
      callbackUser = asRecord(
        JSON.parse(globalThis.localStorage.getItem("user") || "null"),
      )
    } catch {
      callbackUser = null
    }

    const callbackUserId = normalizeIdentity(callbackUser?.id)
    if (!callbackUserId) {
      globalThis.localStorage.removeItem("user")
      return { success: false, reason: "identity_mismatch" }
    }

    // https://agentrouter.org: the reported /api/user/self rejection requires
    // New-Api-User even with a logged-in cookie session. Use the callback ID as
    // a request hint, then still verify the identity returned by the server.
    const selfUser = asRecord(
      (await fetchEnvelope("/api/user/self", callbackUserId)).data,
    )
    const selfUserId = normalizeIdentity(selfUser?.id)
    if (!selfUserId || callbackUserId !== selfUserId) {
      globalThis.localStorage.removeItem("user")
      return { success: false, reason: "identity_mismatch" }
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
      return { success: false, reason: "unexpected_page" }
    }

    const control = await waitForLinuxDoAuthorizationControl()
    if (!control) {
      return { success: false, reason: "authorization_control_unavailable" }
    }
    control.click()
    return { success: true }
  })
}
