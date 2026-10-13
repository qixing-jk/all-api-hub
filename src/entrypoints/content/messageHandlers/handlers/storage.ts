import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { verifyAccountBrowserIdentity } from "~/services/accountBrowserSession/identityVerification"
import {
  ContentSessionOriginMismatchError,
  extractContentSession,
} from "~/services/accountSiteOnboarding/contentSession/extraction"
import {
  SUB2API_LOGIN_REQUIRED_I18N_KEY,
  Sub2ApiContentSessionLoginRequiredError,
} from "~/services/accountSiteOnboarding/contentSession/sub2api"
import {
  createAccountDetectionDiagnostics,
  type AccountDetectionDiagnostics,
} from "~/services/accountSiteOnboarding/diagnostics"
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
        ...(request?.allowSessionProbe === true
          ? { allowSessionProbe: true }
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
      // A tab ID can survive navigation after the caller's eligibility query.
      // Bind existing-tab reads to the live document before reading credentials
      // and again after an asynchronous extractor completes.
      const assertOrigin = () => {
        if (
          request?.expectedOrigin !== undefined &&
          (typeof location === "undefined" ||
            location.origin !== request.expectedOrigin)
        ) {
          throw new ContentSessionOriginMismatchError()
        }
      }
      const result = await extractContentSession(
        { ...context, diagnostics },
        assertOrigin,
      )
      if (result) {
        sendResponse({ success: true, data: result })
        return
      }

      diagnostics.finish("failed", { reason: "no_extractor_session" })
      sendResponse({
        success: false,
        error: t("messages:content.userInfoNotFound"),
      })
    } catch (error) {
      if (error instanceof ContentSessionOriginMismatchError) {
        diagnostics?.finish("failed", { reason: "origin_mismatch" })
        sendResponse({
          success: false,
          error: t("messages:content.userInfoNotFound"),
        })
        return
      }
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
