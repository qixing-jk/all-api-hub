import { createTab as createTabApi } from "~/utils/browser/tabs"
import {
  getFeedbackDestinationUrls,
  getSiteSupportRequestUrl,
  type SiteSupportRequestContext,
} from "~/utils/navigation/feedbackLinks"
import { withPopupClose } from "~/utils/navigation/popup"

/**
 * Opens the repository bug report template in a new browser tab.
 */
const _openBugReportPage = async () => {
  await createTabApi(getFeedbackDestinationUrls().bugReport, true)
}

/**
 * Opens the repository feature-request template in a new browser tab.
 */
const _openFeatureRequestPage = async () => {
  await createTabApi(getFeedbackDestinationUrls().featureRequest, true)
}

/**
 * Opens the repository language-request template in a new browser tab.
 */
const _openLanguageRequestPage = async () => {
  await createTabApi(getFeedbackDestinationUrls().languageRequest, true)
}

/**
 * Opens the site-support request issue form in a new browser tab.
 */
const _openSiteSupportRequestPage = async (
  context?: SiteSupportRequestContext,
) => {
  await createTabApi(getSiteSupportRequestUrl(context), true)
}

/**
 * Opens the docs community hub in a new browser tab.
 */
const _openCommunityPage = async (language?: string) => {
  await createTabApi(getFeedbackDestinationUrls(language).community, true)
}

/**
 * Open the bug-report issue template and close the popup afterward when needed.
 */
export const openBugReportPage = withPopupClose(_openBugReportPage)

/**
 * Open the feature-request issue template and close the popup afterward when needed.
 */
export const openFeatureRequestPage = withPopupClose(_openFeatureRequestPage)

/**
 * Open the language-request issue template and close the popup afterward when needed.
 */
export const openLanguageRequestPage = withPopupClose(_openLanguageRequestPage)

/**
 * Open the site-support issue template and close the popup afterward when needed.
 */
export const openSiteSupportRequestPage = withPopupClose(
  _openSiteSupportRequestPage,
)

/**
 * Open the docs community hub and close the popup afterward when needed.
 */
export const openCommunityPage = withPopupClose(_openCommunityPage)
