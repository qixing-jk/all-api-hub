import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
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
import { DONE_HUB, getSiteApiRouter } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { createTab } from "~/utils/browserApi"
import { showUpdateToast } from "~/utils/toastHelpers"
import { joinUrl } from "~/utils/url"

/**
 * Settings panel for configuring Done Hub connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the Done Hub config.
 */
export default function DoneHubSettings() {
  const { t } = useTranslation("settings")
  const {
    doneHubBaseUrl,
    doneHubAdminToken,
    doneHubUserId,
    updateDoneHubBaseUrl,
    updateDoneHubAdminToken,
    updateDoneHubUserId,
    resetDoneHubConfig,
  } = useUserPreferencesContext()

  const [localBaseUrl, setLocalBaseUrl] = useState(doneHubBaseUrl)
  const [localAdminToken, setLocalAdminToken] = useState(doneHubAdminToken)
  const [showAdminToken, setShowAdminToken] = useState(false)
  const [localUserId, setLocalUserId] = useState(doneHubUserId)

  useEffect(() => {
    setLocalBaseUrl(doneHubBaseUrl)
  }, [doneHubBaseUrl])

  useEffect(() => {
    setLocalAdminToken(doneHubAdminToken)
  }, [doneHubAdminToken])

  useEffect(() => {
    setLocalUserId(doneHubUserId)
  }, [doneHubUserId])

  const handleBaseUrlChange = async (url: string) => {
    const clean = url.trim()
    if (clean === doneHubBaseUrl) return
    const success = await updateDoneHubBaseUrl(clean)
    showUpdateToast(success, t("doneHub.fields.baseUrlLabel"))
  }

  const handleAdminTokenChange = async (token: string) => {
    if (token === doneHubAdminToken) return
    const success = await updateDoneHubAdminToken(token)
    showUpdateToast(success, t("doneHub.fields.adminTokenLabel"))
  }

  const handleUserIdChange = async (id: string) => {
    if (id === doneHubUserId) return
    const success = await updateDoneHubUserId(id)
    showUpdateToast(success, t("doneHub.fields.userIdLabel"))
  }

  const trimmedBaseUrl = localBaseUrl.trim()
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const adminCredentialsUrl = shouldShowAdminCredentialsLink
    ? joinUrl(trimmedBaseUrl, getSiteApiRouter(DONE_HUB).adminCredentialsPath)
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
      description={t("doneHub.description", { defaultValue: "" })}
      onReset={resetDoneHubConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("doneHub.fields.baseUrlLabel")}
            description={t("doneHub.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleBaseUrlChange(e.target.value)}
                placeholder={t("doneHub.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              title={t("doneHub.adminCredentialsLink.title")}
              description={t("doneHub.adminCredentialsLink.description")}
              rightContent={
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleOpenAdminCredentials}
                >
                  {t("doneHub.adminCredentialsLink.open")}
                </Button>
              }
            />
          )}

          <CardItem
            title={t("doneHub.fields.adminTokenLabel")}
            description={t("doneHub.tokenDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showAdminToken ? "text" : "password"}
                  value={localAdminToken}
                  onChange={(e) => setLocalAdminToken(e.target.value)}
                  onBlur={(e) => handleAdminTokenChange(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdminToken(!showAdminToken)}
                      aria-label={
                        showAdminToken
                          ? t("doneHub.fields.hideToken")
                          : t("doneHub.fields.showToken")
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
            title={t("doneHub.fields.userIdLabel")}
            description={t("doneHub.userIdDesc")}
            rightContent={
              <Input
                type="text"
                value={localUserId}
                onChange={(e) => setLocalUserId(e.target.value)}
                onBlur={(e) => handleUserIdChange(e.target.value)}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
