import { SITE_TYPES } from "~/constants/siteType"
import { isRecognizedAimlApiUrl } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/contracts"
import { t } from "~/utils/i18n/core"

/**
 * Console JWTs are completion-only authentication. When automatic credential
 * acquisition cannot finish, retain local guidance without exposing that JWT.
 */
export const aimlApiAccountDetectionPrivacy: AccountDetectionPrivacyPolicy = {
  siteType: SITE_TYPES.AIMLAPI,
  matchesUrl: isRecognizedAimlApiUrl,
  getFailureMessage: () => t("messages:aimlapi.managementKeyRequired"),
}
