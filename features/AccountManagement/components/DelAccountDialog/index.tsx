import { useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { DestructiveConfirmDialog } from "~/components/ui"
import { accountStorage } from "~/services/accountStorage"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/logger"

import { AccountInfo } from "./AccountInfo"

/**
 * Logger scoped to account deletion flows so unexpected failures can be inspected without leaking secrets.
 */
const logger = createLogger("DelAccountDialog")

interface DelAccountDialogProps {
  isOpen: boolean
  onClose: () => void
  account: DisplaySiteData | null
  onDeleted: () => void
}

/**
 * Confirmation dialog for deleting an account, combining warning copy and action buttons.
 */
export default function DelAccountDialog({
  isOpen,
  onClose,
  account,
  onDeleted,
}: DelAccountDialogProps) {
  const { t } = useTranslation(["ui", "messages", "common"])
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!account) return

    setIsDeleting(true)
    try {
      await toast.promise(accountStorage.deleteAccount(account.id), {
        loading: t("ui:dialog.delete.deleting", { name: account.name }),
        success: (isSuccess) => {
          if (!isSuccess) {
            throw new Error(t("ui:dialog.delete.noResponse"))
          }
          onDeleted()
          onClose()
          return t("ui:dialog.delete.deleteSuccess", { name: account.name })
        },
        error: (err: Error) =>
          t("ui:dialog.delete.deleteFailed", {
            error: err.message || t("messages:errors.unknown"),
          }),
      })
    } catch (error) {
      // toast.promise already handles showing the error toast
      logger.error("Failed to delete account", {
        error,
        accountId: account.id,
        accountName: account.name,
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      onClose()
    }
  }

  return (
    <DestructiveConfirmDialog
      isOpen={isOpen}
      onClose={handleClose}
      title={t("ui:dialog.delete.title")}
      warningTitle={t("ui:dialog.delete.confirmDeletion")}
      description={t("ui:dialog.delete.warning", {
        accountName: account?.name ?? "",
      })}
      cancelLabel={t("common:actions.cancel")}
      confirmLabel={t("ui:dialog.delete.confirmDelete")}
      onConfirm={() => {
        void handleDelete()
      }}
      isWorking={isDeleting}
      details={account ? <AccountInfo account={account} /> : null}
    />
  )
}
