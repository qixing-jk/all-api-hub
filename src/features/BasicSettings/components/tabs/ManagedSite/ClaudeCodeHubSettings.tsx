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
import { validateClaudeCodeHubConfig } from "~/services/apiService/claudeCodeHub"
import { getErrorMessage } from "~/utils/core/error"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Renders Claude Code Hub settings fields and a config validation action.
 */
export default function ClaudeCodeHubSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    claudeCodeHubBaseUrl,
    claudeCodeHubAdminToken,
    updateClaudeCodeHubBaseUrl,
    updateClaudeCodeHubAdminToken,
    updateClaudeCodeHubConfig,
    resetClaudeCodeHubConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: claudeCodeHubBaseUrl,
      adminToken: claudeCodeHubAdminToken,
    }),
    [claudeCodeHubAdminToken, claudeCodeHubBaseUrl],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [showToken, setShowToken] = useState(false)
  const [isValidating, setIsValidating] = useState(false)

  const handleBaseUrlChange = async (url: string) => {
    const trimmedUrl = url.trim()
    if (trimmedUrl === claudeCodeHubBaseUrl) return
    const success = await updateClaudeCodeHubBaseUrl(trimmedUrl, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("claudeCodeHub.fields.baseUrlLabel"))
  }

  const handleTokenChange = async (token: string) => {
    if (token === claudeCodeHubAdminToken) return
    const success = await updateClaudeCodeHubAdminToken(token, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("claudeCodeHub.fields.adminTokenLabel"))
  }

  const handleValidateConfig = async () => {
    const trimmedUrl = localConfig.baseUrl.trim()
    const adminToken = localConfig.adminToken.trim()

    if (!trimmedUrl || !adminToken) {
      toast.error(t("claudeCodeHub.validation.missingFields"))
      return
    }

    setLocalConfig((prev) => ({
      ...prev,
      baseUrl: trimmedUrl,
      adminToken,
    }))

    setIsValidating(true)
    try {
      await validateClaudeCodeHubConfig({
        baseUrl: trimmedUrl,
        adminToken,
      })

      const success = await updateClaudeCodeHubConfig(
        {
          baseUrl: trimmedUrl,
          adminToken,
        },
        {
          expectedLastUpdated,
        },
      )

      toast[success ? "success" : "error"](
        success
          ? t("claudeCodeHub.validation.success")
          : t("messages.updateFailed", { name: t("claudeCodeHub.title") }),
      )
    } catch (error) {
      toast.error(
        t("claudeCodeHub.validation.failed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      id="claude-code-hub"
      title={t("claudeCodeHub.title")}
      description={t("claudeCodeHub.description")}
      onReset={resetClaudeCodeHubConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("claudeCodeHub.fields.baseUrlLabel")}
            description={t("claudeCodeHub.fields.baseUrlDesc")}
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
                placeholder={t("claudeCodeHub.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            title={t("claudeCodeHub.fields.adminTokenLabel")}
            description={t("claudeCodeHub.fields.adminTokenDesc")}
            rightContent={
              <Input
                type={showToken ? "text" : "password"}
                value={localConfig.adminToken}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    adminToken: event.target.value,
                  }))
                }
                onBlur={(event) => handleTokenChange(event.target.value)}
                placeholder={t("claudeCodeHub.fields.adminTokenPlaceholder")}
                rightIcon={
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={
                      showToken
                        ? t("claudeCodeHub.fields.hideAdminToken")
                        : t("claudeCodeHub.fields.showAdminToken")
                    }
                  >
                    {showToken ? (
                      <EyeSlashIcon className="h-4 w-4" />
                    ) : (
                      <EyeIcon className="h-4 w-4" />
                    )}
                  </IconButton>
                }
              />
            }
          />

          <CardItem
            title={t("claudeCodeHub.validation.title")}
            description={t("claudeCodeHub.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                disabled={isValidating}
              >
                {isValidating
                  ? t("claudeCodeHub.validation.validating")
                  : t("claudeCodeHub.validation.validate")}
              </Button>
            }
          />

          <CardItem
            title={t("claudeCodeHub.unsupported.title")}
            description={t("claudeCodeHub.unsupported.description")}
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
