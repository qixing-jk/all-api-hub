import { History, Info, ShieldCheck } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  Checkbox,
  Label,
  Modal,
  Spinner,
} from "~/components/ui"
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

  const renderRenameOption = () => (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/40 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex items-start gap-3">
        <Checkbox
          id="repair-missing-keys-rename-auto-template"
          checked={renameAutoTemplateTokens}
          onCheckedChange={(checked) =>
            setRenameAutoTemplateTokens(checked === true)
          }
        />
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Label
              htmlFor="repair-missing-keys-rename-auto-template"
              className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200"
            >
              {t("repairMissingKeys.renameOption.label")}
            </Label>
            <Tooltip
              content={t("repairMissingKeys.renameOption.tooltip")}
              position="top"
              className="max-w-xs"
            >
              <button
                type="button"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-gray-500 dark:hover:text-gray-300"
                aria-label={t("repairMissingKeys.renameOption.infoLabel")}
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            {t("repairMissingKeys.renameOption.helper")}
          </p>
        </div>
      </div>
    </div>
  )

  const renderPreviousResultSummary = () => (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary/30 rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-gray-100 p-2 text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            <History className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {t("repairMissingKeys.previousResult.title")}
            </p>
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              {t("repairMissingKeys.previousResult.description")}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPreviousResultExpanded(true)}
          className="w-full sm:w-auto"
        >
          {t("repairMissingKeys.previousResult.view")}
        </Button>
      </div>
    </div>
  )

  const handleReturnToCheckSetup = () => {
    setIsPreviousResultExpanded(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      header={
        <div className="space-y-1 pr-10">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              {t("repairMissingKeys.title")}
            </h2>
            {statusProgress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
              <Badge
                variant="info"
                size="sm"
                className="shrink-0 border-transparent"
              >
                <Spinner size="sm" className="h-3.5 w-3.5" />
                {t("common:status.processing")}
              </Badge>
            ) : statusProgress?.state ===
              ACCOUNT_KEY_REPAIR_JOB_STATES.Failed ? (
              <Badge
                variant="danger"
                size="sm"
                className="shrink-0 border-transparent"
              >
                {t("common:status.failed")}
              </Badge>
            ) : statusProgress?.state ===
              ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled ? (
              <Badge
                variant="warning"
                size="sm"
                className="shrink-0 border-transparent"
              >
                {t("common:status.cancelled")}
              </Badge>
            ) : statusProgress?.state ===
              ACCOUNT_KEY_REPAIR_JOB_STATES.Completed ? (
              <Badge
                variant={
                  statusProgress.summary.failed > 0 ? "warning" : "success"
                }
                size="sm"
                className="shrink-0 border-transparent"
              >
                {statusProgress.summary.failed > 0
                  ? t("common:status.error")
                  : t("common:status.success")}
              </Badge>
            ) : null}
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
        <Card variant="outlined" className="overflow-hidden">
          <CardContent padding="default" className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="pt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {t("repairMissingKeys.initialNotice")}
              </p>
            </div>
            <Alert
              variant="info"
              compact
              description={t("repairMissingKeys.remoteWriteNotice")}
            />
            {renderRenameOption()}
            {shouldShowPreviousResultSummary
              ? renderPreviousResultSummary()
              : null}
          </CardContent>
          <CardFooter
            padding="sm"
            className="dark:bg-dark-bg-primary/40 justify-start bg-gray-50/80"
          >
            <Button
              type="button"
              onClick={handleStartRepair}
              disabled={isStarting}
              loading={isStarting}
              className="w-full sm:w-auto"
            >
              {t("repairMissingKeys.actions.start")}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {shouldShowProgressDetails && progress ? (
        <div className="space-y-4">
          {progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running &&
          !shouldShowReadonlyPreviousResult
            ? renderRenameOption()
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
