import { Dialog } from "@headlessui/react"
import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

interface DialogHeaderProps {
  isEditMode: boolean
}

export function DialogHeader({ isEditMode }: DialogHeaderProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <KeyIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <Dialog.Title className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
          {isEditMode ? t("dialog.editToken") : t("dialog.addToken")}
        </Dialog.Title>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
