import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
  type AccountSiteBackendFamily,
} from "~/services/accountSiteDefinitions"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
  isCanonicalOpenRouterUrl,
} from "~/services/accountSiteDefinitions/identifiers"
import {
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"
import { SHAREDCHAT_GETME_ENDPOINT } from "~/services/apiService/sharedchat/constants"
import { SUB2API_AUTH_ME_ENDPOINT } from "~/services/apiService/sub2api/type"
import {
  VOAPI_V2_ENDPOINTS,
  VOAPI_V2_PROTOCOL_CODES,
} from "~/services/apiService/voapiV2/type"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { parseCookieHeader } from "~/utils/browser/cookieString"
import { isRecord } from "~/utils/core/object"
import { tryParseOrigin } from "~/utils/core/urlParsing"

const IDENTITY_VERIFICATION_TIMEOUT_MS = 5000

type VerificationContext = {
  origin: string
  siteType: AccountSiteType
  candidateUserIds: readonly string[]
  signal: AbortSignal
}

type IdentityVerifier = (context: VerificationContext) => Promise<string | null>

/** Reads only a provider-owned storage key; unavailable storage is not identity evidence. */
function readStoredRecord(key: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null")
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

/** Reads a page-owned login token without copying it into extension storage. */
function readStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key)?.trim() || null
  } catch {
    return null
  }
}

/** Sends a bounded request with the page's own session and no redirect fallback. */
async function fetchBrowserSessionJson(input: {
  url: string
  signal: AbortSignal
  headers?: Record<string, string>
  method?: "GET" | "POST"
}): Promise<{ status: number; body: Record<string, unknown> | null } | null> {
  try {
    const response = await fetch(input.url, {
      method: input.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: input.signal,
      headers: input.headers,
    })
    if (!response.ok) return { status: response.status, body: null }
    const body: unknown = await response.json()
    return { status: response.status, body: isRecord(body) ? body : null }
  } catch {
    return null
  }
}

/** Fetches one authenticated, read-only identity endpoint in the current page. */
async function fetchIdentity(input: {
  url: string
  signal: AbortSignal
  headers?: Record<string, string>
  parse: (body: Record<string, unknown>) => unknown
}): Promise<string | null> {
  const response = await fetchBrowserSessionJson(input)
  return response?.body
    ? normalizeAccountIdentity(input.parse(response.body))
    : null
}

/** Reads only the server-confirmed user from the New API family response envelope. */
function parseNewApiIdentity(body: Record<string, unknown> | null | undefined) {
  return body?.success === true && isRecord(body.data)
    ? normalizeAccountIdentity(body.data.id)
    : null
}

/**
 * Modern New API keeps its dashboard token in memory. Reconcile its HttpOnly
 * session once, then verify that transient token against /self. Refresh is never
 * replayed or persisted, including when its response is lost.
 * https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.22/web/src/lib/auth-session.ts
 */
async function verifyNewApiDashboardIdentity(context: VerificationContext) {
  const verify = async () => {
    if (
      context.signal.aborted ||
      tryParseOrigin(location.href) !== context.origin
    )
      return null
    const response = await fetchBrowserSessionJson({
      url: `${context.origin}${NEW_API_DASHBOARD_AUTH_REFRESH_PATH}`,
      signal: context.signal,
      method: "POST",
    })
    const parsed = parseNewApiDashboardAuthBundleResponse(response?.body)
    if (parsed.kind !== "valid") return null
    const expectedUserId = normalizeAccountIdentity(parsed.bundle.user.id)
    if (!expectedUserId) return null

    const userId = await fetchIdentity({
      url: `${context.origin}/api/user/self`,
      signal: context.signal,
      headers: { Authorization: `Bearer ${parsed.bundle.token}` },
      parse: parseNewApiIdentity,
    })
    return userId === expectedUserId ? userId : null
  }

  try {
    // Share the website's origin-scoped refresh lock to avoid rotating its
    // refresh cookie concurrently with the dashboard or another extension view.
    return navigator.locks?.request
      ? await navigator.locks.request(
          "new-api:auth-refresh",
          {
            mode: "exclusive",
            signal: context.signal,
          },
          verify,
        )
      : await verify()
  } catch {
    return null
  }
}

/** Verifies the website Cookie session; saved account tokens never prove the active login. */
const verifyNewApiIdentity: IdentityVerifier = async (context) => {
  const currentState =
    context.siteType === SITE_TYPES.V_API
      ? readStoredRecord("user-storage")?.state
      : null
  const currentUser =
    isRecord(currentState) && isRecord(currentState.user)
      ? currentState.user
      : null
  const hintedUserId =
    normalizeAccountIdentity(currentUser?.id) ??
    normalizeAccountIdentity(readStoredRecord("user")?.id)
  // Legacy New API requires a header matching the Cookie session. If page
  // storage is stale/missing, let the server check saved same-site identities.
  // https://github.com/QuantumNous/new-api/blob/v0.9.0/middleware/auth.go#L72-L99
  const hints = new Set([hintedUserId, ...context.candidateUserIds])
  for (const hint of hints) {
    if (
      context.signal.aborted ||
      tryParseOrigin(location.href) !== context.origin
    )
      return null
    const response = await fetchBrowserSessionJson({
      url: `${context.origin}/api/user/self`,
      signal: context.signal,
      headers: buildCompatUserIdHeaders(hint),
    })
    const userId = parseNewApiIdentity(response?.body)
    if (userId || response?.status !== 401) return userId
  }
  return context.siteType === SITE_TYPES.NEW_API
    ? verifyNewApiDashboardIdentity(context)
    : null
}

