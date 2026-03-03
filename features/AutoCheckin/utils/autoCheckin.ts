export const AUTO_CHECKIN_MESSAGE_KEY_PREFIX = "autoCheckin:" as const

/**
 * Strip the `autoCheckin:` prefix from message keys.
 *
 * Auto check-in results store message keys with a namespace prefix (for
 * example `autoCheckin:providerFallback.checkinFailed`). For UI translation
 * calls that already scope to the `autoCheckin` namespace, this helper returns
 * the suffix (`providerFallback.checkinFailed`).
 */
export function stripAutoCheckinMessageKeyPrefix(messageKey: string): string {
  if (!messageKey) return messageKey
  return messageKey.startsWith(AUTO_CHECKIN_MESSAGE_KEY_PREFIX)
    ? messageKey.slice(AUTO_CHECKIN_MESSAGE_KEY_PREFIX.length)
    : messageKey
}

const INVALID_ACCESS_TOKEN_STRICT_SNIPPET = "access token 无效"
const INVALID_ACCESS_TOKEN_KEYWORD = "access token"
const INVALID_ACCESS_TOKEN_HINT_KEYWORDS = [
  "无效",
  "失效",
  "过期",
  "invalid",
  "expired",
] as const

/**
 * Heuristic: detect messages that indicate an invalid/expired access token.
 *
 * Used by the Auto Check-in UI to show an actionable troubleshooting hint
 * under raw backend failure messages.
 */
export function isInvalidAccessTokenMessage(message: string): boolean {
  if (!message) return false

  const normalized = message.toLowerCase()

  if (normalized.includes(INVALID_ACCESS_TOKEN_STRICT_SNIPPET)) {
    return true
  }

  return (
    normalized.includes(INVALID_ACCESS_TOKEN_KEYWORD) &&
    INVALID_ACCESS_TOKEN_HINT_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    )
  )
}

export const NO_TAB_WITH_ID_REGEX = /no tab with id[: ]\s*\d+/i

/**
 * Detect a "No tab with id: N" error, usually emitted when a temporary
 * background-created tab/window is closed before an async flow completes.
 */
export function isNoTabWithIdMessage(message: string): boolean {
  if (!message) return false
  return NO_TAB_WITH_ID_REGEX.test(message)
}
