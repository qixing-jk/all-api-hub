import {
  isOpenRouterClerkSessionIdentity,
  OPENROUTER_MANAGEMENT_KEYS_ORIGIN,
  OPENROUTER_MANAGEMENT_KEYS_PATH,
} from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import type { OpenRouterClerkSessionIdentity } from "~/services/apiAdapters/openrouter/types"

export const OPENROUTER_CLERK_SESSION_CHANNEL =
  "all-api-hub:openrouter-clerk-session:v1"
export const OPENROUTER_CLERK_SESSION_REQUEST_KIND = "request"
export const OPENROUTER_CLERK_SESSION_RESPONSE_KIND = "response"
export const OPENROUTER_CLERK_SESSION_CORRELATION_ID_MAX_LENGTH = 128

const CLERK_SESSION_IDENTITY_FIELD_MAX_LENGTH = 256
const CLERK_SESSION_CORRELATION_ADMISSION_LIMIT = 64
const CLERK_SESSION_INITIAL_POLL_BACKOFF_MS = [25, 50, 100, 200, 375] as const
const CLERK_SESSION_ADDITIONAL_READINESS_GRACE_BACKOFF_MS = [
  750, 750, 750,
] as const
const CLERK_SESSION_POLL_BACKOFF_MS = [
  ...CLERK_SESSION_INITIAL_POLL_BACKOFF_MS,
  ...CLERK_SESSION_ADDITIONAL_READINESS_GRACE_BACKOFF_MS,
] as const
export const OPENROUTER_CLERK_SESSION_INITIAL_READINESS_TIMEOUT_MS =
  CLERK_SESSION_INITIAL_POLL_BACKOFF_MS.reduce(
    (total, delayMs) => total + delayMs,
    0,
  )
export const OPENROUTER_CLERK_SESSION_ADDITIONAL_READINESS_GRACE_MS =
  CLERK_SESSION_ADDITIONAL_READINESS_GRACE_BACKOFF_MS.reduce(
    (total, delayMs) => total + delayMs,
    0,
  )
export const OPENROUTER_CLERK_SESSION_BRIDGE_TIMEOUT_MS =
  OPENROUTER_CLERK_SESSION_INITIAL_READINESS_TIMEOUT_MS +
  OPENROUTER_CLERK_SESSION_ADDITIONAL_READINESS_GRACE_MS
const BRIDGE_INSTALL_MARKER = Symbol.for(
  "all-api-hub.openrouter-clerk-session.v1.installed",
)

export type OpenRouterClerkSessionRequest = {
  channel: typeof OPENROUTER_CLERK_SESSION_CHANNEL
  kind: typeof OPENROUTER_CLERK_SESSION_REQUEST_KIND
  correlationId: string
}

type OpenRouterClerkSessionResponse = {
  channel: typeof OPENROUTER_CLERK_SESSION_CHANNEL
  kind: typeof OPENROUTER_CLERK_SESSION_RESPONSE_KIND
  correlationId: string
  identity?: OpenRouterClerkSessionIdentity
}

type BridgeEnvironment = {
  window: Window
  readClerkUser: () => unknown
}

/** Checks for a plain message payload object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Rejects protocol payload fields outside the allowed narrow shape. */
function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}

/** Normalizes one untrusted identity field within the shared size boundary. */
function normalizeBoundedIdentityField(value: unknown, allowEmpty = false) {
  if (
    typeof value !== "string" ||
    value.length > CLERK_SESSION_IDENTITY_FIELD_MAX_LENGTH
  ) {
    return undefined
  }
  const normalized = value.trim()
  return normalized || (allowEmpty ? "" : undefined)
}

/** Validates an opaque, bounded correlation identifier. */
export function isOpenRouterClerkSessionCorrelationId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= OPENROUTER_CLERK_SESSION_CORRELATION_ID_MAX_LENGTH &&
    value.trim() === value
  )
}

/** Checks the exact canonical page route used by the bridge. */
export function isOpenRouterManagementKeysLocation(
  location: Pick<Location, "origin" | "pathname">,
) {
  return (
    location.origin === OPENROUTER_MANAGEMENT_KEYS_ORIGIN &&
    location.pathname === OPENROUTER_MANAGEMENT_KEYS_PATH
  )
}

/** Validates the complete main-world request shape. */
export function isOpenRouterClerkSessionRequest(
  value: unknown,
): value is OpenRouterClerkSessionRequest {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, ["channel", "kind", "correlationId"]) &&
    value.channel === OPENROUTER_CLERK_SESSION_CHANNEL &&
    value.kind === OPENROUTER_CLERK_SESSION_REQUEST_KIND &&
    isOpenRouterClerkSessionCorrelationId(value.correlationId)
  )
}

