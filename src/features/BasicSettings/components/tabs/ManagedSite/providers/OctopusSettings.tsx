import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { validateOctopusConfig } from "~/services/apiService/octopus/channels"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { PROTECTION_BYPASS_SURFACES } from "~/services/protectionBypass/contracts"

/**
 * Settings panel for configuring Octopus connection credentials (base URL, username, password).
 * @returns Section containing inputs and reset handling for the Octopus config.
 */
export default function OctopusSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    octopusBaseUrl,
    octopusUsername,
    octopusPassword,
    updateOctopusBaseUrl,
    updateOctopusUsername,
    updateOctopusPassword,
    resetOctopusConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: octopusBaseUrl,
      username: octopusUsername,
      password: octopusPassword,
    }),
    [octopusBaseUrl, octopusPassword, octopusUsername],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.octopus,
    defaults: DEFAULT_PREFERENCES.octopus,
    reset: resetOctopusConfig,
    fields: {
      baseUrl: {
        setting: t("octopus.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateOctopusBaseUrl(value, options),
      },
      username: {
        setting: t("octopus.fields.usernameLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateOctopusUsername(value, options),
      },
      password: {
        setting: t("octopus.fields.passwordLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateOctopusPassword(value, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)
  const localBaseUrl = localConfig.baseUrl
  const localUsername = localConfig.username
  const localPassword = localConfig.password

  const handleValidateConfig = async () => {
    const trimmedUrl = localBaseUrl.trim()
    const trimmedUsername = localUsername.trim()
    const trimmedPassword = localPassword.trim()

    if (!trimmedUrl || !trimmedUsername || !trimmedPassword) {
      toast.error(t("octopus.validation.missingFields"))
      return
    }

    setLocalConfig((prev) => ({
      ...prev,
      baseUrl: trimmedUrl,
      username: trimmedUsername,
      password: trimmedPassword,
    }))

    setIsValidating(true)
    try {
      const result = await validateOctopusConfig(
        {
          baseUrl: trimmedUrl,
          username: trimmedUsername,
          password: trimmedPassword,
        },
        PROTECTION_BYPASS_SURFACES.Options,
      )

      if (result.success) {
        toast.success(t("octopus.validation.success"))
      } else {
        toast.error(result.error || t("octopus.validation.failed"))
      }
    } catch {
      toast.error(t("octopus.validation.error"))
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={<ManagedSiteDeploymentLink siteType={SITE_TYPES.OCTOPUS} />}
      id="octopus"
      title={t("octopus.title")}
      description={t("octopus.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="octopus-base-url"
            title={t("octopus.fields.baseUrlLabel")}
            description={t("octopus.fields.baseUrlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    baseUrl: e.target.value,
                  }))
                }
                onBlur={(e) => commitField("baseUrl", e.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("octopus.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id="octopus-username"
            title={t("octopus.fields.usernameLabel")}
            description={t("octopus.fields.usernameDesc")}
            rightContent={
              <Input
                type="text"
                value={localUsername}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                onBlur={(e) => commitField("username", e.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("octopus.fields.usernamePlaceholder")}
              />
            }
          />

          <CardItem
            id="octopus-password"
            title={t("octopus.fields.passwordLabel")}
            description={t("octopus.fields.passwordDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("octopus.fields.showPassword"),
                    hide: t("octopus.fields.hidePassword"),
                  }}
                  value={localPassword}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  onBlur={(e) => commitField("password", e.target.value)}
                  onKeyDown={blurInputOnEnter}
                  placeholder={t("octopus.fields.passwordPlaceholder")}
                />
              </div>
            }
          />

          <CardItem
            id="octopus-validate-config"
            title={t("octopus.validation.title")}
            description={t("octopus.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("octopus.validation.validating")
                  : t("octopus.validation.validate")}
              </Button>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
