import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, IconButton, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section for configuring Claude Code Router admin API connection.
 * Stores `baseUrl` and optional `apiKey` in user preferences.
 */
export default function ClaudeCodeRouterSettings() {
  const { t } = useTranslation(["settings", "keyManagement"])
  const {
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    updateClaudeCodeRouterBaseUrl,
    updateClaudeCodeRouterApiKey,
    resetClaudeCodeRouterConfig,
  } = useUserPreferencesContext()

  const [localBaseUrl, setLocalBaseUrl] = useState(claudeCodeRouterBaseUrl)
  const [localKey, setLocalKey] = useState(claudeCodeRouterApiKey)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    setLocalBaseUrl(claudeCodeRouterBaseUrl)
  }, [claudeCodeRouterBaseUrl])

  useEffect(() => {
    setLocalKey(claudeCodeRouterApiKey)
  }, [claudeCodeRouterApiKey])

  const handleBaseUrlChange = async (url: string) => {
    if (url === claudeCodeRouterBaseUrl) return
    const success = await updateClaudeCodeRouterBaseUrl(url)
    showUpdateToast(success, t("settings:claudeCodeRouter.baseUrlLabel"))
  }

  const handleKeyChange = async (key: string) => {
    if (key === claudeCodeRouterApiKey) return
    const success = await updateClaudeCodeRouterApiKey(key)
    showUpdateToast(success, t("settings:claudeCodeRouter.apiKeyLabel"))
  }

  return (
    <SettingSection
      id="claude-code-router"
      title={t("settings:claudeCodeRouter.title")}
      description={t("settings:claudeCodeRouter.description", {
        defaultValue: "",
      })}
      onReset={resetClaudeCodeRouterConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("settings:claudeCodeRouter.baseUrlLabel")}
            description={t("settings:claudeCodeRouter.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={t("settings:claudeCodeRouter.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            title={t("settings:claudeCodeRouter.apiKeyLabel")}
            description={t("settings:claudeCodeRouter.keyDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  onBlur={(e) => handleKeyChange(e.target.value)}
                  placeholder={t("settings:claudeCodeRouter.apiKeyPlaceholder")}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKey(!showKey)}
                      aria-label={
                        showKey
                          ? t("keyManagement:actions.hideKey")
                          : t("keyManagement:actions.showKey")
                      }
                    >
                      {showKey ? (
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
        </CardList>
      </Card>
    </SettingSection>
  )
}
