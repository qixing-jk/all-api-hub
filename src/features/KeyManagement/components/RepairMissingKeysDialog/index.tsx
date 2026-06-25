import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { Alert, Button, Modal } from "~/components/ui"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyRepairOutcome } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"

import { RepairInvalidKeysDeleteConfirm } from "./RepairInvalidKeysDeleteConfirm"
import {
  filterRepairInvalidTokens,
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
  const { openDefaultTokenQuickCreateDialogForAccount } = useChannelDialog()

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
  const [openingSub2ApiAccountId, setOpeningSub2ApiAccountId] = useState<
    string | null
  >(null)
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

  const accountById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]))
  }, [accounts])

  const accountIds = useMemo(() => {
    return new Set(accounts.map((account) => account.id))
  }, [accounts])

  const visibleResults = useMemo(() => {
    if (!progress) return []
    return progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    )
  }, [disabledAccountIds, progress])

  const invalidTokens = useMemo(() => {
    return visibleResults.flatMap((result) => result.invalidTokens ?? [])
  }, [visibleResults])

  const filteredResults = useMemo(() => {
    return filterRepairResults({
      outcomeFilter,
      results: visibleResults,
      searchTerm,
    })
  }, [outcomeFilter, searchTerm, visibleResults])

  const filteredInvalidTokens = useMemo(() => {
    return filterRepairInvalidTokens(invalidTokens, searchTerm)
  }, [invalidTokens, searchTerm])

  const {
    deleteResultMessage,
    handleDeleteInvalidKeys,
    isDeleteConfirmOpen,
    isDeletingInvalidKeys,
    resetInvalidKeyDeletionState,
    selectedInvalidTokenKeys,
    selectedInvalidTokens,
    setIsDeleteConfirmOpen,
    setSelectedInvalidTokenKeys,
  } = useInvalidKeyDeletion({
    invalidTokens,
    setProgress,
    t,
  })

  const handleOpenSub2ApiTokenDialog = async (accountId: string) => {
    const account = accountById.get(accountId)
    if (!account) return

    setOpeningSub2ApiAccountId(accountId)
    try {
      await openDefaultTokenQuickCreateDialogForAccount(account)
    } finally {
      setOpeningSub2ApiAccountId((current) =>
        current === accountId ? null : current,
      )
    }
  }

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
      resetInvalidKeyDeletionState()
    }
  }, [isOpen, resetInvalidKeyDeletionState])

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
    <Modal
      isOpen={isOpen}
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

          <RepairMissingKeysResultsPanel
            accountIds={accountIds}
            activeView={activeView}
            deleteResultMessage={deleteResultMessage}
            filteredInvalidTokens={filteredInvalidTokens}
            filteredResults={filteredResults}
            invalidTokens={invalidTokens}
            openingSub2ApiAccountId={openingSub2ApiAccountId}
            outcomeCounts={outcomeCounts}
            outcomeFilter={outcomeFilter}
            readOnly={shouldShowReadonlyPreviousResult}
            searchTerm={searchTerm}
            selectedInvalidTokenKeys={selectedInvalidTokenKeys}
            selectedInvalidTokens={selectedInvalidTokens}
            visibleResults={visibleResults}
            onActiveViewChange={setActiveView}
            onOpenDeleteConfirm={() => setIsDeleteConfirmOpen(true)}
            onOpenSub2ApiTokenDialog={(accountId) =>
              void handleOpenSub2ApiTokenDialog(accountId)
            }
            onOutcomeFilterChange={setOutcomeFilter}
            onSearchTermChange={setSearchTerm}
            onSelectedInvalidTokenKeysChange={setSelectedInvalidTokenKeys}
            t={t}
          />
        </div>
      ) : null}

      <RepairInvalidKeysDeleteConfirm
        isOpen={isDeleteConfirmOpen}
        isWorking={isDeletingInvalidKeys}
        selectedInvalidTokens={selectedInvalidTokens}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteInvalidKeys()}
        t={t}
      />
    </Modal>
  )
}
