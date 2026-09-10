import {
  isCanonicalOpenRouterUrl,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountDetectionPrivacyPolicy } from "~/services/accountSiteOnboarding/contracts"
import { t } from "~/utils/i18n/core"

/** Browser identity detection cannot provision an OpenRouter management key. */
export const openRouterAccountDetectionPrivacy: AccountDetectionPrivacyPolicy =
  {
    siteType: SITE_TYPES.OPENROUTER,
    matchesUrl: isCanonicalOpenRouterUrl,
    getFailureMessage: () => t("messages:openrouter.managementKeyRequired"),
  }
