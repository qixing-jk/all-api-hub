import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import { ApiCredentialLibraryIcon } from "~/components/icons/productIcons"
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
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "./testIds"

/**
 * Options page for managing API credential profiles.
 */
export default function ApiCredentialProfiles({
  routeParams,
}: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])

  const controller = useApiCredentialProfilesController()
  const { openAddDialog } = controller
  const consumedCreatePrefillKeyRef = useRef<string | null>(null)
  const createPrefill = useMemo(() => {
    if (routeParams?.action !== "add") {
      return null
    }

    const name = routeParams.name?.trim()
    const baseUrl = routeParams.baseUrl?.trim()
    if (!name || !baseUrl) {
      return null
    }

    const apiKeyCreateUrl = routeParams.apiKeyCreateUrl?.trim()
    const apiKeyCreateHint = routeParams.apiKeyCreateHint?.trim()
    return {
      name,
      baseUrl,
      apiKeyCreateUrl: apiKeyCreateUrl || undefined,
      apiKeyCreateHint: apiKeyCreateHint || undefined,
    }
  }, [routeParams])

  useEffect(() => {
    if (!createPrefill) {
      consumedCreatePrefillKeyRef.current = null
      return
    }

    const prefillKey = `${createPrefill.name}\n${createPrefill.baseUrl}\n${createPrefill.apiKeyCreateUrl ?? ""}\n${createPrefill.apiKeyCreateHint ?? ""}`
    if (consumedCreatePrefillKeyRef.current === prefillKey) {
      return
    }

    consumedCreatePrefillKeyRef.current = prefillKey
    openAddDialog(createPrefill)
  }, [createPrefill, openAddDialog])

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage}
    >
      <div className="space-y-6 p-6">
        <PageHeader
          icon={ApiCredentialLibraryIcon}
          title={t("title")}
          description={t("description")}
          actions={
            <Button
              onClick={() => openAddDialog()}
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.addButton}
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
