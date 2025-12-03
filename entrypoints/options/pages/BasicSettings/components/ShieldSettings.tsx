import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Alert,
  BodySmall,
  Button,
  Card,
  CardItem,
  CardList,
  Checkbox,
  Muted,
  Switch,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { isFirefox } from "~/utils/browser"
import { openSettingsTab } from "~/utils/navigation"
import { canUseTempWindowFetch } from "~/utils/tempWindowFetch"

export default function ShieldSettings() {
  const { t } = useTranslation("settings")
  const { tempWindowFallback, updateTempWindowFallback } =
    useUserPreferencesContext()

  const [canUseTempWindowFallback, setCanUseTempWindowFallback] =
    useState<boolean>(false)

  const refreshPermissionStatus = useCallback(async () => {
    const granted = await canUseTempWindowFetch()
    setCanUseTempWindowFallback(granted)
  }, [])

  useEffect(() => {
    void refreshPermissionStatus()
  }, [refreshPermissionStatus])

  const isFirefoxEnv = isFirefox()

  const shieldEnabled = tempWindowFallback.enabled
  const shieldPopup = tempWindowFallback.useInPopup
  const shieldSidepanel = tempWindowFallback.useInSidePanel
  const shieldOptions = tempWindowFallback.useInOptions
  const shieldAutoRefresh = tempWindowFallback.useForAutoRefresh
  const shieldManualRefresh = tempWindowFallback.useForManualRefresh

  const disableShieldUI = !canUseTempWindowFallback

  const handleOpenPermissionsTab = useCallback(() => {
    void openSettingsTab("permissions")
  }, [])

  return (
    <SettingSection
      id="shield-settings"
      title={t("refresh.shieldTitle")}
      description={t("refresh.shieldDescription")}
    >
      {!canUseTempWindowFallback && (
        <Alert
          variant="warning"
          title={t("refresh.shieldPermissionWarningTitle")}
          description={t("refresh.shieldPermissionWarningDesc")}
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleOpenPermissionsTab}>
              {t("refresh.shieldPermissionAction")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshPermissionStatus()}
            >
              {t("permissions.actions.refresh")}
            </Button>
          </div>
        </Alert>
      )}

      <Card padding="none">
        <CardList>
          <CardItem
            title={t("refresh.shieldEnabled")}
            description={t("refresh.shieldEnabledDesc")}
            rightContent={
              <Switch
                checked={shieldEnabled}
                disabled={disableShieldUI}
                onChange={(value) =>
                  updateTempWindowFallback({ enabled: value })
                }
              />
            }
          />

          <CardItem
            title={t("refresh.shieldContextsTitle")}
            description={t("refresh.shieldContextsDesc")}
            rightContent={
              <div className="flex flex-col space-y-2 text-left">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={shieldPopup}
                      disabled={
                        disableShieldUI || !shieldEnabled || isFirefoxEnv
                      }
                      onCheckedChange={(checked) =>
                        updateTempWindowFallback({
                          useInPopup: Boolean(checked),
                        })
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {t("refresh.shieldPopup")}
                    </BodySmall>
                  </label>

                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={shieldSidepanel}
                      disabled={disableShieldUI || !shieldEnabled}
                      onCheckedChange={(checked) =>
                        updateTempWindowFallback({
                          useInSidePanel: Boolean(checked),
                        })
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {t("refresh.shieldSidepanel")}
                    </BodySmall>
                  </label>

                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={shieldOptions}
                      disabled={disableShieldUI || !shieldEnabled}
                      onCheckedChange={(checked) =>
                        updateTempWindowFallback({
                          useInOptions: Boolean(checked),
                        })
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {t("refresh.shieldOptions")}
                    </BodySmall>
                  </label>

                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={shieldAutoRefresh}
                      disabled={disableShieldUI || !shieldEnabled}
                      onCheckedChange={(checked) =>
                        updateTempWindowFallback({
                          useForAutoRefresh: Boolean(checked),
                        })
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {t("refresh.shieldAutoRefresh")}
                    </BodySmall>
                  </label>

                  <label className="flex items-center space-x-2">
                    <Checkbox
                      checked={shieldManualRefresh}
                      disabled={disableShieldUI || !shieldEnabled}
                      onCheckedChange={(checked) =>
                        updateTempWindowFallback({
                          useForManualRefresh: Boolean(checked),
                        })
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {t("refresh.shieldManualRefresh")}
                    </BodySmall>
                  </label>
                </div>

                {isFirefoxEnv && (
                  <Muted className="mt-1">
                    {t("refresh.shieldPopupFirefoxNote")}
                  </Muted>
                )}
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
