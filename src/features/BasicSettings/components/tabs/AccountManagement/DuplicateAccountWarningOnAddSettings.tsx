import { TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

/**
 * Settings section controlling whether All API Hub prompts for confirmation
 * when adding an account whose site URL already exists (possible duplicate).
 */
export default function DuplicateAccountWarningOnAddSettings() {
  const { t } = useTranslation("settings")
  const { warnOnDuplicateAccountAdd, updateWarnOnDuplicateAccountAdd } =
    useUserPreferencesContext()

  const handleToggle = async (enabled: boolean) => {
    const writeResult = await updateWarnOnDuplicateAccountAdd(enabled)
    showUpdateToast(writeResult, t("duplicateAccountWarningOnAdd.toggleLabel"))
  }

  return (
    <SettingSection
      onReset={() =>
        updateWarnOnDuplicateAccountAdd(
          DEFAULT_PREFERENCES.warnOnDuplicateAccountAdd!,
        )
      }
      resetDisabled={
        warnOnDuplicateAccountAdd ===
        DEFAULT_PREFERENCES.warnOnDuplicateAccountAdd
      }
      resetRequiresConfirmation={false}
      id="duplicate-account-warning-on-add"
      title={t("duplicateAccountWarningOnAdd.title")}
      description={t("duplicateAccountWarningOnAdd.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="duplicate-account-warning-toggle"
            icon={<TriangleAlert className="text-warning-text h-5 w-5" />}
            title={t("duplicateAccountWarningOnAdd.toggleLabel")}
            description={t("duplicateAccountWarningOnAdd.toggleDesc")}
            rightContent={
              <Switch
                checked={warnOnDuplicateAccountAdd}
                onChange={handleToggle}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
