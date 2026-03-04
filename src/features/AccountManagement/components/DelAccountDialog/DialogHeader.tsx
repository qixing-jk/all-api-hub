import { DialogTitle } from "@headlessui/react"
import { TrashIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

export const DialogHeader = () => {
  const { t } = useTranslation("ui")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <TrashIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
        <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
          {t("dialog.delete.title")}
        </DialogTitle>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
