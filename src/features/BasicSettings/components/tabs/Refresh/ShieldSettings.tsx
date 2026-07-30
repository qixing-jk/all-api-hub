import { StarIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useRef, useState } from "react"
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
import { SHIELD_SETTINGS_TARGET_IDS } from "~/features/BasicSettings/components/tabs/Refresh/searchTargets"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"
import {
  getProtectionBypassUiVariant,
  ProtectionBypassUiVariants,
} from "~/utils/browser/protectionBypass"
import { canUseTempWindowFetch } from "~/utils/browser/tempWindowFetch"
import { openSettingsTab } from "~/utils/navigation"

/** Compares complete automatic-feature preference maps. */
function hasSameAutomaticFeatureBypass(
  left: Record<ProtectionBypassAutomaticFeature, boolean>,
  right: Record<ProtectionBypassAutomaticFeature, boolean>,
) {
  return Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES).every(
    (feature) => left[feature] === right[feature],
  )
}

/** Renders the automatic temporary-page verification preferences. */
export default function ShieldSettings() {
  const { t } = useTranslation("settings")
  const { tempWindowFallback, updateTempWindowFallback } =
    useUserPreferencesContext()
  const [canUseTempWindowFallback, setCanUseTempWindowFallback] =
    useState(false)
  const refreshPermissionStatus = useCallback(async () => {
    setCanUseTempWindowFallback(await canUseTempWindowFetch())
  }, [])

  useEffect(() => {
    void refreshPermissionStatus()
  }, [refreshPermissionStatus])

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
  const normalizedPreferences =
    normalizeTempWindowFallbackPreferences(tempWindowFallback)
  const externalAutomaticFeatureBypass =
    normalizedPreferences.automaticFeatureBypass
  const latestAutomaticFeatureBypassRef = useRef(externalAutomaticFeatureBypass)
  const pendingAutomaticFeatureBypassRef = useRef<
    Record<ProtectionBypassAutomaticFeature, boolean> | undefined
  >(undefined)
  const externalAutomaticFeatureBypassRef = useRef(
    externalAutomaticFeatureBypass,
  )
  const [automaticFeatureBypass, setAutomaticFeatureBypass] = useState(
    externalAutomaticFeatureBypass,
  )
  externalAutomaticFeatureBypassRef.current = externalAutomaticFeatureBypass

  useEffect(() => {
    const pendingAutomaticFeatureBypass =
      pendingAutomaticFeatureBypassRef.current
    if (pendingAutomaticFeatureBypass) {
      if (
        !hasSameAutomaticFeatureBypass(
          pendingAutomaticFeatureBypass,
          externalAutomaticFeatureBypass,
        )
      ) {
        return
      }
      pendingAutomaticFeatureBypassRef.current = undefined
    }

    if (
      !hasSameAutomaticFeatureBypass(
        latestAutomaticFeatureBypassRef.current,
        externalAutomaticFeatureBypass,
      )
    ) {
      latestAutomaticFeatureBypassRef.current = externalAutomaticFeatureBypass
      setAutomaticFeatureBypass(externalAutomaticFeatureBypass)
    }
  }, [externalAutomaticFeatureBypass])

  const updateAutomaticFeatureBypass = useCallback(
    (feature: ProtectionBypassAutomaticFeature, checked: boolean) => {
      const nextAutomaticFeatureBypass = {
        ...latestAutomaticFeatureBypassRef.current,
        [feature]: checked,
      }
      latestAutomaticFeatureBypassRef.current = nextAutomaticFeatureBypass
      pendingAutomaticFeatureBypassRef.current = nextAutomaticFeatureBypass
      setAutomaticFeatureBypass(nextAutomaticFeatureBypass)

      const restoreExternalAutomaticFeatureBypass = () => {
        if (
          pendingAutomaticFeatureBypassRef.current !==
          nextAutomaticFeatureBypass
        ) {
          return
        }

        pendingAutomaticFeatureBypassRef.current = undefined
        latestAutomaticFeatureBypassRef.current =
          externalAutomaticFeatureBypassRef.current
        setAutomaticFeatureBypass(externalAutomaticFeatureBypassRef.current)
      }

      void updateTempWindowFallback({
        automaticFeatureBypass: nextAutomaticFeatureBypass,
      })
        .then((result) => {
          if (!result.ok) restoreExternalAutomaticFeatureBypass()
        })
        .catch(restoreExternalAutomaticFeatureBypass)
    },
    [updateTempWindowFallback],
  )

  const mode = normalizedPreferences.tempContextMode
  const methodHint =
    mode === TEMP_CONTEXT_MODES.Window
      ? t("refresh.shieldMethodHintWindow")
      : mode === TEMP_CONTEXT_MODES.Tab
        ? t("refresh.shieldMethodHintTab")
        : t("refresh.shieldMethodHintComposite")
  const automaticFeatures = [
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
      t("refresh.shieldAutomaticFeatureAccountRefresh"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.BalanceHistory,
      t("refresh.shieldAutomaticFeatureBalanceHistory"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.Checkin,
      t("refresh.shieldAutomaticFeatureCheckin"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.RedemptionAssist,
      t("refresh.shieldAutomaticFeatureRedemptionAssist"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.LdohSiteLookup,
      t("refresh.shieldAutomaticFeatureLdohSiteLookup"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.KeyManagement,
      t("refresh.shieldAutomaticFeatureKeyManagement"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteChannels,
      t("refresh.shieldAutomaticFeatureManagedSiteChannels"),
    ],
    [
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.ManagedSiteModelSync,
      t("refresh.shieldAutomaticFeatureManagedSiteModelSync"),
    ],
  ] as const satisfies readonly (readonly [
    ProtectionBypassAutomaticFeature,
    string,
  ])[]

  return (
    <SettingSection
      id={SHIELD_SETTINGS_TARGET_IDS.root}
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
              onClick={() =>
                void openSettingsTab("permissions", { preserveHistory: true })
              }
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
            id={SHIELD_SETTINGS_TARGET_IDS.enabled}
            title={t("refresh.shieldEnabled")}
            description={shieldEnabledDescription}
            rightContent={
              <Switch
                checked={normalizedPreferences.enabled}
                onChange={(enabled) => updateTempWindowFallback({ enabled })}
              />
            }
          />
          <CardItem
            id={SHIELD_SETTINGS_TARGET_IDS.method}
            title={t("refresh.shieldMethodTitle")}
            description={t("refresh.shieldMethodDesc")}
            rightContent={
              <div className="flex flex-col space-y-2 text-left">
                <ResponsiveButtonGroup
                  variant="plain"
                  aria-label={t("refresh.shieldMethodTitle")}
                >
                  {(
                    [
                      [
                        TEMP_CONTEXT_MODES.Composite,
                        t("refresh.shieldMethodComposite"),
                      ],
                      [TEMP_CONTEXT_MODES.Tab, t("refresh.shieldMethodTab")],
                      [
                        TEMP_CONTEXT_MODES.Window,
                        t("refresh.shieldMethodWindow"),
                      ],
                    ] as const
                  ).map(([nextMode, label]) => (
                    <Button
                      key={nextMode}
                      size="sm"
                      variant={mode === nextMode ? "default" : "outline"}
                      onClick={() =>
                        updateTempWindowFallback({ tempContextMode: nextMode })
                      }
                      className={responsiveButtonGroupItemClassName}
                      leftIcon={
                        nextMode === TEMP_CONTEXT_MODES.Composite ? (
                          <StarIcon className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                        ) : undefined
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </ResponsiveButtonGroup>
                <Muted>{methodHint}</Muted>
              </div>
            }
          />
          <CardItem
            id={SHIELD_SETTINGS_TARGET_IDS.automaticFeatures}
            title={t("refresh.shieldAutomaticFeaturesTitle")}
            description={t("refresh.shieldAutomaticFeaturesDesc")}
            rightContent={
              <div className="grid grid-cols-1 gap-2 text-left md:grid-cols-2">
                {automaticFeatures.map(([feature, label]) => (
                  <label
                    id={SHIELD_SETTINGS_TARGET_IDS.feature[feature]}
                    key={feature}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      checked={automaticFeatureBypass[feature]}
                      onCheckedChange={(checked) =>
                        updateAutomaticFeatureBypass(feature, Boolean(checked))
                      }
                    />
                    <BodySmall className="dark:text-dark-text-secondary text-gray-700">
                      {label}
                    </BodySmall>
                  </label>
                ))}
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
