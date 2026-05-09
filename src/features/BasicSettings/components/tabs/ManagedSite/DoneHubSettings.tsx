import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Card,
  CardItem,
  CardList,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { getSiteApiRouter, SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"
import { createTab } from "~/utils/browser/browserApi"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { joinUrl } from "~/utils/core/url"

/**
 * Settings panel for configuring Done Hub connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the Done Hub config.
 */
export default function DoneHubSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    doneHubBaseUrl,
    doneHubAdminToken,
    doneHubUserId,
    updateDoneHubBaseUrl,
    updateDoneHubAdminToken,
    updateDoneHubUserId,
    resetDoneHubConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: doneHubBaseUrl,
      adminToken: doneHubAdminToken,
      userId: doneHubUserId,
    }),
    [doneHubAdminToken, doneHubBaseUrl, doneHubUserId],
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
  const localAdminToken = localConfig.adminToken
  const localUserId = localConfig.userId

  const handleBaseUrlChange = async (url: string) => {
    const clean = url.trim()
    if (clean === doneHubBaseUrl) return
    const success = await updateDoneHubBaseUrl(clean, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("doneHub.fields.baseUrlLabel"))
  }

  const handleAdminTokenChange = async (token: string) => {
    if (token === doneHubAdminToken) return
    const success = await updateDoneHubAdminToken(token, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("doneHub.fields.adminTokenLabel"))
  }

  const handleUserIdChange = async (id: string) => {
    const trimmedId = id.trim()
    if (!isManagedSiteAdminUserIdInputValid(trimmedId)) return

    setLocalConfig((prev) => ({ ...prev, userId: trimmedId }))
    if (trimmedId === doneHubUserId) return
    const success = await updateDoneHubUserId(trimmedId, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("doneHub.fields.userIdLabel"))
  }

  const trimmedBaseUrl = localBaseUrl.trim()
  const userIdError =
    localUserId.trim() !== "" &&
    !isManagedSiteAdminUserIdInputValid(localUserId)
      ? t("messages:errors.validation.userIdNumeric")
      : undefined
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const adminCredentialsUrl = shouldShowAdminCredentialsLink
    ? joinUrl(
        trimmedBaseUrl,
        getSiteApiRouter(SITE_TYPES.DONE_HUB).adminCredentialsPath,
      )
    : ""

  const handleOpenAdminCredentials = async () => {
    if (!adminCredentialsUrl) return
    try {
      await createTab(adminCredentialsUrl, true)
    } catch {
      window.open(adminCredentialsUrl, "_blank", "noopener,noreferrer")
    }
  }

  return (
    <SettingSection
      id="done-hub"
      title={t("doneHub.title")}
      description={t("doneHub.description")}
      onReset={resetDoneHubConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="done-hub-base-url"
            title={t("doneHub.fields.baseUrlLabel")}
            description={t("doneHub.urlDesc")}
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
                placeholder={t("doneHub.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              id="done-hub-admin-credentials-link"
              title={t("doneHub.adminCredentialsLink.title")}
              description={t("doneHub.adminCredentialsLink.description")}
              rightContent={
                <WorkflowTransitionButton
                  variant="link"
                  size="sm"
                  onClick={handleOpenAdminCredentials}
                >
                  {t("doneHub.adminCredentialsLink.open")}
                </WorkflowTransitionButton>
              }
            />
          )}

          <CardItem
            id="done-hub-admin-token"
            title={t("doneHub.fields.adminTokenLabel")}
            description={t("doneHub.tokenDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("doneHub.fields.showToken"),
                    hide: t("doneHub.fields.hideToken"),
                  }}
                  value={localAdminToken}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      adminToken: e.target.value,
                    }))
                  }
                  onBlur={(e) => handleAdminTokenChange(e.target.value)}
                />
              </div>
            }
          />

          <CardItem
            id="done-hub-user-id"
            title={t("doneHub.fields.userIdLabel")}
            description={t("doneHub.userIdDesc")}
            rightContent={
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={localUserId}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    userId: e.target.value,
                  }))
                }
                onBlur={(e) => handleUserIdChange(e.target.value)}
                error={userIdError}
                aria-invalid={Boolean(userIdError)}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
