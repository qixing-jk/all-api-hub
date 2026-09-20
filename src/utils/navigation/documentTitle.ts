import { getDevIdentity } from "~/utils/browser/extensionIdentity"
import { formatDevTitleSuffix } from "~/utils/core/devBranding"
import { createLogger } from "~/utils/core/logger"
import i18n from "~/utils/i18n"

/**
 * Unified logger scoped to document title initialization helpers.
 */
const logger = createLogger("DocumentTitle")

type DocumentPageType = "options" | "popup" | "sidepanel"

/**
 * Resolve the localized page label for a known extension page type.
 */
function getPageTitle(pageType: DocumentPageType): string {
  switch (pageType) {
    case "options":
      return i18n.t("ui:pageTitle.options")
    case "popup":
      return i18n.t("ui:pageTitle.popup")
    case "sidepanel":
      return i18n.t("ui:pageTitle.sidepanel")
  }
}

/**
 * Resolve the localized document title for a known extension page type.
 */
function getDocumentTitle(pageType: DocumentPageType): string {
  return i18n.t("ui:pageTitle.template", {
    app: i18n.t("ui:pageTitle.app"),
    page: getPageTitle(pageType),
  })
}

/**
 * Simple function to set document title based on page type
 * This can be called before i18n is fully initialized
 * @param pageType - The type of page ('options', 'popup', or 'sidepanel')
 */
export function setDocumentTitle(pageType: DocumentPageType): void {
  try {
    // Development builds append their source path so tabs, side panel titles and
    // windows opened by the extension identify which checkout they belong to.
    const identitySuffix = formatDevTitleSuffix(getDevIdentity())
    document.title = `${getDocumentTitle(pageType)}${identitySuffix}`
  } catch (error) {
    logger.warn("Failed to set document title", error)
  }
}
