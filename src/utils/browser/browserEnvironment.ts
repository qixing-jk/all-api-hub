import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to cross-browser WebExtension API helpers.
 */
export const browserApiLogger = createLogger("BrowserApi")

// 确保 browser 全局对象可用
if (typeof (globalThis as any).browser === "undefined") {
  // Prefer chrome if present; otherwise leave undefined to fail fast where appropriate
  if (typeof (globalThis as any).chrome !== "undefined") {
    ;(globalThis as any).browser = (globalThis as any).chrome
  } else {
    // Optional: provide a minimal stub or log for non-extension environments
    browserApiLogger.warn(
      "browser API unavailable: running outside extension context?",
    )
  }
}
