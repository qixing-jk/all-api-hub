import { DialogTitle } from "@headlessui/react"
import { Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Button, DestructiveConfirmDialog, Modal } from "~/components/ui"
import {
  scanDuplicateAccounts,
  type AccountDedupeKeepStrategy,
} from "~/services/accounts/accountDedupe"
import { accountStorage } from "~/services/accounts/accountStorage"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import type { SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { getErrorMessage } from "~/utils/error"

import { useAccountDataContext } from "../../hooks/AccountDataContext"
import { DedupeAccountsConfirmDetails } from "./DedupeAccountsConfirmDetails"
import { DedupeAccountsDialogBody } from "./DedupeAccountsDialogBody"
import type {
  DedupeAccountsDialogGroup,
  DedupeAccountsKeepChangeInput,
} from "./types"

interface DedupeAccountsDialogProps {
  isOpen: boolean
  onClose: () => void
}

const EMPTY_ACCOUNTS: SiteAccount[] = []
const EMPTY_STRING_LIST: string[] = []
const NOOP_ASYNC = async () => {}
const EMPTY_KEEP_OVERRIDES: Record<string, string> = {}
const EMPTY_DETAILS_OPEN_BY_ACCOUNT_ID: Record<string, true> = {}

const logger = createLogger("DedupeAccountsDialog")

/**
 * Scan for duplicate accounts and provide a previewed, one-click cleanup flow.
 */
export default function DedupeAccountsDialog({
  isOpen,
  onClose,
}: DedupeAccountsDialogProps) {
  const { t } = useTranslation(["ui", "account", "common", "messages"])
  const accountData = useAccountDataContext()
  const accounts = accountData.accounts ?? EMPTY_ACCOUNTS
  const pinnedAccountIds = accountData.pinnedAccountIds ?? EMPTY_STRING_LIST
  const orderedAccountIds = accountData.orderedAccountIds ?? EMPTY_STRING_LIST
  const loadAccountData = accountData.loadAccountData ?? NOOP_ASYNC
  const orderedIndexByAccountId = useMemo(() => {
    const map = new Map<string, number>()
    orderedAccountIds.forEach((id, index) => {
      map.set(id, index)
    })
    return map
  }, [orderedAccountIds])

  const [strategy, setStrategy] =
    useState<AccountDedupeKeepStrategy>("keepPinned")
  const [keepOverridesByGroupId, setKeepOverridesByGroupId] =
    useState<Record<string, string>>(EMPTY_KEEP_OVERRIDES)
  const [detailsOpenByAccountId, setDetailsOpenByAccountId] = useState<
    Record<string, true>
  >(EMPTY_DETAILS_OPEN_BY_ACCOUNT_ID)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)

  const scan = useMemo(
    () =>
      scanDuplicateAccounts({
        accounts,
        pinnedAccountIds,
        strategy,
      }),
    [accounts, pinnedAccountIds, strategy],
  )

  const scanGroups = scan.groups

  const groups = useMemo<DedupeAccountsDialogGroup[]>(() => {
    return scanGroups.map((group) => {
      const groupId = `${group.key.origin}::${group.key.userId}`
      const recommendedKeepAccountId = group.keepAccountId
      const manualKeepAccountId = keepOverridesByGroupId[groupId]
      const resolvedManualKeepAccountId =
        manualKeepAccountId &&
        group.accounts.some((account) => account.id === manualKeepAccountId)
          ? manualKeepAccountId
          : undefined
      const keepAccountId =
        resolvedManualKeepAccountId ?? recommendedKeepAccountId
      const hasManualOverride = keepAccountId !== recommendedKeepAccountId

      return {
        ...group,
        groupId,
        keepAccountId,
        deleteAccountIds: group.accounts
          .filter((account) => account.id !== keepAccountId)
          .map((account) => account.id),
        recommendedKeepAccountId,
        hasManualOverride,
      }
    })
  }, [keepOverridesByGroupId, scanGroups])

  const handleKeepChange = (input: DedupeAccountsKeepChangeInput) => {
    setKeepOverridesByGroupId((prev) => {
      const existing = prev[input.groupId]

      if (input.selectedAccountId === input.recommendedAccountId) {
        if (!existing) return prev
        const next = { ...prev }
        delete next[input.groupId]
        return next
      }

      if (existing === input.selectedAccountId) return prev
      return { ...prev, [input.groupId]: input.selectedAccountId }
    })
  }

  const idsToDelete = useMemo(
    () =>
      Array.from(new Set(groups.flatMap((group) => group.deleteAccountIds))),
    [groups],
  )

  const pinnedToDeleteCount = useMemo(() => {
    if (pinnedAccountIds.length === 0 || idsToDelete.length === 0) return 0
    const pinned = new Set(pinnedAccountIds)
    return idsToDelete.filter((id) => pinned.has(id)).length
  }, [idsToDelete, pinnedAccountIds])

  const orderedToDeleteCount = useMemo(() => {
    if (orderedAccountIds.length === 0 || idsToDelete.length === 0) return 0
    const ordered = new Set(orderedAccountIds)
    return idsToDelete.filter((id) => ordered.has(id)).length
  }, [idsToDelete, orderedAccountIds])

  const handleClose = () => {
    if (isWorking) return
    setIsConfirmOpen(false)
    setDetailsOpenByAccountId(EMPTY_DETAILS_OPEN_BY_ACCOUNT_ID)
    onClose()
  }

  const toggleAccountDetails = (accountId: string) => {
    setDetailsOpenByAccountId((prev) => {
      if (prev[accountId]) {
        const next = { ...prev }
        delete next[accountId]
        return next
      }

      return { ...prev, [accountId]: true }
    })
  }

  const handleConfirmDelete = async () => {
    if (idsToDelete.length === 0) return

    setIsWorking(true)
    try {
      const { deletedCount } = await toast.promise(
        accountStorage.deleteAccounts(idsToDelete),
        {
          loading: t("ui:dialog.dedupeAccounts.deleting"),
          success: (result) =>
            t("messages:toast.success.duplicateCleanupSuccess", {
              count: result.deletedCount,
              groups: groups.length,
            }),
          error: (error) =>
            t("messages:toast.error.duplicateCleanupFailed", {
              error: getErrorMessage(error) || t("messages:errors.unknown"),
            }),
        },
      )

      void autoCheckinStorage
        .pruneStatusForDeletedAccounts(idsToDelete)
        .catch((error) => {
          logger.error("pruneStatusForDeletedAccounts failed", {
            error,
            idsToDelete,
          })
        })
      await loadAccountData()

      setIsConfirmOpen(false)
      if (deletedCount > 0) {
        onClose()
      }
    } catch {
      // toast.promise handles the error toast
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        closeOnBackdropClick={!isWorking}
        closeOnEsc={!isWorking}
        showCloseButton={!isWorking}
        size="lg"
        header={
          <div className="flex min-w-0 flex-col gap-1 pr-8">
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
              <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
                {t("ui:dialog.dedupeAccounts.title")}
              </DialogTitle>
            </div>
            <p className="dark:text-dark-text-secondary text-sm text-gray-500">
              {t("ui:dialog.dedupeAccounts.description")}
            </p>
          </div>
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isWorking}
            >
              {t("common:actions.close")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
              disabled={isWorking || idsToDelete.length === 0}
            >
              {t("ui:dialog.dedupeAccounts.previewDelete")}
            </Button>
          </div>
        }
      >
        <DedupeAccountsDialogBody
          strategy={strategy}
          onStrategyChange={setStrategy}
          groups={groups}
          deleteCount={idsToDelete.length}
          pinnedAccountIds={pinnedAccountIds}
          orderedIndexByAccountId={orderedIndexByAccountId}
          detailsOpenByAccountId={detailsOpenByAccountId}
          onKeepChange={handleKeepChange}
          onToggleDetails={toggleAccountDetails}
          unscannableCount={scan.unscannable.length}
          isWorking={isWorking}
          t={t}
        />
      </Modal>

      <DestructiveConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => {
          if (!isWorking) setIsConfirmOpen(false)
        }}
        title={t("ui:dialog.dedupeAccounts.confirm.title")}
        description={t("ui:dialog.dedupeAccounts.confirm.description", {
          deleteCount: idsToDelete.length,
          groups: groups.length,
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("ui:dialog.dedupeAccounts.confirm.confirmDelete")}
        onConfirm={() => void handleConfirmDelete()}
        isWorking={isWorking}
        size="lg"
        details={
          <DedupeAccountsConfirmDetails
            groups={groups}
            pinnedToDeleteCount={pinnedToDeleteCount}
            orderedToDeleteCount={orderedToDeleteCount}
            t={t}
          />
        }
      />
    </>
  )
}
