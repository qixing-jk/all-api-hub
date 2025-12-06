import { DialogTitle } from "@headlessui/react"
import { PencilIcon, SparklesIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"

interface DialogHeaderProps {
  mode: DialogMode
}

/**
 * Dialog header with contextual icon/title depending on add vs edit mode.
 * @param props Component props describing the dialog mode.
 * @param props.mode Current dialog mode that drives icon/title selection.
 */
export default function DialogHeader({ mode }: DialogHeaderProps) {
  const { t } = useTranslation("accountDialog")
  const isAddMode = mode === DIALOG_MODES.ADD
  const title = isAddMode ? t("title.add") : t("title.edit")
  const Icon = isAddMode ? SparklesIcon : PencilIcon
  const iconBgClass = isAddMode
    ? "bg-linear-to-r from-blue-500 to-indigo-600"
    : "bg-linear-to-r from-green-500 to-emerald-600"

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div
          className={`h-8 w-8 ${iconBgClass} flex items-center justify-center rounded-lg`}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <DialogTitle className="dark:text-dark-text-primary text-lg font-semibold text-gray-900">
          {title}
        </DialogTitle>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
