import { Cpu, KeyRound, Plus, RefreshCw, Wrench } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import Tooltip from "~/components/Tooltip"
import { Button, IconButton } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

interface HeaderProps {
  selectedAccount: string
  onAddToken: () => void
  onRepairMissingKeys: () => void
  onRefresh: () => void
  onOpenSelectedAccountModels?: () => void
  onRefreshManagedSiteStatus?: () => void
  managedSiteStatusHint?: string
  isLoading: boolean
  isManagedSiteStatusRefreshing?: boolean
  isAddTokenDisabled: boolean
  isRepairDisabled: boolean
  isManagedSiteStatusRefreshDisabled?: boolean
}

/**
 * Page header summarizing the key management section with actions.
 */
export function Header({
  onAddToken,
  onRepairMissingKeys,
  onRefresh,
  onOpenSelectedAccountModels,
  onRefreshManagedSiteStatus,
  managedSiteStatusHint,
  isLoading,
  isManagedSiteStatusRefreshing = false,
  selectedAccount,
  isAddTokenDisabled,
  isRepairDisabled,
  isManagedSiteStatusRefreshDisabled = false,
}: HeaderProps) {
  const { t } = useTranslation("keyManagement")
  let description: ReactNode = t("description")

  if (managedSiteStatusHint) {
    description = (
      <>
        <span className="block">{t("description")}</span>
        <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
          {managedSiteStatusHint}
        </span>
      </>
    )
  }

  return (
    <div className="mb-8">
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement}
        surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader}
      >
        <PageHeader
          icon={KeyRound}
          title={t("title")}
          titleActions={
            onOpenSelectedAccountModels ? (
              <Tooltip content={t("actions.openSelectedAccountModels")}>
                <IconButton
                  type="button"
                  onClick={onOpenSelectedAccountModels}
                  size="sm"
                  variant="outline"
                  aria-label={t("actions.openSelectedAccountModels")}
                  data-testid={
                    KEY_MANAGEMENT_TEST_IDS.openSelectedAccountModelsButton
                  }
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountModelListFromKeyManagement
                  }
                >
                  <Cpu className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            ) : undefined
          }
          description={description}
          actions={
            <>
              <Button
                onClick={onAddToken}
                disabled={isAddTokenDisabled}
                size="sm"
                variant="success"
                leftIcon={<Plus className="h-4 w-4" />}
                data-testid={KEY_MANAGEMENT_TEST_IDS.addTokenButton}
              >
                {t("dialog.addToken")}
              </Button>
              <Button
                onClick={onRepairMissingKeys}
                disabled={isRepairDisabled}
                size="sm"
                variant="outline"
                leftIcon={<Wrench className="h-4 w-4" />}
              >
                {t("repairMissingKeys.action")}
              </Button>
              {onRefreshManagedSiteStatus ? (
                <Button
                  onClick={onRefreshManagedSiteStatus}
                  disabled={isManagedSiteStatusRefreshDisabled}
                  size="sm"
                  variant="outline"
                  loading={isManagedSiteStatusRefreshing}
                  leftIcon={<RefreshCw className="h-4 w-4" />}
                >
                  {isManagedSiteStatusRefreshing
                    ? t("managedSiteStatus.actions.refreshing")
                    : t("managedSiteStatus.actions.refresh")}
                </Button>
              ) : null}
              <Button onClick={onRefresh} disabled={isLoading} size="sm">
                {isLoading && selectedAccount
                  ? t("common:status.refreshing")
                  : t("refreshTokenList")}
              </Button>
            </>
          }
        />
      </ProductAnalyticsScope>
    </div>
  )
}
