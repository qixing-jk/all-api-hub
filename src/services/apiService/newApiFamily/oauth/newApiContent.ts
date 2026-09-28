import {
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"
import {
  fetchBrowserOAuthRequest,
  runBrowserOAuthContentAction,
} from "~/services/browserOAuth/contentRequest"

import { NEW_API_OAUTH_PROVIDERS } from "./contracts"
import {
  buildNewApiAuthorizationUrl,
  discoverNewApiLoginMethods,
} from "./discovery"

const FLOW_KEY = "all-api-hub:oauth"
type Request = {
  requestId?: unknown
  origin?: unknown
  loginProvider?: unknown
  userIdHeader?: unknown
  completionPaths?: unknown
}
type Reply = (response: unknown) => void

type ObservedSession =
  | { requestId: string; modern: true; sessionId: string; userId: string }
  | { requestId: string; modern: false; userId: string }

// Kept only in this document so failure cleanup cannot revoke a newer session
// established in another tab. No credential crosses the message boundary.
let observedSession: ObservedSession | undefined

/** Accept only configured local pathnames, with no origin or query override. */
function parseCompletionPaths(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (path) => typeof path === "string" && /^\/(?!\/)[^?#\\]*$/.test(path),
    )
  )
    throw new Error("Invalid completion paths")
  return value
}

/** Identity hints cannot override Authorization or other credential headers. */
function parseUserIdHeader(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z][A-Za-z0-9-]{0,60}-User$/i.test(value)
  )
    throw new Error("Invalid identity header")
  return value
}

/** The content action is bound to the origin chosen by the background operation. */
function validate(request: Request): string {
  if (
    request.origin !== location.origin ||
    !["http:", "https:"].includes(location.protocol) ||
    typeof request.requestId !== "string" ||
    !request.requestId
  )
    throw new Error("Invalid login context")
  return request.requestId
}

/** Reads only a fixed same-origin endpoint; credentials never leave this context. */
async function requestApi(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
  mutates = method !== "GET",
) {
  return await fetchBrowserOAuthRequest(
    path,
    {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    { mutationRisk: mutates },
  )
}

/** Avoid reporting raw authentication responses, which can contain session secrets. */
async function envelope(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error(`Login request failed (${response.status})`)
  const payload = await response.json()
  if (payload?.success !== true) throw new Error("Login request was rejected")
  return payload
}

/**
 * New API auth-flow contract: QuantumNous/new-api/controller/oauth.go and
 * web/src/features/auth/api.ts. Only definite missing routes allow legacy fallback;
 * timeouts, rejected business envelopes and server errors never replay mutations.
 */
export function handlePrepareNewApiOAuth(request: Request, reply: Reply): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    const userIdHeader = parseUserIdHeader(request.userIdHeader)
    const completionPaths = parseCompletionPaths(request.completionPaths)
    sessionStorage.removeItem(FLOW_KEY)
    observedSession = undefined
    const status = (await envelope(await requestApi("/api/status"))).data
    if (!status || typeof status !== "object") throw new Error("Invalid status")
    const method = discoverNewApiLoginMethods(
      status as Record<string, unknown>,
      Object.values(NEW_API_OAUTH_PROVIDERS),
    ).find((item) => item.provider === request.loginProvider)
    if (!method) return { success: false, reason: "unsupported" }

    const logout = await requestApi("/api/user/auth/logout", "POST")
    const modern = logout.status !== 404 && logout.status !== 405
    await envelope(
      modern
        ? logout
        : await requestApi(
            "/api/user/logout",
            "GET",
            undefined,
            undefined,
            true,
          ),
    )
    localStorage.removeItem("user")
    const payload = await envelope(
      modern
        ? await requestApi("/api/oauth/state", "POST", {
            provider: method.provider,
            intent: "login",
          })
        : await requestApi(
            "/api/oauth/state",
            "GET",
            undefined,
            undefined,
            true,
          ),
    )
    const data = payload.data
    const state =
      modern && data && typeof data === "object"
        ? (data as Record<string, unknown>).flow_token
        : data
    if (typeof state !== "string" || !state.trim())
      throw new Error("Invalid OAuth state")
    sessionStorage.setItem(
      FLOW_KEY,
      JSON.stringify({ requestId, modern, userIdHeader, completionPaths }),
    )
    return {
      success: true,
      authorizationUrl: buildNewApiAuthorizationUrl(
        method,
        state,
        location.origin,
      ),
    }
  })
}

