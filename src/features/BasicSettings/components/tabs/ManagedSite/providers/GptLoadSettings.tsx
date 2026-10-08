import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { validateGptLoadCredential } from "~/services/managedSites/providers/gptLoad"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"

/**
 * Configures one self-hosted gpt-load deployment.
 *
 * Accepts the gateway's root management key (`AUTH_KEY`), presented to the
 * control plane as a bearer token. The key is equivalent to every upstream
 * credential, so it is stored as a secret and validated with a single request
 * (the gateway locks a peer IP for 30 minutes after 5 failed attempts).
 */
export default function GptLoadSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    gptLoadBaseUrl,
    gptLoadManagementKey,
    updateGptLoadConfig,
    resetGptLoadConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({ baseUrl: gptLoadBaseUrl, managementKey: gptLoadManagementKey }),
    [gptLoadBaseUrl, gptLoadManagementKey],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.gptLoad,
    defaults: DEFAULT_PREFERENCES.gptLoad,
    reset: resetGptLoadConfig,
    fields: {
      managementKey: {
        setting: t("gptLoad.fields.managementKeyLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateGptLoadConfig({ managementKey: value }, options),
      },
      baseUrl: {
        setting: t("gptLoad.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateGptLoadConfig({ baseUrl: value }, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)

  const handleValidateConfig = async () => {
    const baseUrl = localConfig.baseUrl.trim()
    const managementKey = localConfig.managementKey.trim()
    if (!baseUrl || !managementKey) {
      toast.error(t("gptLoad.validation.missingFields"))
      return
    }

    setLocalConfig({ baseUrl, managementKey })
    setIsValidating(true)
    try {
      const result = await validateGptLoadCredential({
        baseUrl,
        credential: managementKey,
      })
      switch (result.status) {
        case "valid": {
          toast.success(t("gptLoad.validation.success"))
          return
        }
        case "insufficient-privilege":
          toast.error(
            t("gptLoad.validation.insufficientPrivilege", {
              error: result.message,
            }),
          )
          return
        case "invalid-credential":
          toast.error(
            t("gptLoad.validation.invalidCredential", {
              error: result.message,
            }),
          )
          return
        case "unreachable":
        default:
          toast.error(t("gptLoad.validation.failed", { error: result.message }))
      }
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={
        <ManagedSiteDeploymentLink siteType={SITE_TYPES.GPT_LOAD} />
      }
      id={SETTINGS_ANCHORS.GPT_LOAD}
      title={t("gptLoad.title")}
      description={t("gptLoad.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.GPT_LOAD_BASE_URL}
            title={t("gptLoad.fields.baseUrlLabel")}
            description={t("gptLoad.fields.baseUrlDesc")}
            rightContent={
              <Input
                type="url"
                value={localConfig.baseUrl}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("baseUrl", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("gptLoad.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY}
            title={t("gptLoad.fields.managementKeyLabel")}
            description={t("gptLoad.fields.managementKeyDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("gptLoad.fields.showManagementKey"),
                  hide: t("gptLoad.fields.hideManagementKey"),
                }}
                value={localConfig.managementKey}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    managementKey: event.target.value,
                  }))
                }
                onBlur={(event) =>
                  commitField("managementKey", event.target.value)
                }
                onKeyDown={blurInputOnEnter}
                placeholder={t("gptLoad.fields.managementKeyPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.GPT_LOAD_VALIDATE}
            title={t("gptLoad.validation.title")}
            description={t("gptLoad.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("gptLoad.validation.validating")
                  : t("gptLoad.validation.validate")}
              </Button>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
