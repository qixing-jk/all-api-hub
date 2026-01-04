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
import { getSiteApiRouter, NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/toastHelpers"
import { joinUrl } from "~/utils/url"

/**
 * Settings panel for configuring New API connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the New API config.
 */
export default function NewApiSettings() {
  const { t } = useTranslation("settings")
  const {
    newApiBaseUrl,
    newApiAdminToken,
    newApiUserId,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    resetNewApiConfig,
  } = useUserPreferencesContext()

  const [localBaseUrl, setLocalBaseUrl] = useState(newApiBaseUrl)
  const [localAdminToken, setLocalAdminToken] = useState(newApiAdminToken)
  const [showAdminToken, setShowAdminToken] = useState(false)
  const [localUserId, setLocalUserId] = useState(newApiUserId)

  useEffect(() => {
    setLocalBaseUrl(newApiBaseUrl)
  }, [newApiBaseUrl])

  useEffect(() => {
    setLocalAdminToken(newApiAdminToken)
  }, [newApiAdminToken])

  useEffect(() => {
    setLocalUserId(newApiUserId)
  }, [newApiUserId])

  const handleNewApiBaseUrlChange = async (url: string) => {
    if (url === newApiBaseUrl) return
    const success = await updateNewApiBaseUrl(url)
    showUpdateToast(success, t("newApi.fields.baseUrlLabel"))
  }

  const handleNewApiAdminTokenChange = async (token: string) => {
    if (token === newApiAdminToken) return
    const success = await updateNewApiAdminToken(token)
    showUpdateToast(success, t("newApi.fields.adminTokenLabel"))
  }

  const handleNewApiUserIdChange = async (id: string) => {
    if (id === newApiUserId) return
    const success = await updateNewApiUserId(id)
    showUpdateToast(success, t("newApi.fields.userIdLabel"))
  }

  const trimmedBaseUrl = localBaseUrl.trim()
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const adminCredentialsUrl = shouldShowAdminCredentialsLink
    ? joinUrl(trimmedBaseUrl, getSiteApiRouter(NEW_API).adminCredentialsPath)
    : ""

  return (
    <SettingSection
      id="new-api"
      title={t("newApi.title")}
      description={t("newApi.description", { defaultValue: "" })}
      onReset={resetNewApiConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("newApi.fields.baseUrlLabel")}
            description={t("newApi.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleNewApiBaseUrlChange(e.target.value)}
                placeholder={t("newApi.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              title={t("newApi.adminCredentialsLink.title")}
              description={t("newApi.adminCredentialsLink.description")}
              rightContent={
                <Button variant="link" size="sm">
                  <a
                    href={adminCredentialsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("newApi.adminCredentialsLink.open")}
                  </a>
                </Button>
              }
            />
          )}

          <CardItem
            title={t("newApi.fields.adminTokenLabel")}
            description={t("newApi.tokenDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showAdminToken ? "text" : "password"}
                  value={localAdminToken}
                  onChange={(e) => setLocalAdminToken(e.target.value)}
                  onBlur={(e) => handleNewApiAdminTokenChange(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdminToken(!showAdminToken)}
                      aria-label={
                        showAdminToken
                          ? t("newApi.fields.hideToken")
                          : t("newApi.fields.showToken")
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
            title={t("newApi.fields.userIdLabel")}
            description={t("newApi.userIdDesc")}
            rightContent={
              <Input
                type="text"
                value={localUserId}
                onChange={(e) => setLocalUserId(e.target.value)}
                onBlur={(e) => handleNewApiUserIdChange(e.target.value)}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
