import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Button, Card, CardItem, CardList, Input, Link } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import {
  CliProxyApiError,
  listAllCliProxyApiProviders,
} from "~/services/apiService/cliProxyApi"
import { showResultToast } from "~/utils/feedback/operationFeedback"
import { runPreferenceUpdateWithToast } from "~/utils/feedback/preferenceFeedback"

const CLI_PROXY_API_MANAGEMENT_DOC_URL =
  "https://help.router-for.me/management/api"

/**
 * Settings section for CLIProxyAPI base URL and management key entries.
 * Handles local input state, visibility toggle, persistence, and reset hook.
 */
export default function CliProxyApiSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    cliProxyApiBaseUrl,
    cliProxyApiManagementKey,
    updateCliProxyApiBaseUrl,
    updateCliProxyApiManagementKey,
    resetCliProxyApiConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: cliProxyApiBaseUrl,
      managementKey: cliProxyApiManagementKey,
    }),
    [cliProxyApiBaseUrl, cliProxyApiManagementKey],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [isCheckingConnection, setIsCheckingConnection] = useState(false)
  const localBaseUrl = localConfig.baseUrl
  const localKey = localConfig.managementKey

  const runConnectionCheck = async (overrides?: {
    baseUrl?: string
    managementKey?: string
  }) => {
    const baseUrl = overrides?.baseUrl ?? localBaseUrl
    const managementKey = overrides?.managementKey ?? localKey

    setIsCheckingConnection(true)
    try {
      await listAllCliProxyApiProviders({ baseUrl, adminToken: managementKey })
      return {
        success: true,
        message: t("messages:cliProxyApi.managementApiConnectionSuccess"),
      }
    } catch (error) {
      const status =
        error instanceof CliProxyApiError ? error.status : undefined
      const message =
        status === 401
          ? t("messages:cliProxyApi.managementApiInvalidKey")
          : status === 403
            ? t("messages:cliProxyApi.managementApiForbidden")
            : status === 404
              ? t("messages:cliProxyApi.managementApiNotFound")
              : status
                ? t("messages:cliProxyApi.managementApiHttpError", { status })
                : t("messages:cliProxyApi.managementApiUnreachable")
      return { success: false, message }
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
    setLocalConfig((prev) => ({ ...prev, baseUrl: trimmedUrl }))

    if (trimmedUrl === cliProxyApiBaseUrl.trim()) return
    const writeResult = await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("cliProxyApi.baseUrlLabel"),
      update: (options) => updateCliProxyApiBaseUrl(trimmedUrl, options),
    })

    if (writeResult.ok && trimmedUrl && localKey.trim()) {
      await runConnectionCheckWithToast({
        baseUrl: trimmedUrl,
        managementKey: localKey,
      })
    }
  }

  const handleKeyChange = async (key: string) => {
    const trimmedKey = key.trim()
    setLocalConfig((prev) => ({ ...prev, managementKey: trimmedKey }))

    if (trimmedKey === cliProxyApiManagementKey.trim()) return
    const writeResult = await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("cliProxyApi.managementKeyLabel"),
      update: (options) => updateCliProxyApiManagementKey(trimmedKey, options),
    })

    if (writeResult.ok && localBaseUrl.trim() && trimmedKey) {
      await runConnectionCheckWithToast({
        baseUrl: localBaseUrl,
        managementKey: trimmedKey,
      })
    }
  }

  return (
    <SettingSection
      id="cli-proxy"
      title={t("cliProxyApi.title")}
      description={t("cliProxyApi.description")}
      onReset={resetCliProxyApiConfig}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="cli-proxy-base-url"
            title={t("cliProxyApi.baseUrlLabel")}
            description={t("cliProxyApi.urlDesc")}
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
                onKeyDown={blurInputOnEnter}
                placeholder="http://localhost:8317/v0/management"
                aria-label={t("cliProxyApi.baseUrlLabel")}
              />
            }
          />

          <CardItem
            id="cli-proxy-management-key"
            title={t("cliProxyApi.managementKeyLabel")}
            description={t("cliProxyApi.keyDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("cliProxyApi.showKey"),
                    hide: t("cliProxyApi.hideKey"),
                  }}
                  value={localKey}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      managementKey: e.target.value,
                    }))
                  }
                  onBlur={(e) => handleKeyChange(e.target.value)}
                  onKeyDown={blurInputOnEnter}
                  aria-label={t("cliProxyApi.managementKeyLabel")}
                />
              </div>
            }
          />

          <CardItem
            id="cli-proxy-check-connection"
            title={t("cliProxyApi.checkConnectionLabel")}
            description={t("cliProxyApi.checkConnectionDesc")}
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
                  {isCheckingConnection
                    ? t("common:status.checking")
                    : t("cliProxyApi.checkConnectionAction")}
                </Button>
                <Link
                  href={CLI_PROXY_API_MANAGEMENT_DOC_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs"
                >
                  {t("cliProxyApi.managementDocsLinkLabel")}
                </Link>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
