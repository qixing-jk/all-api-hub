import { KeyRound } from "lucide-react"
import { useTranslation } from "react-i18next"

interface DialogHeaderProps {
  isEditMode: boolean
}

/**
 * Displays the token dialog title and icon, toggling copy based on mode.
 * @param props Component props container.
 * @param props.isEditMode When true, shows edit label instead of add.
 */
export function DialogHeader({ isEditMode }: DialogHeaderProps) {
  const { t } = useTranslation("keyManagement")

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-2">
        <KeyRound className="text-theme-600 dark:text-theme-400 h-6 w-6" />
        <h2 className="text-foreground text-lg font-semibold">
          {isEditMode ? t("dialog.editToken") : t("dialog.addToken")}
        </h2>
      </div>
      {/* Modal provides close button */}
    </div>
  )
}
