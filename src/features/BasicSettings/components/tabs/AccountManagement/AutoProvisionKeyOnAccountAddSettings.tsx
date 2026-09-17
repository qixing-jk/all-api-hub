import { KeyRound } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { BASIC_SETTINGS_TEST_IDS } from "~/features/BasicSettings/testIds"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  ACCOUNT_KEY_AUTO_PROVISION_MODES,
  type AccountKeyAutoProvisionMode,
} from "~/types/accountKeyAutoProvisioning"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

/**
 * Controls automatic key creation and its group scope after adding an account.
 */
export default function AutoProvisionKeyOnAccountAddSettings() {
  const { t } = useTranslation("settings")
  const {
    autoProvisionKeyOnAccountAdd,
    autoProvisionKeyOnAccountAddMode,
    updateAutoProvisionKeyOnAccountAdd,
    updateAutoProvisionKeyOnAccountAddMode,
    isLoading,
    loadPreferences,
  } = useUserPreferencesContext()
  const [isSaving, setIsSaving] = useState(false)

  const handleToggle = async (enabled: boolean) => {
    setIsSaving(true)
    try {
      const writeResult = await updateAutoProvisionKeyOnAccountAdd(enabled)
      showUpdateToast(
        writeResult,
        t("autoProvisionKeyOnAccountAdd.toggleLabel"),
      )
    } finally {
      setIsSaving(false)
    }
  }

  /** Persists the creation scope without changing whether provisioning is enabled. */
  const handleModeChange = async (mode: AccountKeyAutoProvisionMode) => {
    if (mode === autoProvisionKeyOnAccountAddMode) return
    setIsSaving(true)
    try {
      const writeResult = await updateAutoProvisionKeyOnAccountAddMode(mode)
      showUpdateToast(writeResult, t("autoProvisionKeyOnAccountAdd.modeLabel"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SettingSection
      resetRequiresConfirmation={false}
      resetDisabled={
        isLoading ||
        isSaving ||
        (autoProvisionKeyOnAccountAdd ===
          DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd &&
          autoProvisionKeyOnAccountAddMode ===
            DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAddMode)
      }
      onReset={async () => {
        const result = await userPreferences.savePreferencesWithResult({
          autoProvisionKeyOnAccountAdd:
            DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd,
          autoProvisionKeyOnAccountAddMode:
            DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAddMode,
        })
        if (result.ok) await loadPreferences()
        return result
      }}
      id={SETTINGS_ANCHORS.AUTO_PROVISION_KEY}
      title={t("autoProvisionKeyOnAccountAdd.title")}
      description={t("autoProvisionKeyOnAccountAdd.description")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.AUTO_PROVISION_KEY_ENABLED}
            icon={<KeyRound className="text-link h-5 w-5" />}
            title={t("autoProvisionKeyOnAccountAdd.toggleLabel")}
            description={t("autoProvisionKeyOnAccountAdd.toggleDesc")}
            rightContent={
              <Switch
                aria-label={t("autoProvisionKeyOnAccountAdd.toggleLabel")}
                checked={autoProvisionKeyOnAccountAdd}
                onChange={handleToggle}
                disabled={isLoading || isSaving}
                data-testid={
                  BASIC_SETTINGS_TEST_IDS.autoProvisionKeyEnabledSwitch
                }
              />
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.AUTO_PROVISION_KEY_MODE}
            title={t("autoProvisionKeyOnAccountAdd.modeLabel")}
            description={t("autoProvisionKeyOnAccountAdd.modeDescription")}
            rightContent={
              <SegmentedControl
                aria-label={t("autoProvisionKeyOnAccountAdd.modeLabel")}
                value={autoProvisionKeyOnAccountAddMode}
                onValueChange={handleModeChange}
                options={[
                  {
                    value: ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
                    label: t("autoProvisionKeyOnAccountAdd.modes.default"),
                    disabled: isLoading || isSaving,
                  },
                  {
                    value: ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups,
                    label: t("autoProvisionKeyOnAccountAdd.modes.allGroups"),
                    disabled: isLoading || isSaving,
                    testId:
                      BASIC_SETTINGS_TEST_IDS.autoProvisionKeyAllGroupsButton,
                  },
                ]}
              />
            }
          />
        </CardList>
      </Card>
      <p className="text-muted-foreground text-sm">
        {t("autoProvisionKeyOnAccountAdd.manualHint", {
          actionLabel: t("keyManagement:repairMissingKeys.action"),
        })}
      </p>
    </SettingSection>
  )
}
