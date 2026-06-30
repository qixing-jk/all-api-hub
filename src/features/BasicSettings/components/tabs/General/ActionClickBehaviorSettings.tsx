import { CursorArrowRaysIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type ToolbarActionClickBehavior,
} from "~/services/preferences/userPreferences"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Lets users choose what the toolbar icon does, while reflecting runtime
 * support and fallback messaging for unsupported side-panel devices.
 */
export default function ActionClickBehaviorSettings() {
  const { t } = useTranslation("settings")
  const { actionClickBehavior, updateActionClickBehavior } =
    useUserPreferencesContext()
  const sidePanelSupport = getSidePanelSupport()
  const sidePanelSupported = sidePanelSupport.supported

  const handleChange = async (behavior: ToolbarActionClickBehavior) => {
    if (behavior === actionClickBehavior) return
    const writeResult = await updateActionClickBehavior(behavior)
    if (!writeResult.ok) {
      showUpdateToast(writeResult, t("actionClick.title"))
      return
    }

    if (
      behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel &&
      !sidePanelSupported
    ) {
      showResultToast(true, t("actionClick.sidepanelFallbackToast"))
      return
    }

    showUpdateToast(writeResult, t("actionClick.title"))
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
            id="action-click-behavior"
            icon={
              <CursorArrowRaysIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            }
            title={t("actionClick.actionIconClickTitle")}
            description={
              sidePanelSupported
                ? t("actionClick.actionIconClickDesc")
                : t("actionClick.sidepanelUnsupportedHelper")
            }
            rightContent={
              <ResponsiveToggleGroup
                aria-label={t("actionClick.actionIconClickTitle")}
                value={actionClickBehavior}
                onValueChange={handleChange}
                options={[
                  {
                    value: TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
                    label: t("actionClick.popupLabel"),
                    ariaLabel: t("actionClick.popupTitle"),
                  },
                  {
                    value: TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel,
                    label: t("actionClick.sidepanelLabel"),
                    ariaLabel: t("actionClick.sidepanelTitle"),
                  },
                  {
                    value: TOOLBAR_ACTION_CLICK_BEHAVIORS.Options,
                    label: t("actionClick.optionsLabel"),
                    ariaLabel: t("actionClick.optionsTitle"),
                  },
                ]}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
