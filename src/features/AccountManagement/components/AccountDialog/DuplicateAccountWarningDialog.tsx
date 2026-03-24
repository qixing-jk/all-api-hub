import { DialogTitle } from "@headlessui/react"
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"

export interface DuplicateAccountWarningDialogProps {
  isOpen: boolean
  siteUrl: string
  existingAccountsCount: number
  existingUsername?: string | null
  existingUserId?: string | number | null
  onCancel: () => void
  onContinue: () => void
}

/**
 * DuplicateAccountWarningDialog prompts users when they are about to add an
 * account for a site that already exists in storage (possible duplicate).
 */
export function DuplicateAccountWarningDialog({
  isOpen,
  siteUrl,
  existingAccountsCount,
  existingUsername,
  existingUserId,
  onCancel,
  onContinue,
}: DuplicateAccountWarningDialogProps) {
  const { t } = useTranslation(["accountDialog", "common"])

  const hasExactUserMatch =
    typeof existingUserId === "number" ||
    (typeof existingUserId === "string" && existingUserId.trim() !== "")

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
              {t("accountDialog:warnings.duplicateAccount.title")}
            </DialogTitle>
          </div>
        </div>
      }
      footer={
        <div className="flex space-x-3">
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
            className="flex-1"
          >
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onContinue}
            variant="warning"
            className="flex-1"
          >
            {t("accountDialog:warnings.duplicateAccount.actions.continue")}
          </Button>
        </div>
      }
    >
      <Alert
        variant="warning"
        title={t("accountDialog:warnings.duplicateAccount.warningTitle")}
        description={
          hasExactUserMatch
            ? t("accountDialog:warnings.duplicateAccount.descriptionExact", {
                siteUrl,
                userId: String(existingUserId ?? ""),
                username: existingUsername ?? "",
              })
            : t("accountDialog:warnings.duplicateAccount.description", {
                siteUrl,
                count: existingAccountsCount,
              })
        }
      />
    </Modal>
  )
}
