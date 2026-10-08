import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { ManagedSiteDeploymentLink } from "~/features/ManagedSiteWidgets/ManagedSiteDeploymentLink"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { validateClaudeCodeHubConfig } from "~/services/apiService/claudeCodeHub"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"

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
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.claudeCodeHub,
    defaults: DEFAULT_PREFERENCES.claudeCodeHub,
    reset: resetClaudeCodeHubConfig,
    fields: {
      baseUrl: {
        setting: t("claudeCodeHub.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateClaudeCodeHubBaseUrl(value, options),
      },
      adminToken: {
        setting: t("claudeCodeHub.fields.adminTokenLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateClaudeCodeHubAdminToken(value, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)

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

      toast.success(t("claudeCodeHub.validation.success"))
    } catch (error) {
      const safeError =
        toSanitizedErrorSummary(error, [adminToken]) ||
        "Claude Code Hub request failed"
      toast.error(
        t("claudeCodeHub.validation.failed", {
          error: safeError,
        }),
      )
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={
        <ManagedSiteDeploymentLink siteType={SITE_TYPES.CLAUDE_CODE_HUB} />
      }
      id="claude-code-hub"
      title={t("claudeCodeHub.title")}
      description={t("claudeCodeHub.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="claude-code-hub-base-url"
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
                onBlur={(event) => commitField("baseUrl", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("claudeCodeHub.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id="claude-code-hub-admin-token"
            title={t("claudeCodeHub.fields.adminTokenLabel")}
            description={t("claudeCodeHub.fields.adminTokenDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("claudeCodeHub.fields.showAdminToken"),
                  hide: t("claudeCodeHub.fields.hideAdminToken"),
                }}
                value={localConfig.adminToken}
                onChange={(event) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    adminToken: event.target.value,
                  }))
                }
                onBlur={(event) =>
                  commitField("adminToken", event.target.value)
                }
                onKeyDown={blurInputOnEnter}
                placeholder={t("claudeCodeHub.fields.adminTokenPlaceholder")}
              />
            }
          />

          <CardItem
            id="claude-code-hub-validate-config"
            title={t("claudeCodeHub.validation.title")}
            description={t("claudeCodeHub.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("claudeCodeHub.validation.validating")
                  : t("claudeCodeHub.validation.validate")}
              </Button>
            }
          />

          <CardItem
            id="claude-code-hub-unsupported-note"
            title={t("claudeCodeHub.unsupported.title")}
            description={t("claudeCodeHub.unsupported.description")}
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
