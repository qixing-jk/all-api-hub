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
  Link,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { verifyCliProxyManagementConnection } from "~/services/integrations/cliProxyService"
import { showResultToast, showUpdateToast } from "~/utils/core/toastHelpers"

const CLI_PROXY_MANAGEMENT_DOC_URL = "https://help.router-for.me/management/api"

/**
 * Settings section for CLI Proxy base URL and management key entries.
 * Handles local input state, visibility toggle, persistence, and reset hook.
 */
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
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)

  useEffect(() => {
    setLocalBaseUrl(cliProxyBaseUrl)
  }, [cliProxyBaseUrl])

  useEffect(() => {
    setLocalKey(cliProxyManagementKey)
  }, [cliProxyManagementKey])

  const runConnectionCheck = async (overrides?: {
    baseUrl?: string
    managementKey?: string
  }) => {
    const baseUrl = overrides?.baseUrl ?? localBaseUrl
    const managementKey = overrides?.managementKey ?? localKey

    setIsCheckingConnection(true)
    try {
      const result = await verifyCliProxyManagementConnection({
        baseUrl,
        managementKey,
      })
      return result
    } finally {
      setIsCheckingConnection(false)
    }
  }

  const runConnectionCheckWithToast = async (overrides?: {
    baseUrl?: string
    managementKey?: string
  }) => {
    const result = await runConnectionCheck(overrides)
    showResultToast(result)
    return result
  }

  const handleBaseUrlChange = async (url: string) => {
    const trimmedUrl = url.trim()
    setLocalBaseUrl(trimmedUrl)

    if (trimmedUrl === cliProxyBaseUrl.trim()) return
    const success = await updateCliProxyBaseUrl(trimmedUrl)
    showUpdateToast(success, t("cliProxy.baseUrlLabel"))

    if (success && trimmedUrl && localKey.trim()) {
      await runConnectionCheckWithToast({
        baseUrl: trimmedUrl,
        managementKey: localKey,
      })
    }
  }

  const handleKeyChange = async (key: string) => {
    const trimmedKey = key.trim()
    setLocalKey(trimmedKey)

    if (trimmedKey === cliProxyManagementKey.trim()) return
    const success = await updateCliProxyManagementKey(trimmedKey)
    showUpdateToast(success, t("cliProxy.managementKeyLabel"))

    if (success && localBaseUrl.trim() && trimmedKey) {
      await runConnectionCheckWithToast({
        baseUrl: localBaseUrl,
        managementKey: trimmedKey,
      })
    }
  }

  return (
    <SettingSection
      id="cli-proxy"
      title={t("cliProxy.title")}
      description={t("cliProxy.description")}
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
                      aria-label={
                        showKey ? t("cliProxy.hideKey") : t("cliProxy.showKey")
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

          <CardItem
            title={t("cliProxy.checkConnectionLabel")}
            description={t("cliProxy.checkConnectionDesc")}
            rightContent={
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={isCheckingConnection}
                  onClick={async () => {
                    await runConnectionCheckWithToast()
                  }}
                >
                  {t("cliProxy.checkConnectionAction")}
                </Button>
                <Link
                  href={CLI_PROXY_MANAGEMENT_DOC_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs"
                >
                  {t("cliProxy.managementDocsLinkLabel")}
                </Link>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
