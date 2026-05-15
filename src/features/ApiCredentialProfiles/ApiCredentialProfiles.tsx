import { KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

import { ApiCredentialProfilesListView } from "./components/ApiCredentialProfilesListView"
import { useApiCredentialProfilesController } from "./hooks/useApiCredentialProfilesController"

/**
 * Options page for managing API credential profiles.
 */
export default function ApiCredentialProfiles() {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])

  const controller = useApiCredentialProfilesController()

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage}
    >
      <div className="space-y-6 p-6">
        <PageHeader
          icon={KeyRound}
          title={t("title")}
          description={t("description")}
          actions={
            <Button
              onClick={controller.openAddDialog}
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog
              }
            >
              {t("apiCredentialProfiles:actions.add")}
            </Button>
          }
        />

        <ApiCredentialProfilesListView controller={controller} />
      </div>
    </ProductAnalyticsScope>
  )
}
