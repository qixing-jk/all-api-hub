import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { CalendarCheck2, Search, UserRound } from "lucide-react"
import { useCallback, useState, type MouseEvent } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import AccountList from "~/features/AccountManagement/components/AccountList"
import DedupeAccountsDialog from "~/features/AccountManagement/components/DedupeAccountsDialog"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"

const logger = createLogger("AccountManagementPage")
const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const headerSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader

/**
 * Renders the Account Management page body: header with CTA and account list.
 */
function AccountManagementContent({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation(["account", "common"])
  const { openAddAccount } = useDialogStateContext()
  const {
    displayData,
    handleRefresh,
    handleRefreshDisabledAccounts,
    isRefreshing,
    isRefreshingDisabledAccounts,
  } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()
  const [isDedupeDialogOpen, setIsDedupeDialogOpen] = useState(false)
  const disabledAccounts = displayData.filter((account) => account.disabled)

  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })

  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0
  const canRefreshDisabledAccounts = disabledAccounts.length > 0
  const isAnyRefreshRunning = isRefreshing || isRefreshingDisabledAccounts

  // Open all configured external check-in sites and sync the checked-in status.
  const handleOpenExternalCheckInsClick = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const { openAll, openInNewWindow } = getExternalCheckInOpenOptions(event)
    await handleOpenExternalCheckIns(externalCheckInAccounts, {
      openAll,
      openInNewWindow,
      analyticsContext: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAllExternalCheckIns,
        surfaceId: headerSurface,
        entrypoint: optionsEntrypoint,
      },
    })
  }

  const handleGlobalRefresh = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAllAccounts,
      surfaceId: headerSurface,
      entrypoint: optionsEntrypoint,
    })

    try {
      const result = await toast.promise(handleRefresh(true), {
        loading: t("account:refresh.refreshingAll"),
        success: (result) => {
          if (result.failed > 0) {
            return t("account:refresh.refreshComplete", {
              success: result.success,
              failed: result.failed,
            })
          }

          const sum = result.success + result.failed
          if (sum === 0) {
            return null
          }

          const { refreshedCount } = result
          if (refreshedCount < sum) {
            return t("account:refresh.refreshPartialSkipped", {
              success: refreshedCount,
              skipped: sum - refreshedCount,
            })
          }

          return t("account:refresh.refreshSuccess")
        },
        error: t("account:refresh.refreshFailed"),
      })
      const refreshInsights = {
        itemCount: result.success + result.failed,
        successCount: result.success,
        failureCount: result.failed,
      }
      if (result.failed > 0) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: refreshInsights,
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: refreshInsights,
        })
      }
    } catch (error) {
      logger.error("Error during global refresh", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [handleRefresh, t])

  const handleDisabledRefresh = useCallback(async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshDisabledAccounts,
      surfaceId: headerSurface,
      entrypoint: optionsEntrypoint,
    })

    try {
      const result = await toast.promise(handleRefreshDisabledAccounts(true), {
        loading: t("account:refresh.refreshingDisabled"),
        success: (result) =>
          t(
            result.failedCount > 0
              ? "account:refresh.refreshDisabledCompleteWithFailures"
              : "account:refresh.refreshDisabledComplete",
            {
              restored: result.reEnabledCount,
              stillDisabled: Math.max(
                result.processedCount -
                  result.reEnabledCount -
                  result.failedCount,
                0,
              ),
              failed: result.failedCount,
            },
          ),
        error: t("account:refresh.refreshDisabledFailed"),
      })
      const refreshInsights = {
        itemCount: result.processedCount,
        successCount: Math.max(result.processedCount - result.failedCount, 0),
        failureCount: result.failedCount,
      }
      if (result.failedCount > 0) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: refreshInsights,
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: refreshInsights,
        })
      }
    } catch (error) {
      logger.error("Error during disabled account refresh", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    }
  }, [handleRefreshDisabledAccounts, t])

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={UserRound}
        title={t("account:title")}
        description={t("account:description")}
        actions={
          <ProductAnalyticsScope
            entrypoint={optionsEntrypoint}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
            surfaceId={headerSurface}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void handleGlobalRefresh()}
                variant="secondary"
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                loading={isRefreshing}
                disabled={isAnyRefreshRunning}
              >
                {t("common:actions.refresh")}
              </Button>
              {canRefreshDisabledAccounts && (
                <Button
                  onClick={() => void handleDisabledRefresh()}
                  variant="secondary"
                  leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                  loading={isRefreshingDisabledAccounts}
                  disabled={isAnyRefreshRunning}
                >
                  {t("account:actions.refreshDisabledAccounts")}
                </Button>
              )}
              {canOpenExternalCheckIns && (
                <ProductAnalyticsScope
                  featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin}
                >
                  <Button
                    onClick={handleOpenExternalCheckInsClick}
                    leftIcon={<CalendarCheck2 className="h-4 w-4" />}
                    title={t("account:actions.openAllExternalCheckInHint")}
                  >
                    {t("account:actions.openAllExternalCheckIn")}
                  </Button>
                </ProductAnalyticsScope>
              )}
              <Button
                onClick={() => setIsDedupeDialogOpen(true)}
                variant="secondary"
                leftIcon={<Search className="h-4 w-4" />}
                title={t("account:actions.scanDuplicatesHint")}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.ScanDuplicateAccounts
                }
              >
                {t("account:actions.scanDuplicates")}
              </Button>
              <Button
                onClick={openAddAccount}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog
                }
              >
                {t("account:addAccount")}
              </Button>
            </div>
          </ProductAnalyticsScope>
        }
      />

      <div className="dark:bg-dark-bg-secondary flex flex-col bg-white">
        <AccountList initialSearchQuery={searchQuery} />
      </div>

      <DedupeAccountsDialog
        isOpen={isDedupeDialogOpen}
        onClose={() => setIsDedupeDialogOpen(false)}
      />
    </div>
  )
}

interface AccountManagementProps {
  refreshKey?: number
  routeParams?: Record<string, string>
}

/**
 * Wraps AccountManagementContent with provider and hash-driven params.
 */
function AccountManagement({
  refreshKey,
  routeParams,
}: AccountManagementProps) {
  return (
    <AccountManagementProvider refreshKey={refreshKey}>
      <AccountManagementContent searchQuery={routeParams?.search} />
    </AccountManagementProvider>
  )
}

export default AccountManagement
