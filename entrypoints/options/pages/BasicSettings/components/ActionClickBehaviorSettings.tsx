import { CursorArrowRaysIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, ToggleButton } from "~/components/ui"
import { COLORS } from "~/constants/designTokens"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { getSidePanelSupport } from "~/utils/browserApi"
import { showResultToast, showUpdateToast } from "~/utils/toastHelpers"

/**
 * Lets users choose what the toolbar icon does (popup vs side panel).
 */
export default function ActionClickBehaviorSettings() {
  const { t } = useTranslation("settings")
  const { actionClickBehavior, updateActionClickBehavior } =
    useUserPreferencesContext()
  const sidePanelSupported = getSidePanelSupport().supported

  const handleChange = async (behavior: "popup" | "sidepanel") => {
    if (behavior === actionClickBehavior) return
    const success = await updateActionClickBehavior(behavior)
    if (!success) {
      showUpdateToast(false, t("actionClick.title"))
      return
    }

    if (behavior === "sidepanel" && !sidePanelSupported) {
      showResultToast(true, t("actionClick.sidepanelFallbackToast"))
      return
    }

    showUpdateToast(true, t("actionClick.title"))
  }

  return (
    <SettingSection
      id="action-click"
      title={t("actionClick.title")}
      description={t("actionClick.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <CursorArrowRaysIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            }
            title={t("actionClick.actionIconClickTitle")}
            description={t("actionClick.actionIconClickDesc")}
            leftContent={
              !sidePanelSupported ? (
                <div className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
                  {t("actionClick.sidepanelUnsupportedHelper")}
                </div>
              ) : null
            }
            rightContent={
              <div
                className={`${COLORS.background.tertiary} flex flex-col rounded-lg p-1 shadow-sm sm:flex-row`}
              >
                <ToggleButton
                  onClick={() => handleChange("popup")}
                  isActive={actionClickBehavior === "popup"}
                  size="default"
                  aria-label={t("actionClick.popupTitle")}
                >
                  {t("actionClick.popupLabel")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleChange("sidepanel")}
                  isActive={actionClickBehavior === "sidepanel"}
                  size="default"
                  aria-label={t("actionClick.sidepanelTitle")}
                >
                  {t("actionClick.sidepanelLabel")}
                </ToggleButton>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
