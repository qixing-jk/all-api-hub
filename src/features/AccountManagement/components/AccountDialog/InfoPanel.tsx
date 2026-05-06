import { SparklesIcon, UsersIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { LdohIcon } from "~/components/icons/LdohIcon"
import { Button } from "~/components/ui"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { LDOH_ORIGIN } from "~/services/integrations/ldohSiteLookup/constants"

import {
  ACCOUNT_DIALOG_FORM_SOURCES,
  ACCOUNT_DIALOG_PHASES,
  type AccountDialogFormSource,
  type AccountDialogPhase,
} from "./models"

interface InfoPanelProps {
  mode: DialogMode
  phase: AccountDialogPhase
  formSource: AccountDialogFormSource
}

/**
 * Side panel describing automatic detection status and next steps per mode.
 * @param props Component props indicating mode and detection state.
 * @param props.mode Dialog mode used to determine copy and icon visuals.
 * @param props.phase Current dialog phase determining whether the form is shown.
 * @param props.formSource Source that led the dialog into form mode.
 */
export default function InfoPanel({ mode, phase, formSource }: InfoPanelProps) {
  const { t } = useTranslation("accountDialog")
  const isAddMode = mode === DIALOG_MODES.ADD
  const isDetected = formSource === ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const isManualForm =
    phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM &&
    formSource !== ACCOUNT_DIALOG_FORM_SOURCES.DETECTED
  const showLdohSiteListLink =
    isAddMode && phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT

  const handleOpenLdohSiteList = () => {
    browser.tabs.create({ url: LDOH_ORIGIN, active: true })
  }

  const getTitle = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmation")
      if (isManualForm) return t("infoPanel.manualAdd")
      return t("infoPanel.autoDetect")
    }
    return t("infoPanel.editInfo")
  }

  const getDescription = () => {
    if (isAddMode) {
      if (isDetected) return t("infoPanel.confirmAddInfo")
      if (isManualForm) return t("infoPanel.manualInfo")
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
    <div className={`${bgColor} border ${borderColor} rounded-lg p-3`}>
      <div className="flex">
        <div className="shrink-0">
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="ml-3">
          <h3 className={`text-xs font-medium ${titleColor}`}>{getTitle()}</h3>
          <div className={`mt-1 text-xs ${textColor}`}>
            {typeof getDescription() === "string" ? (
              <p>{getDescription()}</p>
            ) : (
              getDescription()
            )}

            {showLdohSiteListLink && (
              <div className={`${borderColor} mt-2 border-t pt-2`}>
                <p className="mb-1">{t("infoPanel.ldohSiteListHint")}</p>
                <Button
                  type="button"
                  onClick={handleOpenLdohSiteList}
                  variant="link"
                  size="sm"
                  className="h-auto justify-start p-0 text-left"
                  leftIcon={
                    <span aria-hidden="true">
                      <LdohIcon size="sm" />
                    </span>
                  }
                >
                  {t("infoPanel.openLdohSiteList")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
