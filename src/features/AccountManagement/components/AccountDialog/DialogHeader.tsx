import { Pencil, Sparkles } from "lucide-react"
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
  const Icon = isAddMode ? Sparkles : Pencil

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Icon className="text-link h-5 w-5" />
        <h2 className="text-foreground text-lg font-semibold">{title}</h2>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
