import { LineChart, RefreshCcw, Scissors, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  WorkflowTransitionButton,
} from "~/components/ui"
import { Spinner } from "~/components/ui/spinner"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { BalanceHistoryFilters } from "~/features/BalanceHistory/filtering/BalanceHistoryFilters"
import BalanceHistoryAccountSummaryTable from "~/features/BalanceHistory/reporting/BalanceHistoryAccountSummaryTable"
import { BalanceHistoryBreakdown } from "~/features/BalanceHistory/reporting/BalanceHistoryBreakdown"
import { BalanceHistoryOverview } from "~/features/BalanceHistory/reporting/BalanceHistoryOverview"
import { BalanceHistoryTrend } from "~/features/BalanceHistory/reporting/BalanceHistoryTrend"
import { useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import { BALANCE_HISTORY_TEST_IDS } from "./testIds"

const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
const balanceHistorySurface =
  PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBalanceHistoryPage
/** Render history filters and charts from the composed reporting model. */
export default function BalanceHistory() {
  const { t } = useTranslation("balanceHistory")
  const viewModel = useBalanceHistoryViewModel()
  const {
    isInitialLoading,
    handleRefreshNow,
    handlePruneNow,
    shouldShowCashflowWarning,
    shouldShowEnableBalanceHistoryHint,
    openBalanceHistorySettings,
    snapshotAvailableDays,
    isStoreEmpty,
    currencySymbol,
    estimatedTodayIncomeEnabled,
    tableRows,
    isLoading,
  } = viewModel
  return (
    <div
      className="space-y-density-6 py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-options-page-pending={isInitialLoading ? "" : undefined}
    >
      <PageHeader
        icon={LineChart}
        title={t("title")}
        titleActions={
          <OptionsPageSettingsTitleAction
            tabId={BASIC_SETTINGS_TAB_IDS.BalanceHistory}
            anchor={SETTINGS_ANCHORS.BALANCE_HISTORY}
            analyticsAction={{
              featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
              actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenBalanceHistorySettings,
              surfaceId: balanceHistorySurface,
              entrypoint: optionsEntrypoint,
            }}
          />
        }
        description={t("description")}
        actions={
          <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleRefreshNow()}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              {t("actions.refreshNow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePruneNow()}
              leftIcon={<Scissors className="h-4 w-4" />}
            >
              {t("actions.prune")}
            </Button>
          </div>
        }
      />

      {shouldShowCashflowWarning && (
        <Alert
          variant="warning"
          title={t("warnings.cashflowDisabled.title")}
          description={t("warnings.cashflowDisabled.description")}
        />
      )}

      {shouldShowEnableBalanceHistoryHint ? (
        <Alert
          variant="default"
          title={t("hints.disabled.title")}
          description={t("hints.disabled.description")}
        >
          <ActionGroup className="mt-density-3 items-stretch justify-start">
            <WorkflowTransitionButton
              size="sm"
              variant="outline"
              onClick={openBalanceHistorySettings}
              leftIcon={<Settings className="h-4 w-4" />}
              analyticsAction={{
                featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BalanceHistory,
                actionId:
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenBalanceHistorySettings,
                surfaceId: balanceHistorySurface,
                entrypoint: optionsEntrypoint,
              }}
            >
              {t("hints.disabled.actions.openSettings")}
            </WorkflowTransitionButton>
          </ActionGroup>
        </Alert>
      ) : (
        <>
          <BalanceHistoryFilters model={viewModel} />

          {isInitialLoading ? (
            <div className="py-density-6 flex justify-center" aria-busy="true">
              <Spinner aria-label={t("messages.loading.loadingData")} />
            </div>
          ) : isStoreEmpty ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">{t("empty.title")}</div>
                <div className="text-muted-foreground text-sm">
                  {t("empty.description")}
                </div>
              </div>
            </Card>
          ) : snapshotAvailableDays === 0 ? (
            <Card padding="md">
              <div className="space-y-density-1">
                <div className="text-sm font-medium">
                  {t("emptyRange.title")}
                </div>
                <div className="text-muted-foreground text-sm">
                  {t("emptyRange.description")}
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-density-6">
              <BalanceHistoryOverview model={viewModel} />

              <div className="gap-y-density-6 grid grid-cols-1 gap-x-6 lg:grid-cols-2">
                <BalanceHistoryBreakdown model={viewModel} />

                <BalanceHistoryTrend model={viewModel} />
              </div>

              <Card
                padding="md"
                data-testid={BALANCE_HISTORY_TEST_IDS.accountSummary}
              >
                <div className="space-y-density-3">
                  <div className="text-sm font-medium">{t("table.title")}</div>
                  <BalanceHistoryAccountSummaryTable
                    rows={tableRows}
                    isLoading={isLoading}
                    currencySymbol={currencySymbol}
                    showEstimatedIncome={estimatedTodayIncomeEnabled}
                  />
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
