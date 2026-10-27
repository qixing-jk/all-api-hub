import { SITE_TYPES } from "~/constants/siteType"
import { isCanonicalNovitaUrl } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/contracts"
import { t } from "~/utils/i18n/core"

/**
 * Prefer a verified console bearer for account management, with an explicit
 * limited-scope sk_ fallback. Signed-out detection must explain both paths.
 */
export const novitaAccountDetectionPrivacy: AccountDetectionPrivacyPolicy = {
  siteType: SITE_TYPES.NOVITA,
  matchesUrl: isCanonicalNovitaUrl,
  getFailureMessage: () => t("messages:novita.apiKeyRequired"),
}
