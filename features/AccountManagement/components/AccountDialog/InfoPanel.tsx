import { SparklesIcon, UsersIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

interface InfoPanelProps {
  mode: "add" | "edit"
  isDetected?: boolean
  showManualForm?: boolean
}

export default function InfoPanel({
  mode,
  isDetected,
  showManualForm
}: InfoPanelProps) {
  const { t } = useTranslation("accountDialog")
  const isAddMode = mode === "add"

  const getTitle = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmation")
      if (showManualForm) return t("infoPanel.manualAdd")
      return t("infoPanel.autoDetect")
    }
    return t("infoPanel.editInfo")
  }

  const getDescription = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmAddInfo")
      if (showManualForm) return t("infoPanel.manualInfo")
      return t("infoPanel.autoDetectInfo")
    }
    return (
      <>
        <p>{t("infoPanel.editInfoDesc")}</p>
        <p>{t("infoPanel.reDetectInfo")}</p>
      </>
    )
  }

  const Icon = isAddMode ? SparklesIcon : UsersIcon
  const iconColor = isAddMode ? "text-blue-400" : "text-green-400"
  const bgColor = isAddMode
    ? "bg-blue-50 dark:bg-blue-900/20"
    : "bg-green-50 dark:bg-green-900/20"
  const borderColor = isAddMode
    ? "border-blue-100 dark:border-blue-900/30"
    : "border-green-100 dark:border-green-900/30"
  const titleColor = isAddMode
    ? "text-blue-800 dark:text-blue-300"
    : "text-green-800 dark:text-green-300"
  const textColor = isAddMode
    ? "text-blue-700 dark:text-blue-400"
    : "text-green-700 dark:text-green-400"

  return (
    <div className="px-4 pb-4">
      <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
        <div className="flex">
          <div className="flex-shrink-0">
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="ml-3">
            <h3 className={`text-xs font-medium ${titleColor}`}>
              {getTitle()}
            </h3>
            <div className={`mt-1 text-xs ${textColor}`}>
              {typeof getDescription() === "string" ? (
                <p>{getDescription()}</p>
              ) : (
                getDescription()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
