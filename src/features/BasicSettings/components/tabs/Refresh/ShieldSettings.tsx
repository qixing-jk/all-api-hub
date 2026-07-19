import { StarIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ResponsiveButtonGroup,
  responsiveButtonGroupItemClassName,
} from "~/components/ResponsiveButtonGroup"
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
  WorkflowTransitionButton,
} from "~/components/ui"
import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  getProtectionBypassUiVariant,
  isProtectionBypassFirefoxEnv,
  ProtectionBypassUiVariants,
} from "~/utils/browser/protectionBypass"
import { canUseTempWindowFetch } from "~/utils/browser/tempWindowFetch"
import { openSettingsTab } from "~/utils/navigation"

/**
 * Settings section for shield/temp-window fallback controls and permissions.
 * Lets users toggle fallback contexts, refresh permissions, or open settings tab.
 */
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

  const isFirefoxEnv = isProtectionBypassFirefoxEnv()
  const protectionBypassUiVariant = getProtectionBypassUiVariant()

  const shieldDescription =
    protectionBypassUiVariant ===
    ProtectionBypassUiVariants.TempWindowWithCookieInterceptor
      ? t("refresh.shieldDescriptionWithCookieInterceptor")
      : t("refresh.shieldDescriptionTempWindowOnly")

  const shieldEnabledDescription =
    protectionBypassUiVariant ===
    ProtectionBypassUiVariants.TempWindowWithCookieInterceptor
      ? t("refresh.shieldEnabledDescWithCookieInterceptor")
      : t("refresh.shieldEnabledDescTempWindowOnly")

  const shieldEnabled = tempWindowFallback.enabled
  const shieldPopup = tempWindowFallback.useInPopup
  const shieldSidepanel = tempWindowFallback.useInSidePanel
  const shieldOptions = tempWindowFallback.useInOptions
  const shieldAutoRefresh = tempWindowFallback.useForAutoRefresh
  const shieldManualRefresh = tempWindowFallback.useForManualRefresh
  const shieldTempContextMode = tempWindowFallback.tempContextMode

  const disableShieldUI = !canUseTempWindowFallback
  const shieldMethodHint =
    shieldTempContextMode === TEMP_CONTEXT_MODES.Window
      ? t("refresh.shieldMethodHintWindow")
      : shieldTempContextMode === TEMP_CONTEXT_MODES.Composite
        ? t("refresh.shieldMethodHintComposite")
        : t("refresh.shieldMethodHintTab")

  const handleOpenPermissionsTab = useCallback(() => {
    void openSettingsTab("permissions", { preserveHistory: true })
  }, [])

  return (
    <SettingSection
      id="shield-settings"
      title={t("refresh.shieldTitle")}
      description={shieldDescription}
    >
      {!canUseTempWindowFallback && (
        <Alert
          variant="warning"
          title={t("refresh.shieldPermissionWarningTitle")}
          description={t("refresh.shieldPermissionWarningDesc")}
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <WorkflowTransitionButton
              size="sm"
              onClick={handleOpenPermissionsTab}
            >
              {t("refresh.shieldPermissionAction")}
            </WorkflowTransitionButton>
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
            id="shield-enabled"
            title={t("refresh.shieldEnabled")}
            description={shieldEnabledDescription}
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
            id="shield-method"
            title={t("refresh.shieldMethodTitle")}
            description={t("refresh.shieldMethodDesc")}
            rightContent={
              <div className="flex flex-col space-y-2 text-left">
                <ResponsiveButtonGroup
                  variant="plain"
                  aria-label={t("refresh.shieldMethodTitle")}
                >
                  <Button
                    size="sm"
                    variant={
                      shieldTempContextMode === TEMP_CONTEXT_MODES.Composite
                        ? "default"
                        : "outline"
                    }
                    disabled={
                      disableShieldUI ||
                      !shieldEnabled ||
                      (isFirefoxEnv && !canUseTempWindowFallback)
                    }
                    onClick={() =>
                      updateTempWindowFallback({
                        tempContextMode: TEMP_CONTEXT_MODES.Composite,
                      })
                    }
                    leftIcon={
                      <StarIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    }
                    className={responsiveButtonGroupItemClassName}
                  >
                    {t("refresh.shieldMethodComposite")}
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      shieldTempContextMode === TEMP_CONTEXT_MODES.Tab
                        ? "default"
                        : "outline"
                    }
                    disabled={disableShieldUI || !shieldEnabled}
                    onClick={() =>
                      updateTempWindowFallback({
                        tempContextMode: TEMP_CONTEXT_MODES.Tab,
                      })
                    }
                    className={responsiveButtonGroupItemClassName}
                  >
                    {t("refresh.shieldMethodTab")}
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      shieldTempContextMode === TEMP_CONTEXT_MODES.Window
                        ? "default"
                        : "outline"
                    }
                    disabled={
                      disableShieldUI ||
                      !shieldEnabled ||
                      (isFirefoxEnv && !canUseTempWindowFallback)
                    }
                    onClick={() =>
                      updateTempWindowFallback({
                        tempContextMode: TEMP_CONTEXT_MODES.Window,
                      })
                    }
                    className={responsiveButtonGroupItemClassName}
                  >
                    {t("refresh.shieldMethodWindow")}
                  </Button>
                </ResponsiveButtonGroup>
                <Muted>{shieldMethodHint}</Muted>
              </div>
            }
          />

          <CardItem
            id="shield-contexts"
            title={t("refresh.shieldContextsTitle")}
            description={t("refresh.shieldContextsDesc")}
            rightContent={
              <div className="flex flex-col space-y-2 text-left">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label
                    id="shield-popup"
                    className="flex items-center space-x-2"
                  >
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

                  <label
                    id="shield-sidepanel"
                    className="flex items-center space-x-2"
                  >
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

                  <label
                    id="shield-options"
                    className="flex items-center space-x-2"
                  >
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

                  <label
                    id="shield-auto-refresh"
                    className="flex items-center space-x-2"
                  >
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

                  <label
                    id="shield-manual-refresh"
                    className="flex items-center space-x-2"
                  >
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
