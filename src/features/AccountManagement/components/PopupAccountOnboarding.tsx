import { UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PopupTabOnboarding } from "~/components/PopupTabOnboarding"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { NewcomerSponsorRecommendationsSection } from "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { isExtensionSidePanel } from "~/utils/browser"

/** Guides an empty popup workspace toward its first saved account. */
export function PopupAccountOnboarding({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation("account")
  const inSidePanel = isExtensionSidePanel()

  return (
    <ProductAnalyticsScope
      entrypoint={
        inSidePanel
          ? PRODUCT_ANALYTICS_ENTRYPOINTS.Sidepanel
          : PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
      }
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
      surfaceId={
        inSidePanel
          ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelActionBar
          : PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar
      }
    >
      <PopupTabOnboarding
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountListView}
        icon={UserRound}
        title={t("emptyState")}
        titleId="popup-account-onboarding-title"
        description={t("popupOnboarding.signInHint")}
        action={{
          label: t("addFirstAccount"),
          onClick: onAdd,
          testId: ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton,
          analyticsAction: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
        }}
        sponsors={<NewcomerSponsorRecommendationsSection />}
      />
    </ProductAnalyticsScope>
  )
}
