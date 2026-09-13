import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  isTempContextTask,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"

import { collectCheckInFeedbackClues } from "./scan"
import { createFeedbackScanRegistry } from "./scanRegistry"

const scans = createFeedbackScanRegistry()

/** Scans the rendered document and same-origin resources without exporting page source. */
export function handlePageFeedbackScan(
  request: any,
  sendResponse: (result: unknown) => void,
) {
  if (request.action === RuntimeActionIds.ContentCancelCheckinFeedbackScan) {
    if (typeof request.requestId === "string") scans.cancel(request.requestId)
    sendResponse({ success: true })
    return true
  }
  const task = {
    kind: TEMP_CONTEXT_TASK_KINDS.CheckinFeedbackScan,
    params: request.params,
  }
  if (
    !isTempContextTask(task) ||
    task.kind !== TEMP_CONTEXT_TASK_KINDS.CheckinFeedbackScan
  ) {
    sendResponse({ success: false })
    return true
  }
  const { input, originUrl, requestId } = task.params
  if (location.origin !== originUrl) {
    sendResponse({ success: false })
    return true
  }
  const controller = scans.start(requestId)
  if (!controller) {
    sendResponse({ success: false })
    return true
  }
  const cancel = () => controller.abort()
  window.addEventListener("pagehide", cancel, { once: true })
  const scanFetch: typeof fetch = async (url, init) => {
    if (controller.signal.aborted || location.origin !== originUrl)
      throw new Error("scan_cancelled")
    const parsed = new URL(String(url))
    if (parsed.origin !== originUrl) throw new Error("scan_origin")
    if (parsed.href === originUrl + "/")
      return new Response(document.documentElement.outerHTML, {
        headers: { "content-type": "text/html" },
      })
    const statusOptions = request.statusOptions?.[parsed.pathname] as
      | RequestInit
      | undefined
    if (init?.headers && !statusOptions)
      throw new Error("scan_auth_unavailable")
    const headers = new Headers(init?.headers)
    new Headers(statusOptions?.headers).forEach((value, key) =>
      headers.set(key, value),
    )
    headers.set(EXTENSION_HEADER_NAME, EXTENSION_HEADER_VALUE)
    return fetch(parsed.href, {
      ...init,
      headers,
      // Status reads use background-prepared WAF-only cookie isolation. Public
      // assets use the browser session that just completed the challenge.
      credentials: statusOptions
        ? statusOptions.credentials ?? "omit"
        : "include",
      cache: statusOptions ? "no-store" : "default",
    })
  }
  void collectCheckInFeedbackClues(input, controller.signal, {
    fetch: scanFetch,
    pageUrl: location.href,
    loadedAssets: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name),
  })
    .then((data) =>
      sendResponse(
        controller.signal.aborted
          ? { success: false }
          : { success: true, data },
      ),
    )
    .catch(() => sendResponse({ success: false }))
    .finally(() => {
      scans.finish(requestId)
      window.removeEventListener("pagehide", cancel)
    })
  return true
}
