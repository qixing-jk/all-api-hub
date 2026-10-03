import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { verifyAccountBrowserIdentity } from "~/services/accountBrowserSession/identityVerification"
import {
  SUB2API_LOGIN_REQUIRED_I18N_KEY,
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"
import {
  createAccountDetectionDiagnostics,
  type AccountDetectionDiagnostics,
} from "~/services/accountSiteOnboarding/diagnostics"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
import {
  PAGE_CONTEXT,
  readCurrentPageContext,
} from "~/services/browsingContext/pageContext"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

/**
 * Handles requests to get data from localStorage.
 */
export function handleGetLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const { key } = request

    if (key) {
      const value = localStorage.getItem(key)
      sendResponse({ success: true, data: { [key]: value } })
    } else {
      const data: Record<string, any> = {}

      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i)
        if (storageKey) {
          data[storageKey] = localStorage.getItem(storageKey)
        }
      }

      sendResponse({ success: true, data })
    }
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}

/**
 * Handles requests to get user info from localStorage.
 */
export function handleGetUserFromLocalStorage(
  request: any,
  sendResponse: (res: any) => void,
) {
  ;(async () => {
    let diagnostics: AccountDetectionDiagnostics | undefined
    try {
      const context = {
        url: typeof request?.url === "string" ? request.url : undefined,
        siteTypeHint: isAccountSiteType(request?.siteType)
          ? request.siteType
          : SITE_TYPES.UNKNOWN,
        ...(request?.allowNewApiAuthProbe === true
          ? { allowNewApiAuthProbe: true }
          : {}),
      }

      if (request?.verifyIdentity === true) {
        // Passive account highlighting needs ordinary browsing, while explicit
        // temporary-page identity tasks must keep their existing protocol.
        const pageContext =
          request.forBrowsingContext === true
            ? await readCurrentPageContext()
            : undefined
        if (
          pageContext !== undefined &&
          pageContext !== PAGE_CONTEXT.Ordinary
        ) {
          sendResponse({ success: false, pageContext })
          return
        }
        const userId = await verifyAccountBrowserIdentity({
          url: context.url,
          siteType: context.siteTypeHint,
          candidateUserIds: Array.isArray(request.candidateUserIds)
            ? request.candidateUserIds
            : undefined,
        })
        sendResponse({
          ...(pageContext === undefined ? {} : { pageContext }),
          ...(userId
            ? { success: true, data: { userId, identityVerified: true } }
            : { success: false }),
        })
        return
      }

      diagnostics = createAccountDetectionDiagnostics({
        requestId:
          typeof request?.diagnosticId === "string"
            ? request.diagnosticId
            : undefined,
        relayToBackground: true,
      })
      const extractionContext = { ...context, diagnostics }
      for (const extractor of getContentSessionExtractors()) {
        if (!extractor.canExtract(context)) continue
        diagnostics.record("extractor_started", {
          extractor: extractor.id,
          siteType: context.siteTypeHint,
        })
        const result = await extractor.extract(extractionContext)
        diagnostics.record("extractor_finished", {
          extractor: extractor.id,
          outcome: result ? "success" : "empty",
        })
        if (!result) continue

        diagnostics.finish("success", { extractor: extractor.id })
        sendResponse({
          success: true,
          data: result,
        })
        return
      }

      diagnostics.finish("failed", { reason: "no_extractor_session" })
      sendResponse({
        success: false,
        error: t("messages:content.userInfoNotFound"),
      })
    } catch (error) {
      diagnostics?.finish("failed", {
        reason: "extraction_error",
        error: getErrorMessage(error),
      })
      if (error instanceof Sub2ApiContentSessionLoginRequiredError) {
        sendResponse({
          success: false,
          error: t(SUB2API_LOGIN_REQUIRED_I18N_KEY),
        })
        return
      }
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  })()

  return true
}
