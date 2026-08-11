import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import ManagedSiteTypeSwitcher from "~/components/ManagedSiteTypeSwitcher"
import { Alert, Button, Modal } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyRepairOutcome } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import { ManagedSiteTokenBatchExportDialog } from "../ManagedSiteTokenBatchExportDialog"
import { RepairInvalidKeysDeleteConfirm } from "./RepairInvalidKeysDeleteConfirm"
import {
  filterRepairInvalidResources,
  filterRepairResults,
  getRepairOutcomeCounts,
  REPAIR_RESULT_VIEWS,
  type RepairResultView,
} from "./repairMissingKeysDialogHelpers"
import { RepairMissingKeysProgressCard } from "./RepairMissingKeysProgressCard"
import { RepairMissingKeysResultsPanel } from "./RepairMissingKeysResultsPanel"
import { RepairMissingKeysSetupCard } from "./RepairMissingKeysSetupCard"
import { RepairMissingKeysStatusBadge } from "./RepairMissingKeysStatusBadge"
import { RepairPreviousResultSummary } from "./RepairPreviousResultSummary"
import { RepairRenameOption } from "./RepairRenameOption"
import { useInvalidKeyDeletion } from "./useInvalidKeyDeletion"
import { useRepairCreatedKeyManagedSiteImport } from "./useRepairCreatedKeyManagedSiteImport"
import { useRepairMissingKeysJob } from "./useRepairMissingKeysJob"

interface RepairMissingKeysDialogProps {
  isOpen: boolean
  onClose: () => void
  accounts: DisplaySiteData[]
  startOnOpen: boolean
}

/**
 * Modal dialog showing the background progress of the "ensure at least one key" job.
 */
