import {
  COOKIE_AUTH_HEADER_NAME,
  EXTENSION_HEADER_NAME,
} from "~/utils/cookieHelper"
import { createLogger } from "~/utils/logger"
import { sleep, withTimeout } from "~/utils/timeout"

/**
 * Unified logger scoped to DNR cookie header injection helpers.
 */
const logger = createLogger("DnrCookieInjector")

const DNR_UPDATE_SESSION_RULES_TIMEOUT_MS = 5000
const DNR_UPDATE_SESSION_RULES_MAX_ATTEMPTS = 2
const DNR_UPDATE_SESSION_RULES_RETRY_DELAY_MS = 250

/**
 * DeclarativeNetRequest session-rule helpers.
 *
 * Chromium-based browsers can modify request headers using declarativeNetRequest.
 * We use a short-lived, per-tab session rule during temp-window fetch so that:
 * - token-auth requests can carry WAF-bypass cookies without leaking session cookies
 * - requests are isolated to the temp window tab (fixes multi-account confusion)
 */

export const TEMP_WINDOW_DNR_RULE_ID_BASE = 1_000_000 as const

export interface TempWindowCookieRuleParams {
  tabId: number
  url: string
  cookieHeader: string
}

/**
 * Checks whether the declarativeNetRequest session rules API is available.
 */
function hasDnrApi(): boolean {
  try {
    return Boolean(
      (globalThis as any).chrome?.declarativeNetRequest?.updateSessionRules,
    )
  } catch {
    return false
  }
}

/**
 * Best-effort wrapper around `declarativeNetRequest.updateSessionRules` that:
 * - times out instead of hanging forever (Chromium quirk after permission changes)
 * - retries once to smooth over short-lived initialization races
 */
async function updateSessionRulesSafe(
  params: any,
  meta: { label: string },
): Promise<boolean> {
  if (!hasDnrApi()) {
    return false
  }

  const updateSessionRules = (globalThis as any).chrome.declarativeNetRequest
    .updateSessionRules as ((details: any) => Promise<void>) | undefined

  if (!updateSessionRules) {
    return false
  }

  for (
    let attempt = 1;
    attempt <= DNR_UPDATE_SESSION_RULES_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      await withTimeout(updateSessionRules(params), {
        timeoutMs: DNR_UPDATE_SESSION_RULES_TIMEOUT_MS,
        label: meta.label,
      })
      return true
    } catch (error) {
      const message = (error as any)?.message || String(error || "")
      const normalized = message.toLowerCase()
      const isTimeout =
        (error as any)?.name === "TimeoutError" ||
        normalized.includes("timed out")
      const isPermissionError =
        normalized.includes("permission") &&
        (normalized.includes("required") ||
          normalized.includes("denied") ||
          normalized.includes("not allowed"))

      if (isPermissionError) {
        logger.debug("DNR session rules blocked by missing permission", {
          label: meta.label,
          attempt,
          error,
        })
        return false
      }

      logger.warn("Failed to update DNR session rules", {
        attempt,
        label: meta.label,
        error,
      })

      // Retry only on timeouts; other failures are usually deterministic (e.g. invalid args).
      if (!isTimeout) {
        return false
      }

      if (attempt < DNR_UPDATE_SESSION_RULES_MAX_ATTEMPTS) {
        await sleep(DNR_UPDATE_SESSION_RULES_RETRY_DELAY_MS)
      }
    }
  }

  return false
}

/**
 * Builds a stable rule ID for a given tab.
 */
function buildRuleId(tabId: number): number {
  const safeTabId = Number.isFinite(tabId) ? Math.max(0, Math.floor(tabId)) : 0
  return TEMP_WINDOW_DNR_RULE_ID_BASE + safeTabId
}

/**
 * Build a session-scoped DNR rule that forces the Cookie header for a specific
 * tab and URL.
 */
export function buildTempWindowCookieRule(params: TempWindowCookieRuleParams) {
  const ruleId = buildRuleId(params.tabId)

  return {
    id: ruleId,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: EXTENSION_HEADER_NAME, operation: "remove" },
        { header: COOKIE_AUTH_HEADER_NAME, operation: "remove" },
        { header: "Cookie", operation: "set", value: params.cookieHeader },
      ],
    },
    condition: {
      tabIds: [params.tabId],
      urlFilter: `||${new URL(params.url).hostname}/`,
      isUrlFilterCaseSensitive: true,
      resourceTypes: ["xmlhttprequest"],
    },
  } as const
}

/**
 * Installs (or replaces) a temp-window Cookie override rule for the given tab.
 * Returns the installed ruleId, or null when rule install is not possible.
 */
export async function applyTempWindowCookieRule(
  params: TempWindowCookieRuleParams,
): Promise<number | null> {
  if (!params.cookieHeader) {
    return null
  }

  if (!hasDnrApi()) {
    return null
  }

  const ruleId = buildRuleId(params.tabId)
  const rule = buildTempWindowCookieRule(params)

  const ok = await updateSessionRulesSafe(
    {
      removeRuleIds: [ruleId],
      addRules: [rule],
    },
    {
      label:
        "declarativeNetRequest.updateSessionRules(installTempWindowCookieRule)",
    },
  )

  return ok ? ruleId : null
}

/**
 * Best-effort removal of a previously installed temp-window cookie rule.
 */
export async function removeTempWindowCookieRule(
  ruleId: number,
): Promise<void> {
  if (!hasDnrApi()) {
    return
  }

  const ok = await updateSessionRulesSafe(
    { removeRuleIds: [ruleId] },
    {
      label:
        "declarativeNetRequest.updateSessionRules(removeTempWindowCookieRule)",
    },
  )

  if (!ok) {
    logger.warn("Failed to remove temp-window cookie rule", { ruleId })
  }
}
