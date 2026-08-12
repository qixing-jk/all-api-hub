import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { BookmarkPlus, CalendarCheck2, Search, UserRound } from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AccountList from "~/features/AccountManagement/components/AccountList"
import BookmarkAccountImportDialog from "~/features/AccountManagement/components/BookmarkAccountImportDialog"
import DedupeAccountsDialog from "~/features/AccountManagement/components/DedupeAccountsDialog"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { AccountManagementProvider } from "~/features/AccountManagement/hooks/AccountManagementProvider"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import {
  ACCOUNT_MANAGEMENT_ROUTE_ACTIONS,
  ACCOUNT_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/AccountManagement/routeParams"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"
import {
  buildUnifiedApiGuidanceModel,
  GatewayGuidanceDismissDialog,
  getGatewayGuidanceImportableAccounts,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SURFACES,
  UnifiedApiGuidanceCard,
  useGatewayGuidanceDismissal,
  withGuidedAccountKeyImportTarget,
  type UnifiedApiGuidanceAction,
} from "~/features/UnifiedApiGuidance"
import { GATEWAY_GUIDANCE_SURFACES } from "~/services/preferences/userPreferences"
import { buildAccountRefreshDiagnostics } from "~/services/productAnalytics/accountRefresh"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"
import { trackProductAnalyticsEvent } from "~/services/productAnalytics/dispatch"
import { createLogger } from "~/utils/core/logger"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import { pushWithinOptionsPage } from "~/utils/navigation"

const logger = createLogger("AccountManagementPage")
const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const headerSurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader

/** Props used to coordinate account-management page actions with provider-owned dialogs. */
interface AccountManagementContentProps {
  searchQuery?: string
  routeAction?: string
  isBookmarkImportDialogOpen: boolean
  onOpenBookmarkImport: () => void
  onCloseBookmarkImport: () => void
}

/**
 * Renders the Account Management page body: header with CTA and account list.
 */
function AccountManagementContent({
  searchQuery,
  routeAction,
  isBookmarkImportDialogOpen,
  onOpenBookmarkImport,
  onCloseBookmarkImport,
}: AccountManagementContentProps) {
  const { t } = useTranslation(["account", "common", "messages"])
  const { openAddAccount } = useDialogStateContext()
  const consumedAddRouteActionRef = useRef(false)
  const {
    displayData,
    handleRefresh,
    handleRefreshDisabledAccounts,
    isRefreshing,
    isRefreshingDisabledAccounts,
  } = useAccountDataContext()
  const { handleOpenExternalCheckIns } = useAccountActionsContext()
  const { preferences, managedSiteType } = useUserPreferencesContext()
  const { profiles: apiCredentialProfiles } = useApiCredentialProfiles()
  const guidanceDismissal = useGatewayGuidanceDismissal(
    GATEWAY_GUIDANCE_SURFACES.Account,
    preferences,
  )
  const [isDedupeDialogOpen, setIsDedupeDialogOpen] = useState(false)
  const disabledAccounts = displayData.filter((account) => account.disabled)
  const enabledAccountCount = displayData.filter(
    (account) => !account.disabled,
  ).length
  const keyAccessibleAccounts =
    getGatewayGuidanceImportableAccounts(displayData)
  const keyAccessibleAccountCount = keyAccessibleAccounts.length
  const gatewayGuidanceImportAccountId = keyAccessibleAccounts[0]?.id
  const unifiedApiGuidance = buildUnifiedApiGuidanceModel({
    enabledAccountCount,
    keyAccessibleAccountCount,
    profileCount: apiCredentialProfiles.length,
    preferences,
    managedSiteType,
  })

  useEffect(() => {
    const shouldOpenAddAccount =
      routeAction === ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Add
    if (!shouldOpenAddAccount) {
      consumedAddRouteActionRef.current = false
      return
    }
    if (consumedAddRouteActionRef.current) {
      return
    }

    consumedAddRouteActionRef.current = true
    openAddAccount()
  }, [openAddAccount, routeAction])

  const externalCheckInAccounts = displayData.filter((account) => {
    const customUrl = account.checkIn?.customCheckIn?.url
    return typeof customUrl === "string" && customUrl.trim() !== ""
  })

  const canOpenExternalCheckIns = externalCheckInAccounts.length > 0
  const canRefreshDisabledAccounts = disabledAccounts.length > 0
  const isAnyRefreshRunning = isRefreshing || isRefreshingDisabledAccounts

  const handleUnifiedApiGuidanceAction = useCallback(
    (action: UnifiedApiGuidanceAction) => {
      const navigationAction = withGuidedAccountKeyImportTarget(
        action,
        gatewayGuidanceImportAccountId,
      )
      const routeParams = navigationAction.target.params ?? {}

      void trackProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
          surface_id:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementUnifiedApiGuidance,
          entrypoint: optionsEntrypoint,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
          target_page_id: navigationAction.target.menuItemId,
          route_params_present: Object.keys(routeParams).length > 0,
          guidance_status: unifiedApiGuidance.status,
          guidance_action_kind: navigationAction.kind,
        },
      )

      if (action.kind === UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount) {
        openAddAccount()
        return
      }

      pushWithinOptionsPage(
        `#${navigationAction.target.menuItemId}`,
        routeParams,
      )
    },
    [gatewayGuidanceImportAccountId, openAddAccount, unifiedApiGuidance.status],
  )

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
      const skippedCount = Math.max(
        refreshInsights.itemCount - result.refreshedCount,
        0,
      )
      const refreshDiagnostics = buildAccountRefreshDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        itemCount: refreshInsights.itemCount,
        successCount: result.success,
        failureCount: result.failed,
        skippedCount,
        ...(result.failed > 0
          ? { failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute }
          : {}),
      })
      if (result.failed > 0) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: refreshInsights,
          diagnostics: refreshDiagnostics,
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: refreshInsights,
          diagnostics: refreshDiagnostics,
        })
      }
    } catch (error) {
      logger.error("Error during global refresh", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        diagnostics: buildAccountRefreshDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          error,
        }),
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
      const refreshDiagnostics = buildAccountRefreshDiagnostics({
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        itemCount: refreshInsights.itemCount,
        successCount: refreshInsights.successCount,
        failureCount: refreshInsights.failureCount,
        skippedCount: 0,
        ...(result.failedCount > 0
          ? { failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute }
          : {}),
      })
      if (result.failedCount > 0) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: refreshInsights,
          diagnostics: refreshDiagnostics,
        })
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: refreshInsights,
          diagnostics: refreshDiagnostics,
        })
      }
    } catch (error) {
      logger.error("Error during disabled account refresh", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        diagnostics: buildAccountRefreshDiagnostics({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          error,
        }),
      })
    }
  }, [handleRefreshDisabledAccounts, t])

  return (
    <div className="dark:bg-dark-bg-secondary flex flex-col bg-white p-6">
      <PageHeader
        icon={UserRound}
        title={t("account:title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId="accountManagement"
            anchor="account-management"
          />
        }
        description={t("account:description")}
        actions={
          <ProductAnalyticsScope
            entrypoint={optionsEntrypoint}
            featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
            surfaceId={headerSurface}
          >
            <div
              className="flex w-full flex-wrap items-center justify-end gap-2"
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.headerActions}
            >
              <Button
                onClick={() => void handleGlobalRefresh()}
                variant="secondary"
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                loading={isRefreshing}
                disabled={isAnyRefreshRunning}
              >
                {isRefreshing
                  ? t("account:refresh.refreshingAll")
                  : t("common:actions.refresh")}
              </Button>
              {canRefreshDisabledAccounts && (
                <Button
                  onClick={() => void handleDisabledRefresh()}
                  variant="secondary"
                  leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                  loading={isRefreshingDisabledAccounts}
                  disabled={isAnyRefreshRunning}
                >
                  {isRefreshingDisabledAccounts
                    ? t("account:refresh.refreshingDisabled")
                    : t("account:actions.refreshDisabledAccounts")}
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
                    data-testid={
                      ACCOUNT_MANAGEMENT_TEST_IDS.externalCheckInButton
                    }
                  >
                    {t("account:actions.openAllExternalCheckIn")}
                  </Button>
                </ProductAnalyticsScope>
              )}
              <Button
                onClick={onOpenBookmarkImport}
                variant="secondary"
                leftIcon={<BookmarkPlus className="h-4 w-4" />}
                title={t("account:actions.importFromBookmarksHint")}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.bookmarkImportButton}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.ImportAccountsFromBookmarks
                }
              >
                {t("account:actions.importFromBookmarks")}
              </Button>
              <Button
                onClick={() => setIsDedupeDialogOpen(true)}
                variant="secondary"
                leftIcon={<Search className="h-4 w-4" />}
                title={t("account:actions.scanDuplicatesHint")}
                data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton}
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

      {guidanceDismissal.shouldShow ? (
        <div className="mb-4">
          <UnifiedApiGuidanceCard
            model={unifiedApiGuidance}
            surface={UNIFIED_API_GUIDANCE_SURFACES.Account}
            onAction={handleUnifiedApiGuidanceAction}
            onDismissForSession={guidanceDismissal.dismissForSession}
            onRequestPermanentDismiss={
              guidanceDismissal.requestPermanentDismiss
            }
          />
        </div>
      ) : null}
      <GatewayGuidanceDismissDialog
        isOpen={guidanceDismissal.isPermanentDismissDialogOpen}
        title={t("account:unifiedApiGuidance.dismissDialog.title")}
        description={t("account:unifiedApiGuidance.dismissDialog.description")}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("account:unifiedApiGuidance.dismissDialog.confirm")}
        errorMessage={
          guidanceDismissal.hasPermanentDismissError
            ? t("messages:toast.error.saveFailed")
            : undefined
        }
        isSaving={guidanceDismissal.isPermanentDismissSaving}
        onClose={guidanceDismissal.cancelPermanentDismiss}
        onConfirm={() => void guidanceDismissal.confirmPermanentDismiss()}
      />

      <div className="dark:bg-dark-bg-secondary flex flex-col bg-white">
        <AccountList initialSearchQuery={searchQuery} />
      </div>

      <DedupeAccountsDialog
        isOpen={isDedupeDialogOpen}
        onClose={() => setIsDedupeDialogOpen(false)}
      />
      {isBookmarkImportDialogOpen && (
        <BookmarkAccountImportDialog isOpen onClose={onCloseBookmarkImport} />
      )}
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
  const [isBookmarkImportDialogOpen, setIsBookmarkImportDialogOpen] =
    useState(false)
  const openBookmarkImportDialog = useCallback(() => {
    setIsBookmarkImportDialogOpen(true)
  }, [])
  const closeBookmarkImportDialog = useCallback(() => {
    setIsBookmarkImportDialogOpen(false)
  }, [])

  return (
    <AccountManagementProvider
      refreshKey={refreshKey}
      onOpenBookmarkImport={openBookmarkImportDialog}
    >
      <AccountManagementContent
        searchQuery={routeParams?.search}
        routeAction={routeParams?.[ACCOUNT_MANAGEMENT_ROUTE_PARAMS.Action]}
        isBookmarkImportDialogOpen={isBookmarkImportDialogOpen}
        onOpenBookmarkImport={openBookmarkImportDialog}
        onCloseBookmarkImport={closeBookmarkImportDialog}
      />
    </AccountManagementProvider>
  )
}

export default AccountManagement
