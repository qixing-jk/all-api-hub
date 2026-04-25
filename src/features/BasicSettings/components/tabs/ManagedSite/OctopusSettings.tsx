import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  IconButton,
  Input,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { octopusAuthManager } from "~/services/apiService/octopus/auth"
import { showUpdateToast } from "~/utils/core/toastHelpers"

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
    updateOctopusConfig,
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
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const localBaseUrl = localConfig.baseUrl
  const localUsername = localConfig.username
  const localPassword = localConfig.password

  const handleBaseUrlChange = async (url: string) => {
    url = url.trim()
    if (url === octopusBaseUrl) return
    const success = await updateOctopusBaseUrl(url, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("octopus.fields.baseUrlLabel"))
  }

  const handleUsernameChange = async (username: string) => {
    username = username.trim()
    if (username === octopusUsername) return
    const success = await updateOctopusUsername(username, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("octopus.fields.usernameLabel"))
  }

  const handlePasswordChange = async (password: string) => {
    password = password.trim()
    if (password === octopusPassword) return
    const success = await updateOctopusPassword(password, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("octopus.fields.passwordLabel"))
  }

  const handleValidateConfig = async () => {
    const trimmedUrl = localBaseUrl.trim()
    const trimmedUsername = localUsername.trim()
    const trimmedPassword = localPassword.trim()

    if (!trimmedUrl || !trimmedUsername || !trimmedPassword) {
      toast.error(t("octopus.validation.missingFields"))
      return
    }

    // Persist trimmed values to ensure stored inputs match validated values
    setLocalConfig((prev) => ({
      ...prev,
      baseUrl: trimmedUrl,
      username: trimmedUsername,
      password: trimmedPassword,
    }))

    setIsValidating(true)
    try {
      const result = await octopusAuthManager.validateConfig({
        baseUrl: trimmedUrl,
        username: trimmedUsername,
        password: trimmedPassword,
      })

      if (result.success) {
        // Persist validated config to storage
        const success = await updateOctopusConfig(
          {
            baseUrl: trimmedUrl,
            username: trimmedUsername,
            password: trimmedPassword,
          },
          {
            expectedLastUpdated,
          },
        )

        if (success) {
          toast.success(t("octopus.validation.success"))
        } else {
          toast.error(t("settings:messages.updateFailed"))
        }
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
      id="octopus"
      title={t("octopus.title")}
      description={t("octopus.description")}
      onReset={resetOctopusConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
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
                onBlur={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={t("octopus.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
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
                onBlur={(e) => handleUsernameChange(e.target.value)}
                placeholder={t("octopus.fields.usernamePlaceholder")}
              />
            }
          />

          <CardItem
            title={t("octopus.fields.passwordLabel")}
            description={t("octopus.fields.passwordDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={localPassword}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  onBlur={(e) => handlePasswordChange(e.target.value)}
                  placeholder={t("octopus.fields.passwordPlaceholder")}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? t("octopus.fields.hidePassword")
                          : t("octopus.fields.showPassword")
                      }
                    >
                      {showPassword ? (
                        <EyeSlashIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                    </IconButton>
                  }
                />
              </div>
            }
          />

          <CardItem
            title={t("octopus.validation.title")}
            description={t("octopus.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                disabled={isValidating}
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
