import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Card,
  CardItem,
  CardList,
  IconButton,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { getSiteApiRouter, VELOERA } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"
import { createTab } from "~/utils/browser/browserApi"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { joinUrl } from "~/utils/core/url"

/**
 * Settings panel for configuring Veloera connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the Veloera config.
 */
export default function VeloeraSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    veloeraBaseUrl,
    veloeraAdminToken,
    veloeraUserId,
    updateVeloeraBaseUrl,
    updateVeloeraAdminToken,
    updateVeloeraUserId,
    resetVeloeraConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: veloeraBaseUrl,
      adminToken: veloeraAdminToken,
      userId: veloeraUserId,
    }),
    [veloeraAdminToken, veloeraBaseUrl, veloeraUserId],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [showAdminToken, setShowAdminToken] = useState(false)
  const localBaseUrl = localConfig.baseUrl
  const localAdminToken = localConfig.adminToken
  const localUserId = localConfig.userId

  const handleVeloeraBaseUrlChange = async (url: string) => {
    if (url === veloeraBaseUrl) return
    const success = await updateVeloeraBaseUrl(url, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("veloera.fields.baseUrlLabel"))
  }

  const handleVeloeraAdminTokenChange = async (token: string) => {
    if (token === veloeraAdminToken) return
    const success = await updateVeloeraAdminToken(token, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("veloera.fields.adminTokenLabel"))
  }

  const handleVeloeraUserIdChange = async (id: string) => {
    const trimmedId = id.trim()
    if (!isManagedSiteAdminUserIdInputValid(trimmedId)) return

    setLocalConfig((prev) => ({ ...prev, userId: trimmedId }))
    if (trimmedId === veloeraUserId) return
    const success = await updateVeloeraUserId(trimmedId, {
      expectedLastUpdated,
    })
    showUpdateToast(success, t("veloera.fields.userIdLabel"))
  }

  const trimmedBaseUrl = localBaseUrl.trim()
  const userIdError =
    localUserId.trim() !== "" &&
    !isManagedSiteAdminUserIdInputValid(localUserId)
      ? t("messages:errors.validation.userIdNumeric")
      : undefined
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const adminCredentialsUrl = shouldShowAdminCredentialsLink
    ? joinUrl(trimmedBaseUrl, getSiteApiRouter(VELOERA).adminCredentialsPath)
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
      id="veloera"
      title={t("veloera.title")}
      description={t("veloera.description")}
      onReset={resetVeloeraConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("veloera.fields.baseUrlLabel")}
            description={t("veloera.urlDesc")}
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
                onBlur={(e) => handleVeloeraBaseUrlChange(e.target.value)}
                placeholder={t("veloera.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              title={t("veloera.adminCredentialsLink.title")}
              description={t("veloera.adminCredentialsLink.description")}
              rightContent={
                <WorkflowTransitionButton
                  variant="link"
                  size="sm"
                  onClick={handleOpenAdminCredentials}
                >
                  {t("veloera.adminCredentialsLink.open")}
                </WorkflowTransitionButton>
              }
            />
          )}

          <CardItem
            title={t("veloera.fields.adminTokenLabel")}
            description={t("veloera.tokenDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showAdminToken ? "text" : "password"}
                  value={localAdminToken}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      adminToken: e.target.value,
                    }))
                  }
                  onBlur={(e) => handleVeloeraAdminTokenChange(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdminToken(!showAdminToken)}
                      aria-label={
                        showAdminToken
                          ? t("veloera.fields.hideToken")
                          : t("veloera.fields.showToken")
                      }
                    >
                      {showAdminToken ? (
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
            title={t("veloera.fields.userIdLabel")}
            description={t("veloera.userIdDesc")}
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
                onBlur={(e) => handleVeloeraUserIdChange(e.target.value)}
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
