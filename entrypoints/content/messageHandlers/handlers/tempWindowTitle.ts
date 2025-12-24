/**
 * Returns the rendered document.title from the current tab context.
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
    console.warn("[Content] Failed to read rendered title", error)
    sendResponse({ success: false, error: (error as Error)?.message })
  }

  return true
}
