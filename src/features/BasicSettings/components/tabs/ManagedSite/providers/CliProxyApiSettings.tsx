import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card, CardItem, CardList, Input, Link } from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { ManagedSiteDeploymentLink } from "~/features/ManagedSiteWidgets/ManagedSiteDeploymentLink"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import {
  CliProxyApiError,
  listAllCliProxyApiProviders,
} from "~/services/apiService/cliProxyApi"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"

const CLI_PROXY_CONNECTION_HTTP_STATUS = {
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
} as const

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
    commitField,
    resetProps,
    checkConnection,
    isValidating: isCheckingConnection,
    connectionCheckLabel,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.cliProxyApi,
    defaults: DEFAULT_PREFERENCES.cliProxyApi,
    reset: resetCliProxyApiConfig,
    fields: {
      baseUrl: {
        setting: t("cliProxyApi.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedComparison,
        update: (value, options) => updateCliProxyApiBaseUrl(value, options),
      },
      managementKey: {
        setting: t("cliProxyApi.managementKeyLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedComparison,
        update: (value, options) =>
          updateCliProxyApiManagementKey(value, options),
      },
    },
  })
  const localBaseUrl = localConfig.baseUrl
  const localKey = localConfig.managementKey
  const runConnectionCheck = async () => {
    await checkConnection(localConfig, async (config) => {
      try {
        await listAllCliProxyApiProviders({
          baseUrl: config.baseUrl,
          adminToken: config.managementKey,
        })
        return { success: true }
      } catch (error) {
        const status =
          error instanceof CliProxyApiError ? error.status : undefined
        const message =
          status === CLI_PROXY_CONNECTION_HTTP_STATUS.Unauthorized
            ? t("messages:cliProxyApi.managementApiInvalidKey")
            : status === CLI_PROXY_CONNECTION_HTTP_STATUS.Forbidden
              ? t("messages:cliProxyApi.managementApiForbidden")
              : status === CLI_PROXY_CONNECTION_HTTP_STATUS.NotFound
                ? t("messages:cliProxyApi.managementApiNotFound")
                : status
                  ? t("messages:cliProxyApi.managementApiHttpError", { status })
                  : t("messages:cliProxyApi.managementApiUnreachable")
        return { success: false, message }
      }
    })
  }

  return (
    <SettingSection
      titleActions={
        <ManagedSiteDeploymentLink siteType={SITE_TYPES.CLI_PROXY_API} />
      }
      id="cli-proxy"
      title={t("cliProxyApi.title")}
      description={t("cliProxyApi.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="cli-proxy-base-url"
            title={t("cliProxyApi.baseUrlLabel")}
            description={t("cliProxyApi.urlDesc")}
            rightContent={
              <Input
                disabled={isCheckingConnection}
                type="text"
                value={localBaseUrl}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    baseUrl: e.target.value,
                  }))
                }
                onBlur={(e) => commitField("baseUrl", e.target.value)}
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
                  disabled={isCheckingConnection}
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
                  onBlur={(e) => commitField("managementKey", e.target.value)}
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
              <div className="gap-y-density-2 flex flex-col items-start gap-x-2 sm:items-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={isCheckingConnection}
                  onClick={async () => {
                    await runConnectionCheck()
                  }}
                >
                  {connectionCheckLabel}
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
