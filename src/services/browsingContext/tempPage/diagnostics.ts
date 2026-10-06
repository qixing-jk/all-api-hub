import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to background temp-window lifecycle and fetch helpers.
 */
export const logger = createLogger("TempWindowPool")

/**
 * Log temporary window events through the unified logger.
 */
export function logTempWindow(
  event: string,
  details?: Record<string, unknown>,
) {
  try {
    logger.debug(event, details)
  } catch {
    // ignore logging errors
  }
}

/**
 * 规范化 URL，返回 origin（协议 + 域名 + 端口）。
 */
export function normalizeOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}
