import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { showUpdateToast } from "~/utils/core/toastHelpers"

/**
 * Settings section for configuring Claude Code Router admin API connection.
 * Stores `baseUrl` and optional `apiKey` in user preferences.
 */
export default function ClaudeCodeRouterSettings() {
  const { t } = useTranslation(["settings", "keyManagement"])
  const {
    preferences,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    updateClaudeCodeRouterBaseUrl,
    updateClaudeCodeRouterApiKey,
    resetClaudeCodeRouterConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: claudeCodeRouterBaseUrl,
      apiKey: claudeCodeRouterApiKey,
    }),
    [claudeCodeRouterApiKey, claudeCodeRouterBaseUrl],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const localBaseUrl = localConfig.baseUrl
  const localKey = localConfig.apiKey

  const handleBaseUrlChange = async (url: string) => {
    if (url === claudeCodeRouterBaseUrl) return
    const success = await updateClaudeCodeRouterBaseUrl(url, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("settings:claudeCodeRouter.baseUrlLabel"))
  }

  const handleKeyChange = async (key: string) => {
    if (key === claudeCodeRouterApiKey) return
    const success = await updateClaudeCodeRouterApiKey(key, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("settings:claudeCodeRouter.apiKeyLabel"))
  }

  return (
    <SettingSection
      id="claude-code-router"
      title={t("settings:claudeCodeRouter.title")}
      description={t("settings:claudeCodeRouter.description")}
      onReset={resetClaudeCodeRouterConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="claude-code-router-base-url"
            title={t("settings:claudeCodeRouter.baseUrlLabel")}
            description={t("settings:claudeCodeRouter.urlDesc")}
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
                placeholder={t("settings:claudeCodeRouter.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id="claude-code-router-api-key"
            title={t("settings:claudeCodeRouter.apiKeyLabel")}
            description={t("settings:claudeCodeRouter.keyDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("keyManagement:actions.showKey"),
                    hide: t("keyManagement:actions.hideKey"),
                  }}
                  value={localKey}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      apiKey: e.target.value,
                    }))
                  }
                  onBlur={(e) => handleKeyChange(e.target.value)}
                  placeholder={t("settings:claudeCodeRouter.apiKeyPlaceholder")}
                />
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