/** Verifies Sub2API's current browser JWT without refreshing or replacing it. */
const verifySub2ApiIdentity: IdentityVerifier = async (context) => {
  const token = readStoredString("auth_token")
  if (!token) return null
  const userId = await fetchIdentity({
    url: `${context.origin}${SUB2API_AUTH_ME_ENDPOINT}`,
    signal: context.signal,
    headers: { Authorization: `Bearer ${token}` },
    // https://github.com/Wei-Shaw/sub2api: auth/me is the bearer-authenticated identity endpoint.
    parse: (body) =>
      body.code === 0 && isRecord(body.data) ? body.data.id : null,
  })
  return readStoredString("auth_token") === token ? userId : null
}

/** Reads VoAPI v2's page-owned token from its dashboard store. */
function readVoApiV2Token() {
  const auth = readStoredRecord("userStore")?.auth
  return isRecord(auth) && typeof auth.token === "string"
    ? auth.token.trim()
    : null
}

/** Verifies the VoAPI v2 dashboard token using its raw Authorization contract. */
const verifyVoApiV2Identity: IdentityVerifier = async (context) => {
  const token = readVoApiV2Token()
  if (!token) return null
  const userId = await fetchIdentity({
    url: `${context.origin}${VOAPI_V2_ENDPOINTS.UserInfo}`,
    signal: context.signal,
    headers: { Authorization: token },
    // https://github.com/VoAPI/VoAPI: user/info uses code 0 and a raw dashboard JWT.
    parse: (body) =>
      body.code === VOAPI_V2_PROTOCOL_CODES.Success && isRecord(body.data)
        ? body.data.id
        : null,
  })
  return readVoApiV2Token() === token ? userId : null
}

/** Reads the Clerk session cookie exposed to AIHubMix's own dashboard. */
function readAIHubMixSessionToken() {
  try {
    const token = parseCookieHeader(document.cookie).get("__session")
    return token ? decodeURIComponent(token).trim() || null : null
  } catch {
    return null
  }
}

/** Verifies AIHubMix's website session using its stable username identity. */
const verifyAIHubMixIdentity: IdentityVerifier = async (context) => {
  if (
    !AIHUBMIX_HOSTNAMES.some(
      (hostname) => new URL(context.origin).hostname === hostname,
    )
  )
    return null
  const token = readAIHubMixSessionToken()
  const userId = await fetchIdentity({
    url: `${AIHUBMIX_API_ORIGIN}/call/usr/self`,
    signal: context.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    // Live-verified 2026-09-07: the console now sends a Clerk Bearer JWT; Cookie
    // alone returns 401. The server's username matches the stored stable identity.
    // https://console.aihubmix.com/static/js/main-4f064d56.0a0202bf.js
    parse: (body) =>
      body.success === true && isRecord(body.data) ? body.data.username : null,
  })
  return readAIHubMixSessionToken() === token ? userId : null
}

/** Verifies SharedChat through its deployment-owned authenticated getme endpoint. */
const verifySharedChatIdentity: IdentityVerifier = async (context) =>
  fetchIdentity({
    url: `${context.origin}${SHAREDCHAT_GETME_ENDPOINT}`,
    signal: context.signal,
    // https://new.sharedchat.cc/frontend-api/getme uses code 1 for a successful website session.
    parse: (body) =>
      body.code === 1 && isRecord(body.data) ? body.data.id : null,
  })

/** Verifies OpenRouter directly without trusting a cached Clerk user object. */
const verifyOpenRouterIdentity: IdentityVerifier = async (context) => {
  if (!isCanonicalOpenRouterUrl(context.origin)) return null
  return fetchIdentity({
    url: `${context.origin}/api/frontend/v1/private/users/current`,
    signal: context.signal,
    // Verified in an authenticated OpenRouter browser session on 2026-09-07:
    // https://openrouter.ai/api/frontend/v1/private/users/current returns data.clerk_user_id.
    // This private website contract is best-effort; an API change remains unverified.
    parse: (body) => (isRecord(body.data) ? body.data.clerk_user_id : null),
  })
}

const verifiersByFamily: Partial<
  Record<AccountSiteBackendFamily, IdentityVerifier>
> = {
  [ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily]: verifyNewApiIdentity,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api]: verifySub2ApiIdentity,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2]: verifyVoApiV2Identity,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix]: verifyAIHubMixIdentity,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat]: verifySharedChatIdentity,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter]: verifyOpenRouterIdentity,
}

/**
 * Rechecks the active page's identity with its own browser session. Failure is
 * deliberately inconclusive: cached user objects never become a verified match.
 */
export async function verifyAccountBrowserIdentity(input: {
  siteType: AccountSiteType
  url?: string
  candidateUserIds?: readonly unknown[]
}): Promise<string | null> {
  const origin = tryParseOrigin(location.href)
  if (!origin || (input.url && tryParseOrigin(input.url) !== origin))
    return null
  const family = getAccountSiteDefinition(input.siteType)?.adapterFamily
  const verifier = family ? verifiersByFamily[family] : undefined
  if (!verifier) return null

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    IDENTITY_VERIFICATION_TIMEOUT_MS,
  )
  try {
    const userId = await verifier({
      origin,
      siteType: input.siteType,
      candidateUserIds: (input.candidateUserIds ?? [])
        .map(normalizeAccountIdentity)
        .filter((id): id is string => id !== null),
      signal: controller.signal,
    })
    return !controller.signal.aborted &&
      tryParseOrigin(location.href) === origin
      ? userId
      : null
  } finally {
    clearTimeout(timeout)
  }
}
