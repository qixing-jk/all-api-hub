import {
  readIdentityJwtExpiry,
  readIdentityStorageRecord,
  readIdentityStorageString,
} from "~/services/accountBrowserSession/localIdentityState"
import {
  BrowserOAuthRequestError,
  fetchBrowserOAuthRequest,
  runBrowserOAuthContentAction,
} from "~/services/browserOAuth/contentRequest"
import { isRecord } from "~/utils/core/object"

import {
  clearSub2ApiBrowserSession,
  readSub2ApiBrowserToken,
  SUB2API_AUTH_STORAGE_KEYS,
} from "../browserSession"
import {
  SUB2API_AUTH_ME_ENDPOINT,
  SUB2API_PUBLIC_SETTINGS_ENDPOINT,
} from "../type"
import {
  buildSub2ApiOAuthStartUrl,
  discoverSub2ApiOAuthMethods,
  isSub2ApiOAuthCompletionUrl,
  isSub2ApiOAuthProvider,
  normalizeSub2ApiLoginIdentity,
  requiresSub2ApiOAuthInteraction,
} from "./protocol"

const FLOW_KEY = "all-api-hub:sub2api-oauth"
const EMAIL_PROVIDER_KEY = "email_oauth_pending_provider"
const LOGOUT_ENDPOINT = "/api/v1/auth/logout"

type Request = {
  origin?: unknown
  requestId?: unknown
  loginProvider?: unknown
}
type Reply = (response: unknown) => void

// Kept only in this document, so failed completion cannot clear a newer session
// established in another tab. No token is returned through extension messaging.
let observedSession: { requestId: string; token: string } | undefined

/** Binds fixed content actions to their initiating account origin and request. */
function validate(request: Request): string {
  if (
    request.origin !== location.origin ||
    !["https:", "http:"].includes(location.protocol) ||
    typeof request.requestId !== "string" ||
    !request.requestId.trim()
  ) {
    throw new BrowserOAuthRequestError("request_failed")
  }
  return request.requestId
}

/** Reads only this tab's prepared flow; messages cannot replace its provider. */
function readFlow(requestId: string) {
  const flow: unknown = JSON.parse(sessionStorage.getItem(FLOW_KEY) || "null")
  return isRecord(flow) &&
    flow.requestId === requestId &&
    flow.origin === location.origin &&
    isSub2ApiOAuthProvider(flow.provider)
    ? flow
    : null
}

/** Fetches a fixed same-origin route without automatic refresh or mutation replay. */
async function requestApi(path: string, options: RequestInit = {}) {
  const mutates = options.method === "POST"
  const uncertainReason = mutates ? "uncertain" : "request_failed"
  const response = await fetchBrowserOAuthRequest(
    path,
    {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    },
    { mutationRisk: mutates },
  )
  if (!response.ok) {
    throw new BrowserOAuthRequestError(
      response.status >= 500 ? uncertainReason : "request_failed",
    )
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new BrowserOAuthRequestError(uncertainReason)
  }
  if (!isRecord(body) || typeof body.code !== "number") {
    throw new BrowserOAuthRequestError(uncertainReason)
  }
  if (body.code !== 0) throw new BrowserOAuthRequestError("request_failed")
  return body.data
}

/**
 * Wei-Shaw/sub2api@881f320: auth_handler.go and auth_oauth_logout_test.go.
 * Logout revokes the website refresh token and clears HttpOnly pending/bind
 * cookies even without a token. Local storage clearing alone is insufficient.
 */