export function RepairMissingKeysDialog(props: RepairMissingKeysDialogProps) {
  const { isOpen, onClose, accounts, startOnOpen } = props
  const { t } = useTranslation(["keyManagement", "common"])
  const { managedSiteType } = useUserPreferencesContext()

  const [searchTerm, setSearchTerm] = useState("")
  const [outcomeFilter, setOutcomeFilter] =
    useState<AccountKeyRepairOutcome | null>(null)
  const [activeView, setActiveView] = useState<RepairResultView>(
    REPAIR_RESULT_VIEWS.AccountCoverage,
  )
  const [renameAutoTemplateTokens, setRenameAutoTemplateTokens] = useState(true)
  const [hasStartedRepairInSession, setHasStartedRepairInSession] =
    useState(false)
  const [hasSeenRunningRepairInSession, setHasSeenRunningRepairInSession] =
    useState(false)
  const [previousResultJobId, setPreviousResultJobId] = useState<string | null>(
    null,
  )
  const [isPreviousResultExpanded, setIsPreviousResultExpanded] =
    useState(false)
  const {
    error,
    handleCancelAudit,
    handleStartAudit,
    isCancelling,
    isStarting,
    progress,
    setProgress,
  } = useRepairMissingKeysJob({
    accounts,
    isOpen,
    renameAutoTemplateTokens,
    startOnOpen,
    t,
  })

  const disabledAccountIds = useMemo(() => {
    return new Set(
      accounts.filter((account) => account.disabled).map((a) => a.id),
    )
  }, [accounts])

  const visibleResults = useMemo(() => {
    if (!progress) return []
    return progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    )
  }, [disabledAccountIds, progress])

  const invalidResources = useMemo(() => {
    return visibleResults.flatMap((result) => result.invalidResources)
  }, [visibleResults])

  const filteredResults = useMemo(() => {
    return filterRepairResults({
      outcomeFilter,
      results: visibleResults,
      searchTerm,
    })
  }, [outcomeFilter, searchTerm, visibleResults])

  const filteredInvalidResources = useMemo(
    () => filterRepairInvalidResources(invalidResources, searchTerm),
    [invalidResources, searchTerm],
  )

  const {
    deleteResultMessage,
    handleDeleteInvalidResources,
    isDeleteConfirmOpen,
    isDeletingInvalidResources,
    resetInvalidResourceDeletionState,
    selectedInvalidResourceKeys,
    selectedInvalidResources,
    setIsDeleteConfirmOpen,
    setSelectedInvalidResourceKeys,
  } = useInvalidKeyDeletion({
    invalidResources,
    setProgress,
    t,
  })

  const outcomeCounts = useMemo(() => {
    return getRepairOutcomeCounts(visibleResults)
  }, [visibleResults])

  const isTerminalProgress =
    progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed ||
    progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed ||
    progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled
  const isPreviousResult =
    Boolean(progress) &&
    isTerminalProgress &&
    ((!hasStartedRepairInSession && !hasSeenRunningRepairInSession) ||
      progress?.jobId === previousResultJobId)
  const shouldShowPreviousResultSummary =
    isPreviousResult && !isPreviousResultExpanded
  const shouldShowCheckSetup =
    !progress ||
    progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Idle ||
    shouldShowPreviousResultSummary
  const shouldShowProgressDetails =
    Boolean(progress) &&
    progress?.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Idle &&
    (!isPreviousResult || isPreviousResultExpanded)
  const shouldShowReadonlyPreviousResult =
    Boolean(progress) && isPreviousResult && isPreviousResultExpanded
  const statusProgress = shouldShowPreviousResultSummary ? null : progress

  const repairCreatedImport = useRepairCreatedKeyManagedSiteImport({
    accounts,
    isOpen,
    isCurrentSessionResult: !isPreviousResult,
    managedSiteType,
    progress,
    setProgress,
    t,
  })

  const handleStartRepair = () => {
    setHasStartedRepairInSession(true)
    setPreviousResultJobId(progress?.jobId ?? null)
    setIsPreviousResultExpanded(false)
    void handleStartAudit()
  }

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setOutcomeFilter(null)
      setActiveView(REPAIR_RESULT_VIEWS.AccountCoverage)
      setHasStartedRepairInSession(false)
      setHasSeenRunningRepairInSession(false)
      setPreviousResultJobId(null)
      setIsPreviousResultExpanded(false)
      resetInvalidResourceDeletionState()
    }
  }, [isOpen, resetInvalidResourceDeletionState])

  useEffect(() => {
    if (!isOpen) return
    if (!startOnOpen) return

    setIsPreviousResultExpanded(true)
  }, [isOpen, startOnOpen])

  useEffect(() => {
    if (progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running) {
      setHasStartedRepairInSession(true)
      setHasSeenRunningRepairInSession(true)
      setPreviousResultJobId(null)
      setIsPreviousResultExpanded(true)
    }
  }, [progress?.state])

  const renameOption = (
    <RepairRenameOption
      checked={renameAutoTemplateTokens}
      onCheckedChange={setRenameAutoTemplateTokens}
      t={t}
    />
  )

  const handleReturnToCheckSetup = () => {
    setIsPreviousResultExpanded(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen && !repairCreatedImport.isBatchImportOpen}
        onClose={onClose}
        size="lg"
        panelClassName="sm:max-w-3xl"
        header={
          <div className="space-y-1 pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">
                {t("repairMissingKeys.title")}
              </h2>
              <RepairMissingKeysStatusBadge progress={statusProgress} t={t} />
            </div>
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("repairMissingKeys.description")}
            </p>
          </div>
        }
        footer={
          shouldShowReadonlyPreviousResult ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReturnToCheckSetup}
              >
                {t("repairMissingKeys.previousResult.backToSetup")}
              </Button>
            </div>
          ) : shouldShowProgressDetails && progress ? (
            <p className="dark:text-dark-text-secondary text-xs text-gray-500">
              {progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running
                ? t("repairMissingKeys.runningNote")
                : t("repairMissingKeys.historyNote")}
            </p>
          ) : null
        }
      >
        {error ? <Alert variant="destructive" description={error} /> : null}

        {shouldShowCheckSetup ? (
          <RepairMissingKeysSetupCard
            isStarting={isStarting}
            previousResultSummary={
              shouldShowPreviousResultSummary ? (
                <RepairPreviousResultSummary
                  onViewResult={() => setIsPreviousResultExpanded(true)}
                  t={t}
                />
              ) : null
            }
            renameOption={renameOption}
            onStartRepair={handleStartRepair}
            t={t}
          />
        ) : null}

        {shouldShowProgressDetails && progress ? (
          <div className="space-y-4">
            {progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running &&
            !shouldShowReadonlyPreviousResult
              ? renameOption
              : null}

            <RepairMissingKeysProgressCard
              progress={progress}
              isCancelling={isCancelling}
              isStarting={isStarting}
              onCancelAudit={() => void handleCancelAudit()}
              onStartAudit={handleStartRepair}
              actions={shouldShowReadonlyPreviousResult ? null : undefined}
              t={t}
            />

            {repairCreatedImport.createdReferenceCount > 0 ? (
              <div
                className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3"
                data-testid={
                  KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportCard
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium">
                      {t(
                        "keyManagement:repairMissingKeys.managedSiteImport.title",
                      )}
                    </div>
                    <div className="dark:text-dark-text-secondary text-xs text-gray-500">
                      {t(
                        "keyManagement:repairMissingKeys.managedSiteImport.target",
                        {
                          count: repairCreatedImport.createdReferenceCount,
                          site: getManagedSiteLabel(t, managedSiteType),
                        },
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ManagedSiteTypeSwitcher
                      ariaLabel={t(
                        "keyManagement:repairMissingKeys.managedSiteImport.changeTarget",
                      )}
                      size="sm"
                      triggerClassName="w-auto min-w-[172px]"
                      triggerTestId={
                        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportTargetSwitcher
                      }
                      disabled={repairCreatedImport.isResolving}
                    />
                    <Button
                      type="button"
                      size="sm"
                      loading={repairCreatedImport.isResolving}
                      data-testid={
                        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton
                      }
                      onClick={() => void repairCreatedImport.openBatchImport()}
                    >
                      {repairCreatedImport.isResolving
                        ? t("common:status.loading")
                        : t(
                            "keyManagement:repairMissingKeys.managedSiteImport.action",
                            {
                              count: repairCreatedImport.createdReferenceCount,
                            },
                          )}
                    </Button>
                  </div>
                </div>
                {repairCreatedImport.importFeedback ? (
                  <Alert
                    variant={repairCreatedImport.importFeedback.variant}
                    compact
                    description={repairCreatedImport.importFeedback.description}
                  >
                    {repairCreatedImport.importFeedback.action ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={repairCreatedImport.isResolving}
                        onClick={() => {
                          if (
                            repairCreatedImport.importFeedback?.action ===
                            "configure-managed-site"
                          ) {
                            void repairCreatedImport.openManagedSiteConfiguration()
                            return
                          }

                          void repairCreatedImport.openRegularBatchImport()
                        }}
                      >
                        {t(
                          repairCreatedImport.importFeedback.action ===
                            "configure-managed-site"
                            ? "keyManagement:repairMissingKeys.managedSiteImport.openConfiguration"
                            : "keyManagement:repairMissingKeys.managedSiteImport.useRegularImport",
                        )}
                      </Button>
                    ) : null}
                  </Alert>
                ) : null}
              </div>
            ) : null}

            <RepairMissingKeysResultsPanel
              activeView={activeView}
              deleteResultMessage={deleteResultMessage}
              filteredInvalidResources={filteredInvalidResources}
              filteredResults={filteredResults}
              invalidResources={invalidResources}
              outcomeCounts={outcomeCounts}
              outcomeFilter={outcomeFilter}
              readOnly={shouldShowReadonlyPreviousResult}
              searchTerm={searchTerm}
              selectedInvalidResourceKeys={selectedInvalidResourceKeys}
              selectedInvalidResources={selectedInvalidResources}
              visibleResults={visibleResults}
              onActiveViewChange={setActiveView}
              onOpenDeleteConfirm={() => setIsDeleteConfirmOpen(true)}
              onOutcomeFilterChange={setOutcomeFilter}
              onSearchTermChange={setSearchTerm}
              onSelectedInvalidResourceKeysChange={
                setSelectedInvalidResourceKeys
              }
              t={t}
            />
          </div>
        ) : null}

        <RepairInvalidKeysDeleteConfirm
          isOpen={isDeleteConfirmOpen}
          isWorking={isDeletingInvalidResources}
          selectedInvalidResources={selectedInvalidResources}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={() => void handleDeleteInvalidResources()}
          t={t}
        />
      </Modal>
      <ManagedSiteTokenBatchExportDialog
        isOpen={isOpen && repairCreatedImport.isBatchImportOpen}
        onClose={repairCreatedImport.closeBatchImport}
        items={repairCreatedImport.batchImportItems}
        intent={repairCreatedImport.batchImportIntent ?? undefined}
        onCompleted={repairCreatedImport.handleBatchImportCompleted}
      />
    </>
  )
}
