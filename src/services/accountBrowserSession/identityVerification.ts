import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { getAccountBrowserIdentityCapability } from "~/services/accountSiteOnboarding/registry"
import type {
  AccountBrowserIdentityCapability,
  AccountBrowserIdentityContext,
  BrowserIdentityObservation,
  BrowserIdentityRead,
} from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isRecord } from "~/utils/core/object"
import { tryParseOrigin } from "~/utils/core/urlParsing"

const IDENTITY_VERIFICATION_TIMEOUT_MS = 5000
// HttpOnly Cookie changes are opaque, so successful observations stay short-lived.
const VERIFIED_IDENTITY_CACHE_MS = 30_000
const UNCONFIRMED_IDENTITY_CACHE_MS = 5000

type IdentityCacheEntry = {
  key: string
  controller: AbortController
  expiresAt: number
  identity: Promise<string | null>
}

// The document owns this cache. Session keys stay in page memory; only the
// verified user ID crosses the extension messaging boundary.
const documentCaches = new WeakMap<
  Document,
  Map<AccountSiteType, IdentityCacheEntry>
>()

/** Consults the extension's shared cooldown without sending session evidence. */
async function accessIdentityCooldown(
  origin: string,
  retryAfter?: string | null,
) {
  try {
    const response: unknown = await sendRuntimeMessage(
      {
        action:
          retryAfter === undefined
            ? RuntimeActionIds.AccountBrowserIdentityGetCooldown
            : RuntimeActionIds.AccountBrowserIdentityRecordRateLimit,
        origin,
        ...(retryAfter === undefined ? {} : { retryAfter }),
      },
      { maxAttempts: 1 },
    )
    return isRecord(response) &&
      response.success === true &&
      typeof response.retryAt === "number" &&
      Number.isFinite(response.retryAt)
      ? response.retryAt
      : null
  } catch {
    return null
  }
}

/** Reads one identity endpoint, without retries, auth recovery, redirects, or UI. */
function createIdentityRead(
  signal: AbortSignal,
  origin: string,
  isCurrentObservation: () => boolean,
): BrowserIdentityRead {
  let requested = false
  return async ({ url, headers }) => {
    if (requested || signal.aborted || tryParseOrigin(location.href) !== origin)
      return null
    requested = true
    try {
      const requestOrigin = tryParseOrigin(url)
      if (!requestOrigin) return null
      const retryAt = await accessIdentityCooldown(requestOrigin)
      if (
        retryAt === null ||
        retryAt > Date.now() ||
        signal.aborted ||
        tryParseOrigin(location.href) !== origin ||
        !isCurrentObservation()
      )
        return null
      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal,
        headers,
      })
      if (response.status === 429) {
        await accessIdentityCooldown(
          requestOrigin,
          response.headers.get("Retry-After"),
        )
        return null
      }
      if (!response.ok) return null
      const body: unknown = await response.json()
      return isRecord(body) ? body : null
    } catch {
      return null
    }
  }
}

/** Performs a bounded check and rejects observations changed while it was in flight. */
async function checkObservation(
  capability: AccountBrowserIdentityCapability,
  context: AccountBrowserIdentityContext,
  observation: BrowserIdentityObservation,
  controller: AbortController,
): Promise<string | null> {
  let abort!: () => void
  const cancelled = new Promise<null>((resolve) => {
    abort = () => resolve(null)
    controller.signal.addEventListener("abort", abort, { once: true })
  })
  const timeout = setTimeout(
    () => controller.abort(),
    IDENTITY_VERIFICATION_TIMEOUT_MS,
  )
  const isCurrentObservation = () => {
    const current = capability.observe(context)
    return (
      current?.sessionKey === observation.sessionKey &&
      (current.expiresAt === undefined || current.expiresAt > Date.now())
    )
  }
  try {
    const value = await Promise.race([
      observation.verify(
        createIdentityRead(
          controller.signal,
          context.origin,
          isCurrentObservation,
        ),
      ),
      cancelled,
    ])
    if (
      controller.signal.aborted ||
      tryParseOrigin(location.href) !== context.origin
    )
      return null
    return isCurrentObservation() ? normalizeAccountIdentity(value) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
    controller.signal.removeEventListener("abort", abort)
  }
}

/**
 * Best-effort current-page identity. Providers read local session evidence first;
 * unchanged evidence reuses recent verification, and missing/expired evidence
 * stays unconfirmed. Failures never start login, session refresh, or onboarding.
 */
export async function verifyAccountBrowserIdentity(input: {
  siteType: AccountSiteType
  url?: string
  candidateUserIds?: readonly unknown[]
}): Promise<string | null> {
  try {
    const origin = tryParseOrigin(location.href)
    if (!origin || (input.url && tryParseOrigin(input.url) !== origin))
      return null
    const context: AccountBrowserIdentityContext = {
      origin,
      siteType: input.siteType,
      candidateUserIds: [
        ...new Set(
          (input.candidateUserIds ?? [])
            .map(normalizeAccountIdentity)
            .filter((id): id is string => id !== null),
        ),
      ].sort(),
    }
    const capability = getAccountBrowserIdentityCapability(context)
    if (!capability) return null
    const observation = capability.observe(context)
    let cache = documentCaches.get(document)
    if (!cache) {
      cache = new Map()
      documentCaches.set(document, cache)
    }
    const previous = cache.get(input.siteType)
    if (
      !observation ||
      (observation.expiresAt !== undefined &&
        observation.expiresAt <= Date.now())
    ) {
      previous?.controller.abort()
      cache.delete(input.siteType)
      return null
    }
    const key = JSON.stringify([
      origin,
      context.candidateUserIds,
      observation.sessionKey,
    ])
    if (previous?.key === key && previous.expiresAt > Date.now())
      return previous.identity

    previous?.controller.abort()
    const controller = new AbortController()
    const entry: IdentityCacheEntry = {
      key,
      controller,
      expiresAt: Infinity,
      identity: checkObservation(
        capability,
        context,
        observation,
        controller,
      ).then((userId) => {
        entry.expiresAt =
          Date.now() +
          (userId ? VERIFIED_IDENTITY_CACHE_MS : UNCONFIRMED_IDENTITY_CACHE_MS)
        return userId
      }),
    }
    cache.set(input.siteType, entry)
    return entry.identity
  } catch {
    return null
  }
}
