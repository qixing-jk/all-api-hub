import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import {
  CHECK_IN_EVIDENCE_SCAN_ERRORS,
  CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
} from "~/services/checkin/discovery/evidence/scanTypes"
import {
  exploreNativeCheckInPages,
  type NativeCheckInPageProbe,
} from "~/services/checkin/discovery/nativePageDiscovery"
import { scanNativeCheckInPageSources } from "~/services/checkin/discovery/nativePageScan"
import { createFeedbackScanRegistry } from "~/services/checkin/feedback/scanRegistry"
import type { TEMP_CONTEXT_TASK_KINDS } from "~/services/protectionBypass/contracts"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"

import type { AuthorizeTempContextAtAcquire, TaskParams } from "./contracts"
import { tempWindowBackgroundRuntime } from "./runtime"

const scans = createFeedbackScanRegistry()
/** Cancels only the request-owned read-only exploration. */
export function cancelTempCheckinPageDiscovery(requestId: string) {
  if (requestId) scans.cancel(requestId)
}

/** A separate read-only task owns the page lease; it never logs in or triggers a grant. */
export async function executeTempCheckinPageDiscovery(
  params: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.CheckinPageDiscovery>,
  suppressMinimize: boolean,
  authorize: AuthorizeTempContextAtAcquire,
  sendResponse: (result: unknown) => void,
) {
  const controller = scans.start(params.requestId)
  if (!controller) {
    sendResponse({ success: false })
    return
  }
  const timeout = setTimeout(
    () => controller.abort(),
    CHECK_IN_EVIDENCE_SCAN_SESSION_TIMEOUT_MS,
  )
  let result: unknown = { success: false }
  try {
    await tempWindowBackgroundRuntime.run(params.originUrl, {}, async () => {
      controller.signal.throwIfAborted()
      const pageUrl = await resolveAccountSiteRouteUrl(
        {
          baseUrl: params.originUrl,
          siteType: params.siteType,
          checkIn: { nativePagePath: params.nativePagePath },
        },
        SITE_ROUTE_KINDS.CheckIn,
      )
      if (!pageUrl || new URL(pageUrl).origin !== params.originUrl) return
      controller.signal.throwIfAborted()
      const context = await tempWindowBackgroundRuntime.acquire(
        pageUrl,
        params.requestId,
        suppressMinimize,
        { signal: controller.signal },
        authorize,
      )
      const send = (action: string, details: Record<string, unknown> = {}) =>
        sendTabMessageWithRetry(context.tabId, { action, ...details })
      let rejectCancelled!: () => void
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectCancelled = () =>
          reject(new Error(CHECK_IN_EVIDENCE_SCAN_ERRORS.Cancelled))
      })
      void cancelled.catch(() => undefined)
      const cancel = () => {
        rejectCancelled()
        void send(RuntimeActionIds.ContentCancelCheckinFeedbackScan, {
          requestId: params.requestId,
        }).catch(() => undefined)
      }
      controller.signal.addEventListener("abort", cancel, { once: true })
      try {
        controller.signal.throwIfAborted()
        const navigate = (url: string) =>
          context.navigate(url, {
            origin: params.originUrl,
            requestId: params.requestId,
            signal: controller.signal,
          })
        await navigate(pageUrl)
        const data = await Promise.race([
          exploreNativeCheckInPages({
            pageUrl,
            navigate,
            signal: controller.signal,
            inspect: () =>
              send(
                RuntimeActionIds.ContentInspectCheckinPage,
              ) as Promise<NativeCheckInPageProbe>,
            scan: () => scanNativeCheckInPageSources({ ...params, send }),
          }),
          cancelled,
        ])
        controller.signal.throwIfAborted()
        result = { success: true, data }
      } finally {
        controller.signal.removeEventListener("abort", cancel)
        if (controller.signal.aborted)
          await send(RuntimeActionIds.ContentCancelCheckinFeedbackScan, {
            requestId: params.requestId,
          }).catch(() => undefined)
        await context.release()
      }
    })
  } catch {
    /* Unavailable or cancelled exploration preserves the draft. */
  } finally {
    clearTimeout(timeout)
    scans.finish(params.requestId)
  }
  sendResponse(result)
}
