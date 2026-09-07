import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  ACCOUNT_BROWSER_IDENTITY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  getLocalStorage,
  getSessionStorageValues,
  hasSessionStorageArea,
  onRuntimeMessage,
  removeLocalStorage,
  setLocalStorage,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { isRecord } from "~/utils/core/object"
import { tryParseOrigin } from "~/utils/core/urlParsing"

const DEFAULT_RATE_LIMIT_MS = 60_000
const MIN_RATE_LIMIT_MS = 5000
const STORAGE_KEY = ACCOUNT_BROWSER_IDENTITY_STORAGE_KEYS.RATE_LIMITS

/** Interprets Retry-After as delay seconds or an HTTP date, with a passive fallback. */
function getRetryDeadline(retryAfter: unknown, now: number): number {
  // https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3
  const value = typeof retryAfter === "string" ? retryAfter.trim() : ""
  const deadline = /^\d+$/.test(value)
    ? now + Number(value) * 1000
    : /^[A-Za-z]{3,},?\s/.test(value)
      ? Date.parse(value)
      : NaN
  return Number.isSafeInteger(deadline)
    ? Math.max(now + MIN_RATE_LIMIT_MS, deadline)
    : now + DEFAULT_RATE_LIMIT_MS
}

/** Shares only API origins and deadlines, never browser credentials or identity data. */
async function accessCooldown(
  request: Record<string, unknown>,
  pendingCooldowns: Map<string, number>,
): Promise<number> {
  const origin =
    typeof request.origin === "string" ? tryParseOrigin(request.origin) : null
  if (!origin || !/^https?:\/\//.test(origin)) {
    throw new Error("Invalid browser identity origin")
  }

  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.ACCOUNT_BROWSER_IDENTITY_RATE_LIMIT,
    async () => {
      if (
        request.action ===
        RuntimeActionIds.AccountBrowserIdentityRecordRateLimit
      ) {
        // Preserve the server's deadline even if the following storage read fails.
        pendingCooldowns.set(
          origin,
          Math.max(
            pendingCooldowns.get(origin) ?? 0,
            getRetryDeadline(request.retryAfter, Date.now()),
          ),
        )
      }
      // Session storage survives MV3 worker suspension and is not exposed to
      // content scripts. Read the local fallback too: a previous worker may
      // have used it when session storage was unavailable or failed to write.
      const useSessionStorage = hasSessionStorageArea()
      const [local, session] = await Promise.all([
        getLocalStorage(STORAGE_KEY),
        useSessionStorage
          ? getSessionStorageValues(STORAGE_KEY)
          : Promise.resolve<Record<string, unknown>>({}),
      ])
      const now = Date.now()
      const cooldowns = new Map<string, number>()
      let needsPruning = false
      for (const stored of [local[STORAGE_KEY], session[STORAGE_KEY]]) {
        if (!isRecord(stored)) continue
        for (const [key, deadline] of Object.entries(stored)) {
          if (
            typeof deadline !== "number" ||
            !Number.isSafeInteger(deadline) ||
            deadline <= now
          ) {
            needsPruning = true
            continue
          }
          cooldowns.set(key, Math.max(cooldowns.get(key) ?? 0, deadline))
        }
      }
      for (const [key, deadline] of pendingCooldowns) {
        if (deadline <= now) pendingCooldowns.delete(key)
        else cooldowns.set(key, Math.max(cooldowns.get(key) ?? 0, deadline))
      }
      if (pendingCooldowns.size > 0 || needsPruning) {
        const values = { [STORAGE_KEY]: Object.fromEntries(cooldowns) }
        try {
          if (useSessionStorage && (await setSessionStorageValues(values))) {
            pendingCooldowns.clear()
            if (local[STORAGE_KEY] !== undefined) {
              await removeLocalStorage(STORAGE_KEY)
            }
          } else {
            await setLocalStorage(values)
            pendingCooldowns.clear()
          }
        } catch {
          // Keep unpersisted deadlines shared by this background instance and
          // retry persistence on the next message, without another HTTP request.
        }
      }
      return cooldowns.get(origin) ?? 0
    },
  )
}

/** Registers a local-only gate; expiry never schedules a network retry. */
export function setupAccountBrowserIdentityRateLimitMessaging() {
  const pendingCooldowns = new Map<string, number>()
  return onRuntimeMessage((request, _sender, sendResponse) => {
    if (
      !isRecord(request) ||
      (request.action !== RuntimeActionIds.AccountBrowserIdentityGetCooldown &&
        request.action !==
          RuntimeActionIds.AccountBrowserIdentityRecordRateLimit)
    ) {
      return
    }
    void accessCooldown(request, pendingCooldowns).then(
      (retryAt) => sendResponse({ success: true, retryAt }),
      () => sendResponse({ success: false }),
    )
    return true
  })
}