/** Validates the complete main-world response shape. */
export function isOpenRouterClerkSessionResponse(
  value: unknown,
): value is OpenRouterClerkSessionResponse {
  if (!isRecord(value)) return false
  return (
    hasOnlyKeys(value, ["channel", "kind", "correlationId", "identity"]) &&
    value.channel === OPENROUTER_CLERK_SESSION_CHANNEL &&
    value.kind === OPENROUTER_CLERK_SESSION_RESPONSE_KIND &&
    isOpenRouterClerkSessionCorrelationId(value.correlationId) &&
    (!("identity" in value) || isOpenRouterClerkSessionIdentity(value.identity))
  )
}

/**
 * Reads only the narrow identity hint needed by account bootstrap.
 *
 * OpenRouter's private Management Keys page currently exposes Clerk JS state;
 * this best-effort integration relies on Clerk's documented `user` fields:
 * https://clerk.com/docs/reference/javascript/user/user
 */
export function normalizeOpenRouterClerkUser(
  value: unknown,
): OpenRouterClerkSessionIdentity | undefined {
  if (!isRecord(value)) return undefined
  const userId = normalizeBoundedIdentityField(value.id)
  if (!userId) return undefined

  const primaryEmailAddress = isRecord(value.primaryEmailAddress)
    ? value.primaryEmailAddress.emailAddress
    : undefined
  let username = ""
  for (const candidate of [
    value.fullName,
    value.username,
    primaryEmailAddress,
  ]) {
    if (typeof candidate !== "string") continue
    const normalized = normalizeBoundedIdentityField(candidate, true)
    // Reject an oversized higher-priority field instead of forwarding
    // unbounded page data or falling through to another identity field.
    if (normalized === undefined) return undefined
    if (!normalized) continue
    username = normalized
    break
  }

  return { userId, username }
}

/** Provides live main-world primitives for the production bridge. */
function defaultBridgeEnvironment(): BridgeEnvironment {
  return {
    window,
    // OpenRouter settings page + Clerk JS are private, best-effort contracts.
    readClerkUser: () =>
      (window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user,
  }
}

/** Waits for the next bounded polling attempt. */
function delay(windowRef: Window, delayMs: number) {
  return new Promise<void>((resolve) => {
    windowRef.setTimeout(resolve, delayMs)
  })
}

/** Polls Clerk readiness with a bounded backoff schedule. */
async function pollClerkIdentity(environment: BridgeEnvironment) {
  let identity = normalizeOpenRouterClerkUser(environment.readClerkUser())
  if (identity?.username) return identity
  let lastIdentity = identity

  for (const delayMs of CLERK_SESSION_POLL_BACKOFF_MS) {
    await delay(environment.window, delayMs)
    identity = normalizeOpenRouterClerkUser(environment.readClerkUser())
    if (!identity) continue
    lastIdentity = identity
    if (identity.username) return identity
  }
  return lastIdentity
}

/** Installs the untrusted main-world identity hint bridge once per page. */
export function setupOpenRouterClerkSessionBridge(
  environment: BridgeEnvironment = defaultBridgeEnvironment(),
) {
  const windowRef = environment.window
  if (Reflect.get(windowRef, BRIDGE_INSTALL_MARKER) === true) return
  Reflect.defineProperty(windowRef, BRIDGE_INSTALL_MARKER, { value: true })

  const handledCorrelations = new Set<string>()
  let readinessPromise:
    | Promise<OpenRouterClerkSessionIdentity | undefined>
    | undefined

  const readIdentityWhenReady = () => {
    if (readinessPromise) return readinessPromise

    const pendingRead = pollClerkIdentity(environment).catch(() => undefined)
    readinessPromise = pendingRead
    void pendingRead.then(() => {
      if (readinessPromise === pendingRead) readinessPromise = undefined
    })
    return pendingRead
  }

  windowRef.addEventListener("message", (event) => {
    if (
      event.source !== windowRef ||
      event.origin !== OPENROUTER_MANAGEMENT_KEYS_ORIGIN ||
      !isOpenRouterManagementKeysLocation(windowRef.location) ||
      !isOpenRouterClerkSessionRequest(event.data) ||
      handledCorrelations.has(event.data.correlationId) ||
      handledCorrelations.size >= CLERK_SESSION_CORRELATION_ADMISSION_LIMIT
    ) {
      return
    }

    const { correlationId } = event.data
    // Do not evict accepted identifiers: eviction would let an untrusted page
    // replay an old correlation and receive a second response. Fail closed once
    // this per-page, lifetime-bounded admission set is full.
    handledCorrelations.add(correlationId)
    void readIdentityWhenReady().then((identity) => {
      const response: OpenRouterClerkSessionResponse = {
        channel: OPENROUTER_CLERK_SESSION_CHANNEL,
        kind: OPENROUTER_CLERK_SESSION_RESPONSE_KIND,
        correlationId,
        ...(identity ? { identity } : {}),
      }
      // Page messages are forgeable hints; completion must verify creator_user_id.
      try {
        windowRef.postMessage(response, OPENROUTER_MANAGEMENT_KEYS_ORIGIN)
      } catch {
        // Navigation can invalidate the target origin before the hint is sent.
      }
    })
  })
}
