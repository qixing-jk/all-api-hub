import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, IconButton, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import { showUpdateToast } from "../../../../../utils/toastHelpers"

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
    showUpdateToast(success, "New API Base URL")
  }

  const handleNewApiAdminTokenChange = async (token: string) => {
    if (token === newApiAdminToken) return
    const success = await updateNewApiAdminToken(token)
    showUpdateToast(success, "Admin Token")
  }

  const handleNewApiUserIdChange = async (id: string) => {
    if (id === newApiUserId) return
    const success = await updateNewApiUserId(id)
    showUpdateToast(success, "User ID")
  }

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
            title={"New API Base URL"}
            description={t("newApi.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleNewApiBaseUrlChange(e.target.value)}
                placeholder="https://api.example.com"
              />
            }
          />

          <CardItem
            title={"Admin Token"}
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
                        showAdminToken ? "Hide password" : "Show password"
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
            title={"User ID"}
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
