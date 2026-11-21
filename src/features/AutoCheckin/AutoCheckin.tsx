import { CalendarCheck2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { OptionsPageSettingsTitleAction } from "~/components/OptionsPageSettingsTitleAction"
import { PageHeader } from "~/components/PageHeader"
import { Alert, Button } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { BASIC_SETTINGS_TAB_IDS } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import DelAccountDialog from "~/features/AccountManagement/components/DelAccountDialog"
import { AutoCheckinPretriggerCompletionDialog } from "~/features/AutoCheckin/pretrigger/AutoCheckinPretriggerCompletionDialog"
import { AutoCheckinRiskHint } from "~/features/AutoCheckin/pretrigger/AutoCheckinRiskHint"
import AccountSnapshotTable from "~/features/AutoCheckin/readiness/AccountSnapshotTable"
import EmptyResults from "~/features/AutoCheckin/results/EmptyResults"
import ResultsTable from "~/features/AutoCheckin/results/ResultsTable"
import ActionBar from "~/features/AutoCheckin/workspace/ActionBar"
import AutoCheckinDataWorkspace from "~/features/AutoCheckin/workspace/AutoCheckinDataWorkspace"
import LoadingSkeleton from "~/features/AutoCheckin/workspace/LoadingSkeleton"
import StatusCard from "~/features/AutoCheckin/workspace/StatusCard"
import { useAutoCheckinViewModel } from "~/features/AutoCheckin/workspace/useAutoCheckinViewModel"

/** Render the feature through its state and command owner. */
export default function AutoCheckin(props: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation(["autoCheckin", "messages", "account", "common"])
  const {
    autoCheckinPreferences,
    autoCheckinEnabled,
    status,
    siteTypeMismatches,
    accountInfoById,
    accountSetupState,
    isLoading,
    statusLoadFailed,
    isRunning,
    isManualRefreshing,
    isOpeningFailedManualSignIns,
    isOpeningExternalCheckIns,
    retryingAccountId,
    verifyingAccountId,
    disablingAccountId,
    pendingOpeningSiteAccountIds,
    openingManualAccountId,
    openingExternalCheckInAccountId,
    deletingAccountId,
    deleteDialogAccount,
    setDeleteDialogAccount,
    uiOpenPretriggerDiagnostics,
    setUiOpenPretriggerDiagnostics,
    uiOpenPretriggerCompletion,
    setUiOpenPretriggerCompletion,
    loadStatus,
    isDebugPending,
    handleRunNow,
    showDebugButtons,
    accountResults,
    currencyType,
    failedManualAccountIds,
    canOpenExternalCheckIns,
    externalCheckInAccountIds,
    handleRefresh,
    handleOpenAccountManagement,
    handleRetryAccount,
    handleVerifyAccountStatus,
    handleOpenAccountSite,
    handleOpenManualSignIn,
    handleDisableAccount,
    handleDeleteAccount,
    handleOpenFailedManualSignIns,
    handleOpenExternalCheckIns,
    handleOpenAccountExternalCheckIn,
    isInitialLoading,
  } = useAutoCheckinViewModel(props)
  if (isInitialLoading) {
    return <LoadingSkeleton />
  }

  const hasHistory = accountResults.length > 0
  const snapshots = status?.accountsSnapshot ?? []
  const resultsContent = hasHistory ? (
    <ResultsTable
      results={accountResults}
      siteTypeMismatches={siteTypeMismatches}
      accountInfoById={accountInfoById}
      currencyType={currencyType}
      showDevActions={showDebugButtons}
      retryingAccountId={retryingAccountId}
      verifyingAccountId={verifyingAccountId}
      disablingAccountId={disablingAccountId}
      deletingAccountId={deletingAccountId}
      pendingOpeningSiteAccountIds={pendingOpeningSiteAccountIds}
      openingManualAccountId={openingManualAccountId}
      openingExternalCheckInAccountId={openingExternalCheckInAccountId}
      onCheckInUpdated={loadStatus}
      onRetryAccount={handleRetryAccount}
      onVerifyAccountStatus={handleVerifyAccountStatus}
      onDisableAccount={handleDisableAccount}
      onDeleteAccount={handleDeleteAccount}
      onOpenAccountSite={handleOpenAccountSite}
      onOpenManualSignIn={handleOpenManualSignIn}
      externalCheckInAccountIds={externalCheckInAccountIds}
      onOpenExternalCheckIn={handleOpenAccountExternalCheckIn}
    />
  ) : (
    <EmptyResults
      hasHistory={false}
      setupState={accountSetupState ?? "ready"}
      onOpenAccounts={handleOpenAccountManagement}
    />
  )

  const actionBar = (
    <ActionBar
      isRunning={isRunning}
      isRefreshing={isManualRefreshing}
      isRefreshLocked={isLoading}
      isDebugActionPending={isDebugPending}
      isOpeningFailedManualSignIns={isOpeningFailedManualSignIns}
      isOpeningExternalCheckIns={isOpeningExternalCheckIns}
      canOpenFailedManualSignIns={failedManualAccountIds.length > 0}
      canOpenExternalCheckIns={canOpenExternalCheckIns}
      onRunNow={handleRunNow}
      onRefresh={handleRefresh}
      onOpenFailedManualSignIns={handleOpenFailedManualSignIns}
      onOpenExternalCheckIns={handleOpenExternalCheckIns}
    />
  )

  return (
    <div className="px-4 py-density-4 sm:px-6 sm:py-density-6">
      <PageHeader
        icon={CalendarCheck2}
        title={
          autoCheckinEnabled ? t("execution.title") : t("execution.manualTitle")
        }
        titleActions={
          <>
            <AutoCheckinRiskHint />
            <OptionsPageSettingsTitleAction
              tabId={BASIC_SETTINGS_TAB_IDS.CheckinRedeem}
              anchor={SETTINGS_ANCHORS.AUTO_CHECKIN}
            />
          </>
        }
        description={
          autoCheckinEnabled ? t("description") : t("manualDescription")
        }
        spacing="compact"
      />

      <div className="space-y-density-4" data-page-motion-group>
        {statusLoadFailed && (
          <Alert
            variant="destructive"
            description={t("execution.statusLoadError")}
            action={
              <Button
                variant="secondary"
                disabled={isLoading}
                onClick={() => void loadStatus()}
              >
                {t("execution.retryStatusLoad")}
              </Button>
            }
          />
        )}
        {status ? (
          <StatusCard
            status={status}
            preferences={autoCheckinPreferences}
            actions={actionBar}
          />
        ) : (
          actionBar
        )}

        {snapshots.length > 0 ? (
          <AutoCheckinDataWorkspace
            hasHistory={hasHistory}
            results={accountResults}
            snapshots={snapshots}
            resultsContent={resultsContent}
            readinessContent={
              <AccountSnapshotTable
                snapshots={snapshots}
                onCheckInUpdated={loadStatus}
              />
            }
          />
        ) : (
          resultsContent
        )}
      </div>

      <AutoCheckinPretriggerCompletionDialog
        isOpen={uiOpenPretriggerCompletion.isOpen}
        summary={uiOpenPretriggerCompletion.summary}
        pendingRetry={uiOpenPretriggerCompletion.pendingRetry}
        onClose={() =>
          setUiOpenPretriggerCompletion((prev) => ({ ...prev, isOpen: false }))
        }
      />

      <DelAccountDialog
        isOpen={deleteDialogAccount !== null}
        onClose={() => setDeleteDialogAccount(null)}
        account={deleteDialogAccount}
        onDeleted={() => {
          void loadStatus()
          setDeleteDialogAccount(null)
        }}
      />

      <Modal
        isOpen={uiOpenPretriggerDiagnostics.isOpen}
        onClose={() =>
          setUiOpenPretriggerDiagnostics({ isOpen: false, payload: null })
        }
        header={
          <div className="text-lg font-semibold text-foreground">
            {t("execution.debug.uiOpenPretriggerDiagnosticsTitle")}
          </div>
        }
        footer={
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setUiOpenPretriggerDiagnostics({ isOpen: false, payload: null })
              }
            >
              {t("uiOpenPretrigger.close")}
            </Button>
          </div>
        }
      >
        <div className="space-y-density-3">
          <p className="text-sm text-muted-foreground dark:text-secondary-foreground">
            {t("execution.debug.uiOpenPretriggerDiagnosticsDesc")}
          </p>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-surface-subtle px-3 py-density-3 text-xs text-secondary-foreground md:max-h-[min(70vh,48rem)] dark:bg-secondary">
            {uiOpenPretriggerDiagnostics.payload
              ? JSON.stringify(uiOpenPretriggerDiagnostics.payload, null, 2)
              : ""}
          </pre>
        </div>
      </Modal>
    </div>
  )
}