/** Verifies the actual server identity for both session-cookie and auth-bundle releases. */
export function handleCompleteNewApiOAuth(
  request: Request,
  reply: Reply,
): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null")
    if (flow?.requestId !== requestId)
      return { success: false, reason: "unexpected_page" }
    if (!parseCompletionPaths(flow.completionPaths).includes(location.pathname))
      return { success: false, reason: "unexpected_page" }
    let userId: unknown
    let headers: Record<string, string>
    if (flow.modern === true) {
      // Current New API stores its bearer only in memory. Refresh in the same
      // browser cookie context, verify /self, and never export the auth bundle.
      const parsed = parseNewApiDashboardAuthBundleResponse(
        await envelope(
          await requestApi(NEW_API_DASHBOARD_AUTH_REFRESH_PATH, "POST"),
        ),
      )
      if (parsed.kind !== "valid") throw new Error("Missing session")
      userId = parsed.bundle.user.id
      headers = { Authorization: `Bearer ${parsed.bundle.token}` }
      if (
        (typeof userId === "number" || typeof userId === "string") &&
        String(userId).trim()
      ) {
        observedSession = {
          requestId,
          modern: true,
          sessionId: parsed.bundle.sessionId,
          userId: String(userId),
        }
      }
    } else {
      userId = JSON.parse(localStorage.getItem("user") || "null")?.id
      const userIdHeader = parseUserIdHeader(flow.userIdHeader)
      headers = { [userIdHeader]: String(userId) }
      if (
        (typeof userId === "number" || typeof userId === "string") &&
        String(userId).trim()
      ) {
        observedSession = {
          requestId,
          modern: false,
          userId: String(userId),
        }
      }
    }
    if (
      (typeof userId !== "number" && typeof userId !== "string") ||
      !String(userId).trim()
    )
      return { success: false, reason: "identity_mismatch" }
    const self = (
      await envelope(
        await requestApi("/api/user/self", "GET", undefined, headers),
      )
    ).data as Record<string, unknown> | undefined
    if (String(self?.id) !== String(userId))
      return { success: false, reason: "identity_mismatch" }
    return { success: true, userId: String(userId) }
  })
}

/** Drops only this flow's local evidence, never an extension account credential. */
export function handleClearNewApiOAuthEvidence(
  request: Request,
  reply: Reply,
): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    const flow = JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null")
    if (flow?.requestId === requestId) {
      sessionStorage.removeItem(FLOW_KEY)
      const observed = observedSession
      if (observed?.requestId === requestId) {
        if (observed.modern) {
          const current = parseNewApiDashboardAuthBundleResponse(
            await envelope(
              await requestApi(NEW_API_DASHBOARD_AUTH_REFRESH_PATH, "POST"),
            ),
          )
          const currentUserId =
            current.kind === "valid" ? String(current.bundle.user.id) : null
          if (
            current.kind === "valid" &&
            current.bundle.sessionId === observed.sessionId &&
            currentUserId === observed.userId
          ) {
            await envelope(await requestApi("/api/user/auth/logout", "POST"))
          }
        } else {
          const currentUserId = String(
            JSON.parse(localStorage.getItem("user") || "null")?.id ?? "",
          )
          if (currentUserId === observed.userId) {
            await envelope(
              await requestApi(
                "/api/user/logout",
                "GET",
                undefined,
                undefined,
                true,
              ),
            )
          }
        }
      }
      localStorage.removeItem("user")
      observedSession = undefined
    }
    return { success: true }
  })
}
