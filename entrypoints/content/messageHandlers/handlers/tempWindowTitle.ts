/**
 * Returns the rendered document.title from the current tab context.
 */
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to temp window rendered-title message handling.
 */
const logger = createLogger("TempWindowTitleHandler")

/**
 *
 */
export function handleGetRenderedTitle(
  _request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const rawTitle = typeof document.title === "string" ? document.title : ""
    const title = rawTitle || ""
    sendResponse({ success: true, title })
  } catch (error) {
    logger.warn("Failed to read rendered title", error)
    sendResponse({ success: false, error: (error as Error)?.message })
  }

  return true
}
