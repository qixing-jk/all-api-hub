import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { Modal } from "~/components/ui/Dialog/Modal"
import { accountStorage } from "~/services/accountStorage"
import type { DisplaySiteData } from "~/types"

import { AccountInfo } from "./AccountInfo"
import { ActionButtons } from "./ActionButtons"
import { DialogHeader } from "./DialogHeader"
import { WarningSection } from "./WarningSection"

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
  const { t } = useTranslation(["ui", "messages"])

  const handleDelete = async () => {
    if (!account) return

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
      console.error("删除账号失败:", error)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      header={<DialogHeader />}
      footer={<ActionButtons onClose={onClose} onDelete={handleDelete} />}
    >
      <div>
        <WarningSection accountName={account?.name} />
        {account && <AccountInfo account={account} />}
      </div>
    </Modal>
  )
}
