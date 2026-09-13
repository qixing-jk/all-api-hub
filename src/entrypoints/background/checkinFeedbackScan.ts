import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import { createFeedbackScanRegistry } from "~/services/checkin/feedback/scanRegistry"
import { FEEDBACK_SCAN_SESSION_TIMEOUT_MS } from "~/services/checkin/feedback/scanTypes"
import {
  type TEMP_CONTEXT_TASK_KINDS,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import { removeTempWindowCookieRule } from "~/utils/browser/dnrCookieInjector"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"

import {
  tempWindowBackgroundRuntime,
  type AuthorizeTempContextAtAcquire,
} from "./tempWindowPool"

type ScanParams = Extract<
  TempContextTask,
  { kind: typeof TEMP_CONTEXT_TASK_KINDS.CheckinFeedbackScan }
>["params"]
const scans = createFeedbackScanRegistry()

/** Handles close-before-dispatch races without closing another task's page. */
export function cancelTempCheckinFeedbackScan(requestId: string) {
  if (!requestId) return
  scans.cancel(requestId)
}

/** Holds one page lease and WAF-only status rules for the entire bounded scan. */
export async function executeTempCheckinFeedbackScan(
  params: ScanParams,
  suppressMinimize: boolean,
  authorize: AuthorizeTempContextAtAcquire,
  sendResponse: (result: unknown) => void,
) {
  const { requestId, originUrl, input } = params
  const controller = scans.start(requestId)
  if (!controller) {
    sendResponse({ success: false })
    return
  }
  const timeout = setTimeout(
    () => controller.abort(),
    FEEDBACK_SCAN_SESSION_TIMEOUT_MS,
  )
  let result: unknown = { success: false }
  try {
    await tempWindowBackgroundRuntime.run(originUrl, {}, async () => {
      controller.signal.throwIfAborted()
      const route = await resolveAccountSiteRouteUrl(
        { baseUrl: originUrl, siteType: input.siteType },
        SITE_ROUTE_KINDS.CheckIn,
      ).catch(() => null)
      const pageUrl =
        route && new URL(route).origin === originUrl ? route : originUrl
      controller.signal.throwIfAborted()
      const context = await tempWindowBackgroundRuntime.acquire(
        pageUrl,
        requestId,
        suppressMinimize,
        { signal: controller.signal },
        authorize,
      )
      const ruleIds = new Set<number>()
      let rejectCancelled!: () => void
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectCancelled = () => reject(new Error("scan_cancelled"))
      })
      // Attach the rejection handler immediately, including during cookie preparation.
      void cancelled.catch(() => undefined)
      const cancelPage = () => {
        rejectCancelled()
        void sendTabMessageWithRetry(context.tabId, {
          action: RuntimeActionIds.ContentCancelCheckinFeedbackScan,
          requestId,
        }).catch(() => undefined)
      }
      controller.signal.addEventListener("abort", cancelPage, { once: true })
      try {
        controller.signal.throwIfAborted()
        await context.navigate(pageUrl, {
          requestId,
          origin: originUrl,
          signal: controller.signal,
        })
        const statusOptions: Record<string, RequestInit> = {}
        for (const route of getCheckInFeedbackStatusRoutes(input.siteType)) {
          controller.signal.throwIfAborted()
          const url = new URL(route.path, originUrl)
          const prepared =
            await tempWindowBackgroundRuntime.prepareFetchOptions({
              tabId: context.tabId,
              url: url.href,
              rawOptions: { credentials: "omit" },
              resolvedAuthType: AuthTypeEnum.AccessToken,
              addFirefoxAuthModeHeader: true,
            })
          prepared.ruleIds.forEach((id) => ruleIds.add(id))
          statusOptions[url.pathname] = normalizeRequestInitForMessage(
            prepared.effectiveFetchOptions,
          )
        }
        controller.signal.throwIfAborted()
        result = await Promise.race([
          sendTabMessageWithRetry(context.tabId, {
            action: RuntimeActionIds.ContentCheckinFeedbackScan,
            params,
            statusOptions,
          }),
          cancelled,
        ])
      } finally {
        controller.signal.removeEventListener("abort", cancelPage)
        // Await cancellation before handing the page to the next origin task.
        if (controller.signal.aborted)
          await sendTabMessageWithRetry(context.tabId, {
            action: RuntimeActionIds.ContentCancelCheckinFeedbackScan,
            requestId,
          }).catch(() => undefined)
        await Promise.allSettled(
          [...ruleIds].map((id) => removeTempWindowCookieRule(id)),
        )
        await context.release()
      }
    })
  } catch {
    // Failures before a page response keep the default unavailable result.
  } finally {
    clearTimeout(timeout)
    scans.finish(requestId)
  }
  sendResponse(result ?? { success: false })
}
