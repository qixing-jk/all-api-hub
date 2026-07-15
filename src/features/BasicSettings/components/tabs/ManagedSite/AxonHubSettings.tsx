import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { signIn } from "~/services/apiService/axonHub"
import { getErrorMessage } from "~/utils/core/error"
import {
  createVersionedPreferenceSaveOptions,
  getPreferenceWriteFailureMessage,
  runPreferenceUpdateWithToast,
} from "~/utils/core/toastHelpers"

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
    updateAxonHubConfig,
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
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [isValidating, setIsValidating] = useState(false)

  const handleBaseUrlChange = async (url: string) => {
    const trimmedUrl = url.trim()
    if (trimmedUrl === axonHubBaseUrl) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("axonHub.fields.baseUrlLabel"),
      update: (options) => updateAxonHubBaseUrl(trimmedUrl, options),
    })
  }

  const handleEmailChange = async (email: string) => {
    const trimmedEmail = email.trim()
    if (trimmedEmail === axonHubEmail) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("axonHub.fields.emailLabel"),
      update: (options) => updateAxonHubEmail(trimmedEmail, options),
    })
  }

  const handlePasswordChange = async (password: string) => {
    if (password === axonHubPassword) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("axonHub.fields.passwordLabel"),
      update: (options) => updateAxonHubPassword(password, options),
    })
  }

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

      const saveResult = await updateAxonHubConfig(
        {
          baseUrl: trimmedUrl,
          email: trimmedEmail,
          password: localConfig.password,
        },
        createVersionedPreferenceSaveOptions(expectedLastUpdated),
      )

      if (saveResult.ok) {
        toast.success(t("axonHub.validation.success"))
      } else {
        toast.error(
          getPreferenceWriteFailureMessage(saveResult.reason, {
            fallback: t("messages.updateFailed", { name: t("axonHub.title") }),
          }),
        )
      }
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
      id="axonhub"
      title={t("axonHub.title")}
      description={t("axonHub.description")}
      onReset={resetAxonHubConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="axonhub-base-url"
            title={t("axonHub.fields.baseUrlLabel")}
            description={t("axonHub.fields.baseUrlDesc")}
            rightContent={
              <Input
                type="text"
                value={localConfig.baseUrl}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    baseUrl: event.target.value,
                  }))
                }
                onBlur={(event) => handleBaseUrlChange(event.target.value)}
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
                type="email"
                value={localConfig.email}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                onBlur={(event) => handleEmailChange(event.target.value)}
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
                onBlur={(event) => handlePasswordChange(event.target.value)}
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