export function handlePrepareSub2ApiOAuth(
  request: Request,
  reply: Reply,
): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    if (!isSub2ApiOAuthProvider(request.loginProvider)) {
      return { success: false, reason: "unsupported" }
    }
    const provider = request.loginProvider
    const settings = await requestApi(SUB2API_PUBLIC_SETTINGS_ENDPOINT)
    if (!isRecord(settings))
      throw new BrowserOAuthRequestError("request_failed")
    if (discoverSub2ApiOAuthMethods(settings, [provider]).length === 0) {
      return { success: false, reason: "unsupported" }
    }
    if (requiresSub2ApiOAuthInteraction(settings)) {
      return { success: false, reason: "interaction_required" }
    }

    sessionStorage.removeItem(FLOW_KEY)
    observedSession = undefined
    const refreshToken = readIdentityStorageString(
      SUB2API_AUTH_STORAGE_KEYS.refreshToken,
    )
    await requestApi(LOGOUT_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(refreshToken ? { refresh_token: refreshToken } : {}),
    })
    clearSub2ApiBrowserSession()
    sessionStorage.removeItem(EMAIL_PROVIDER_KEY)
    // OAuthCallbackView.vue also supports provider callbacks arriving at the
    // frontend first, and uses this tab-local hint to forward the code once.
    if (provider === "github" || provider === "google") {
      sessionStorage.setItem(EMAIL_PROVIDER_KEY, provider)
    }
    sessionStorage.setItem(
      FLOW_KEY,
      JSON.stringify({ requestId, origin: location.origin, provider }),
    )
    return {
      success: true,
      authorizationUrl: buildSub2ApiOAuthStartUrl(
        location.origin,
        provider,
        requestId,
      ),
    }
  })
}

/**
 * Upstream *CallbackView.vue owns both legacy token fragments and the current
 * pending-cookie exchange, including interactive adoption/binding/2FA steps.
 * Only its final redirect qualifies; auth/me is an independent Bearer check.
 */
export function handleCompleteSub2ApiOAuth(
  request: Request,
  reply: Reply,
): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    if (
      !readFlow(requestId) ||
      !isSub2ApiOAuthCompletionUrl(
        new URL(location.href),
        location.origin,
        requestId,
      )
    ) {
      return { success: false, reason: "unexpected_page" }
    }
    const { token, expiresAt } = readSub2ApiBrowserToken()
    if (
      !token ||
      (expiresAt !== undefined && expiresAt <= Date.now()) ||
      (readIdentityJwtExpiry(token) ?? Infinity) <= Date.now() ||
      readIdentityStorageString(SUB2API_AUTH_STORAGE_KEYS.pendingAuthSession)
    ) {
      return { success: false, reason: "interaction_required" }
    }
    observedSession = { requestId, token }
    const cachedIdentity = normalizeSub2ApiLoginIdentity(
      readIdentityStorageRecord(SUB2API_AUTH_STORAGE_KEYS.authUser)?.id,
    )
    if (!cachedIdentity) {
      return { success: false, reason: "identity_mismatch" }
    }
    const user = await requestApi(SUB2API_AUTH_ME_ENDPOINT, {
      headers: { Authorization: "Bearer " + token },
    })
    if (readSub2ApiBrowserToken().token !== token) {
      return { success: false, reason: "interaction_required" }
    }
    const identity = normalizeSub2ApiLoginIdentity(
      isRecord(user) ? user.id : null,
    )
    if (identity !== cachedIdentity) {
      return { success: false, reason: "identity_mismatch" }
    }
    return { success: true, identity }
  })
}

/** Removes this operation's evidence and, if unchanged, its failed session. */
export function handleClearSub2ApiOAuthEvidence(
  request: Request,
  reply: Reply,
): true {
  return runBrowserOAuthContentAction(reply, async () => {
    const requestId = validate(request)
    if (readFlow(requestId)) {
      sessionStorage.removeItem(FLOW_KEY)
      sessionStorage.removeItem(EMAIL_PROVIDER_KEY)
      if (
        observedSession?.requestId === requestId &&
        readSub2ApiBrowserToken().token === observedSession.token
      ) {
        clearSub2ApiBrowserSession()
      }
      observedSession = undefined
    }
    return { success: true }
  })
}
