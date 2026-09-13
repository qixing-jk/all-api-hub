import { Plug } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import {
  BodySmall,
  Button,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"
import { CLOUD_SYNC_PROVIDERS } from "~/types/webdav"

import type { WebdavConfigState } from "../hooks/useWebdavConfig"
import { WEBDAV_TARGET_IDS } from "../searchTargets"
import { CloudSyncEncryptionSettings } from "./CloudSyncEncryptionSettings"
import { FieldHelpPopover } from "./FieldHelpPopover"
import { webDavSettingsSurface } from "./webDavAnalytics"
import { WebdavSyncDataSettings } from "./WebdavSyncDataSettings"

/** Render provider credentials and encryption using the shared settings draft. */
export function WebdavConnectionSettings({
  config,
  backupActions,
}: {
  config: WebdavConfigState
  backupActions?: ReactNode
}) {
  const { t } = useTranslation("importExport")
  const {
    provider,
    githubGist,
    githubGistToken,
    githubGistId,
    webdavUrl,
    webdavUsername,
    webdavPassword,
    setLocalConfig,
    webdavConfigFilled,
    saveFailed,
    retrySave,
    saveConnectionField,
    testing,
    handleProviderChange,
    handleTestConnection,
  } = config
  return (
    <>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug
            className="size-5 text-sky-600 dark:text-sky-400"
            aria-hidden="true"
          />
          <CardTitle className="m-0 text-base">
            {t("webdav.connection.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent
        id={WEBDAV_TARGET_IDS.saveConfig}
        padding="md"
        className="space-y-4"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <BodySmall className="m-0">
                {t("webdav.provider.description")}
              </BodySmall>
            </div>
            <ResponsiveToggleGroup
              id={WEBDAV_TARGET_IDS.provider}
              aria-label={t("webdav.provider.label")}
              value={provider}
              onValueChange={handleProviderChange}
              showActiveIndicator
              options={[
                {
                  value: CLOUD_SYNC_PROVIDERS.WEBDAV,
                  label: t("webdav.provider.webdav"),
                },
                {
                  value: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
                  label: t("webdav.provider.githubGist"),
                },
              ]}
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <BodySmall className="m-0">
                {t(
                  provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
                    ? "webdav.gist.configDesc"
                    : "webdav.connection.webdavDescription",
                )}
              </BodySmall>
            </div>

            {provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  label={
                    <span className="inline-flex items-center gap-1">
                      {t("webdav.gist.token")}
                      <FieldHelpPopover
                        label={t("webdav.gist.token")}
                        content={t("webdav.gist.tokenDesc")}
                      />
                    </span>
                  }
                  htmlFor={WEBDAV_TARGET_IDS.gistToken}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.gistToken}
                    onBlur={(event) =>
                      saveConnectionField("token", event.currentTarget.value)
                    }
                    title={t("webdav.gist.token")}
                    type="password"
                    revealable
                    revealLabels={{
                      show: t("webdav.showPassword"),
                      hide: t("webdav.hidePassword"),
                    }}
                    placeholder={t("webdav.gist.tokenPlaceholder")}
                    value={githubGistToken}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        githubGist: {
                          ...prev.githubGist,
                          token: e.target.value,
                        },
                      }))
                    }
                  />
                </FormField>

                <FormField
                  label={t("webdav.gist.id")}
                  htmlFor={WEBDAV_TARGET_IDS.gistId}
                  description={t("webdav.gist.idDesc")}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.gistId}
                    onBlur={(event) =>
                      saveConnectionField("gistId", event.currentTarget.value)
                    }
                    title={t("webdav.gist.id")}
                    type="text"
                    placeholder={t("webdav.gist.idPlaceholder")}
                    value={githubGistId}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        githubGist: {
                          ...prev.githubGist,
                          gistId: e.target.value,
                        },
                      }))
                    }
                  />
                </FormField>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <FormField
                    label={t("webdav.webdavUrl")}
                    htmlFor={WEBDAV_TARGET_IDS.url}
                  >
                    <Input
                      id={WEBDAV_TARGET_IDS.url}
                      onBlur={(event) =>
                        saveConnectionField("url", event.currentTarget.value)
                      }
                      title={t("webdav.webdavUrl")}
                      type="url"
                      placeholder={t("webdav.webdavUrlExample")}
                      value={webdavUrl}
                      onChange={(e) =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          url: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                </div>

                <FormField
                  label={t("webdav.username")}
                  htmlFor={WEBDAV_TARGET_IDS.username}
                >
                  <Input
                    id={WEBDAV_TARGET_IDS.username}
                    onBlur={(event) =>
                      saveConnectionField("username", event.currentTarget.value)
                    }
                    title={t("webdav.username")}
                    type="text"
                    placeholder={t("webdav.username")}
                    value={webdavUsername}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({
                        ...prev,
                        username: e.target.value,
                      }))
                    }
                  />
                </FormField>

                <FormField
                  label={t("webdav.password")}
                  htmlFor={WEBDAV_TARGET_IDS.password}
                >
                  <div className="relative">
                    <Input
                      id={WEBDAV_TARGET_IDS.password}
                      onBlur={(event) =>
                        saveConnectionField(
                          "password",
                          event.currentTarget.value,
                        )
                      }
                      title={t("webdav.password")}
                      type="password"
                      revealable
                      revealLabels={{
                        show: t("webdav.showPassword"),
                        hide: t("webdav.hidePassword"),
                      }}
                      placeholder={t("webdav.password")}
                      value={webdavPassword}
                      onChange={(e) =>
                        setLocalConfig((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                    />
                  </div>
                </FormField>
              </div>
            )}
          </div>

          <CloudSyncEncryptionSettings config={config} />
        </div>
        <WebdavSyncDataSettings config={config} />
        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.WebDavSync}
          surfaceId={webDavSettingsSurface}
        >
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button
              id={WEBDAV_TARGET_IDS.testConnection}
              onClick={handleTestConnection}
              disabled={!webdavConfigFilled}
              loading={testing}
              variant="secondary"
              size="sm"
            >
              {testing
                ? t("common:status.testing")
                : t("webdav.testConnection")}
            </Button>
            {saveFailed && (
              <Button onClick={retrySave} variant="secondary" size="sm">
                {t("webdav.retrySave")}
              </Button>
            )}
            {provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST &&
              githubGist.gistUrl && (
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                >
                  <a
                    id={WEBDAV_TARGET_IDS.gistUrl}
                    href={githubGist.gistUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("webdav.gist.openLink")}
                  </a>
                </Button>
              )}
            <div className="flex flex-wrap gap-3 sm:ml-auto">
              {backupActions}
            </div>
          </div>
        </ProductAnalyticsScope>
      </CardContent>
    </>
  )
}
