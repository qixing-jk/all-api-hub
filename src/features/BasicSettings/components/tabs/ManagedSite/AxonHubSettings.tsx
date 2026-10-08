import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { signIn } from "~/services/apiService/axonHub/authSession"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { getErrorMessage } from "~/utils/core/error"

import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "./managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "./useManagedSiteConfigDraft"

const isLikelyCorsSetupError = (message: string) =>
  /cors|failed to fetch|network|http 403|forbidden/i.test(message)

/**
 * Render AxonHub managed-site settings and connection validation controls.
 */
export default function AxonHubSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    axonHubBaseUrl,
    axonHubEmail,
    axonHubPassword,
    updateAxonHubBaseUrl,
    updateAxonHubEmail,
    updateAxonHubPassword,
    resetAxonHubConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: axonHubBaseUrl,
      email: axonHubEmail,
      password: axonHubPassword,
    }),
    [axonHubBaseUrl, axonHubEmail, axonHubPassword],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.axonHub,
    defaults: DEFAULT_PREFERENCES.axonHub,
    reset: resetAxonHubConfig,
    fields: {
      baseUrl: {
        setting: t("axonHub.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateAxonHubBaseUrl(value, options),
      },
      email: {
        setting: t("axonHub.fields.emailLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateAxonHubEmail(value, options),
      },
      password: {
        setting: t("axonHub.fields.passwordLabel"),
        update: (value, options) => updateAxonHubPassword(value, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)

  const handleValidateConfig = async () => {
    const trimmedUrl = localConfig.baseUrl.trim()
    const trimmedEmail = localConfig.email.trim()

    if (!trimmedUrl || !trimmedEmail || !localConfig.password) {
      toast.error(t("axonHub.validation.missingFields"))
      return
    }

    setLocalConfig((prev) => ({
      ...prev,
      baseUrl: trimmedUrl,
      email: trimmedEmail,
    }))

    setIsValidating(true)
    try {
      await signIn({
        baseUrl: trimmedUrl,
        email: trimmedEmail,
        password: localConfig.password,
      })

      toast.success(t("axonHub.validation.success"))
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      toast.error(
        isLikelyCorsSetupError(errorMessage)
          ? t("axonHub.validation.corsFailed", { error: errorMessage })
          : t("axonHub.validation.failed", { error: errorMessage }),
      )
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={
        <ManagedSiteDeploymentLink siteType={SITE_TYPES.AXON_HUB} />
      }
      id={SETTINGS_ANCHORS.AXON_HUB}
      title={t("axonHub.title")}
      description={t("axonHub.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="axonhub-base-url"
            title={t("axonHub.fields.baseUrlLabel")}
            description={t("axonHub.fields.baseUrlDesc")}
            rightContent={
              <Input
                id="axonhub-base-url-input"
                aria-label={t("axonHub.fields.baseUrlLabel")}
                type="text"
                value={localConfig.baseUrl}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    baseUrl: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("baseUrl", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("axonHub.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id="axonhub-email"
            title={t("axonHub.fields.emailLabel")}
            description={t("axonHub.fields.emailDesc")}
            rightContent={
              <Input
                id="axonhub-email-input"
                aria-label={t("axonHub.fields.emailLabel")}
                type="email"
                value={localConfig.email}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("email", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("axonHub.fields.emailPlaceholder")}
              />
            }
          />

          <CardItem
            id="axonhub-password"
            title={t("axonHub.fields.passwordLabel")}
            description={t("axonHub.fields.passwordDesc")}
            rightContent={
              <Input
                id="axonhub-password-input"
                aria-label={t("axonHub.fields.passwordLabel")}
                type="password"
                revealable
                revealLabels={{
                  show: t("axonHub.fields.showPassword"),
                  hide: t("axonHub.fields.hidePassword"),
                }}
                value={localConfig.password}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("password", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("axonHub.fields.passwordPlaceholder")}
              />
            }
          />

          <CardItem
            id="axonhub-validate-config"
            title={t("axonHub.validation.title")}
            description={t("axonHub.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("axonHub.validation.validating")
                  : t("axonHub.validation.validate")}
              </Button>
            }
          />

          {/* https://github.com/looplj/axonhub/issues/741#issuecomment-3921706717 */}
          <CardItem
            id="axonhub-cors-note"
            title={t("axonHub.cors.title")}
            description={t("axonHub.cors.description")}
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
