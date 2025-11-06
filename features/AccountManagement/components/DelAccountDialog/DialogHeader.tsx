import { DialogTitle } from "@headlessui/react"
import { TrashIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

export const DialogHeader = () => {
  const { t } = useTranslation("ui")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-red-500 to-pink-600">
          <TrashIcon className="h-4 w-4 text-white" />
        </div>
        <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
          {t("dialog.delete.title")}
        </DialogTitle>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
