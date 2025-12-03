import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, IconButton, Input } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { showUpdateToast } from "~/utils/toastHelpers"

export default function CliProxySettings() {
  const { t } = useTranslation("settings")
  const {
    cliProxyBaseUrl,
    cliProxyManagementKey,
    updateCliProxyBaseUrl,
    updateCliProxyManagementKey,
    resetCliProxyConfig,
  } = useUserPreferencesContext()

  const [localBaseUrl, setLocalBaseUrl] = useState(cliProxyBaseUrl)
  const [localKey, setLocalKey] = useState(cliProxyManagementKey)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    setLocalBaseUrl(cliProxyBaseUrl)
  }, [cliProxyBaseUrl])

  useEffect(() => {
    setLocalKey(cliProxyManagementKey)
  }, [cliProxyManagementKey])

  const handleBaseUrlChange = async (url: string) => {
    if (url === cliProxyBaseUrl) return
    const success = await updateCliProxyBaseUrl(url)
    showUpdateToast(success, t("cliProxy.baseUrlLabel"))
  }

  const handleKeyChange = async (key: string) => {
    if (key === cliProxyManagementKey) return
    const success = await updateCliProxyManagementKey(key)
    showUpdateToast(success, t("cliProxy.managementKeyLabel"))
  }

  return (
    <SettingSection
      id="cli-proxy"
      title={t("cliProxy.title")}
      description={t("cliProxy.description", { defaultValue: "" })}
      onReset={resetCliProxyConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            title={t("cliProxy.baseUrlLabel")}
            description={t("cliProxy.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleBaseUrlChange(e.target.value)}
                placeholder="http://localhost:8317/v0/management"
              />
            }
          />

          <CardItem
            title={t("cliProxy.managementKeyLabel")}
            description={t("cliProxy.keyDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={localKey}
                  onChange={(e) => setLocalKey(e.target.value)}
                  onBlur={(e) => handleKeyChange(e.target.value)}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKey(!showKey)}
                      aria-label={showKey ? "Hide key" : "Show key"}
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
