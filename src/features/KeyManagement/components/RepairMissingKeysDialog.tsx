import { ShieldCheck } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
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
  const [openingSub2ApiAccountId, setOpeningSub2ApiAccountId] = useState<
    string | null
  >(null)
  const { error, handleStartAudit, isStarting, progress, setProgress } =
    useRepairMissingKeysJob({
      accounts,
      isOpen,
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

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setOutcomeFilter(null)
      setActiveView(REPAIR_RESULT_VIEWS.AccountCoverage)
      resetInvalidKeyDeletionState()
    }
  }, [isOpen, resetInvalidKeyDeletionState])

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
            {progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running ? (
              <Badge
                variant="info"
                size="sm"
                className="shrink-0 border-transparent"
              >
                <Spinner size="sm" className="h-3.5 w-3.5" />
                {t("common:status.processing")}
              </Badge>
            ) : progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Failed ? (
              <Badge
                variant="danger"
                size="sm"
                className="shrink-0 border-transparent"
              >
                {t("common:status.failed")}
              </Badge>
            ) : progress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Completed ? (
              <Badge
                variant={progress.summary.failed > 0 ? "warning" : "success"}
                size="sm"
                className="shrink-0 border-transparent"
              >
                {progress.summary.failed > 0
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
        <p className="dark:text-dark-text-secondary text-xs text-gray-500">
          {t("repairMissingKeys.runningNote")}
        </p>
      }
    >
      {error ? <Alert variant="destructive" description={error} /> : null}

      {!progress || progress.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Idle ? (
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
          </CardContent>
          <CardFooter
            padding="sm"
            className="dark:bg-dark-bg-primary/40 justify-start bg-gray-50/80"
          >
            <Button
              type="button"
              onClick={() => void handleStartAudit()}
              disabled={isStarting}
              loading={isStarting}
              className="w-full sm:w-auto"
            >
              {t("repairMissingKeys.actions.start")}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {progress && progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Idle ? (
        <div className="space-y-4">
          <RepairMissingKeysProgressCard
            progress={progress}
            isStarting={isStarting}
            onStartAudit={() => void handleStartAudit()}
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
