import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { getSiteRouteConfigForKey, SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { ManagedSiteDeploymentLink } from "~/features/ManagedSiteWidgets/ManagedSiteDeploymentLink"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { validateSub2ApiManagedSiteConfig } from "~/services/managedSites/providers/sub2api"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { createTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

/** Configures Sub2API management and guides administrators to key setup. */
export default function Sub2ApiSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    sub2ApiManagedSiteBaseUrl,
    sub2ApiManagedSiteAdminToken,
    updateSub2ApiManagedSiteBaseUrl,
    updateSub2ApiManagedSiteAdminToken,
    resetSub2ApiManagedSiteConfig,
  } = useUserPreferencesContext()
  const savedConfig = useMemo(
    () => ({
      baseUrl: sub2ApiManagedSiteBaseUrl,
      adminToken: sub2ApiManagedSiteAdminToken,
    }),
    [sub2ApiManagedSiteAdminToken, sub2ApiManagedSiteBaseUrl],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.sub2apiManagedSite,
    defaults: DEFAULT_PREFERENCES.sub2apiManagedSite,
    reset: resetSub2ApiManagedSiteConfig,
    fields: {
      baseUrl: {
        setting: t("sub2apiManagedSite.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateSub2ApiManagedSiteBaseUrl(value, options),
      },
      adminToken: {
        setting: t("sub2apiManagedSite.fields.adminApiKeyLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateSub2ApiManagedSiteAdminToken(value, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)
  const parsedBaseUrl = tryParseHttpUrl(localConfig.baseUrl)
  const adminCredentialsPath = getSiteRouteConfigForKey(
    SITE_TYPES.SUB2API,
  ).adminCredentialsPath
  const adminCredentialsUrl =
    parsedBaseUrl && adminCredentialsPath
      ? joinUrl(
          `${parsedBaseUrl.origin}${parsedBaseUrl.pathname}`,
          adminCredentialsPath,
        )
      : null

  const handleOpenAdminCredentials = async () => {
    if (!adminCredentialsUrl) return
    try {
      await createTab(adminCredentialsUrl, true)
    } catch {
      window.open(adminCredentialsUrl, "_blank", "noopener,noreferrer")
    }
  }

  const handleValidateConfig = async () => {
    const baseUrl = localConfig.baseUrl.trim()
    const adminToken = localConfig.adminToken.trim()
    if (!baseUrl || !adminToken) {
      toast.error(t("sub2apiManagedSite.validation.missingFields"))
      return
    }

    setLocalConfig({ baseUrl, adminToken })
    setIsValidating(true)
    try {
      await validateSub2ApiManagedSiteConfig({ baseUrl, adminToken })
      toast.success(t("sub2apiManagedSite.validation.success"))
    } catch (error) {
      toast.error(
        t("sub2apiManagedSite.validation.failed", {
          error: getErrorMessage(error),
        }),
      )
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={<ManagedSiteDeploymentLink siteType={SITE_TYPES.SUB2API} />}
      id={SETTINGS_ANCHORS.SUB2API}
      title={t("sub2apiManagedSite.title")}
      description={t("sub2apiManagedSite.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.SUB2API_BASE_URL}
            title={t("sub2apiManagedSite.fields.baseUrlLabel")}
            description={t("sub2apiManagedSite.fields.baseUrlDesc")}
            rightContent={
              <Input
                type="url"
                value={localConfig.baseUrl}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    baseUrl: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("baseUrl", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("sub2apiManagedSite.fields.baseUrlPlaceholder")}
              />
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SUB2API_ADMIN_CREDENTIALS_LINK}
            title={t("sub2apiManagedSite.adminCredentialsLink.title")}
            description={
              adminCredentialsUrl
                ? t("sub2apiManagedSite.adminCredentialsLink.description")
                : t("sub2apiManagedSite.adminCredentialsLink.missingBaseUrl")
            }
            rightContent={
              <WorkflowTransitionButton
                variant="link"
                size="sm"
                disabled={!adminCredentialsUrl}
                onClick={handleOpenAdminCredentials}
              >
                {t("sub2apiManagedSite.adminCredentialsLink.open")}
              </WorkflowTransitionButton>
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SUB2API_ADMIN_API_KEY}
            title={t("sub2apiManagedSite.fields.adminApiKeyLabel")}
            description={t("sub2apiManagedSite.fields.adminApiKeyDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("sub2apiManagedSite.fields.showAdminApiKey"),
                  hide: t("sub2apiManagedSite.fields.hideAdminApiKey"),
                }}
                value={localConfig.adminToken}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    adminToken: event.target.value,
                  }))
                }
                onBlur={(event) =>
                  commitField("adminToken", event.target.value)
                }
                onKeyDown={blurInputOnEnter}
                placeholder={t(
                  "sub2apiManagedSite.fields.adminApiKeyPlaceholder",
                )}
              />
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SUB2API_VALIDATE}
            title={t("sub2apiManagedSite.validation.title")}
            description={t("sub2apiManagedSite.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("sub2apiManagedSite.validation.validating")
                  : t("sub2apiManagedSite.validation.validate")}
              </Button>
            }
          />
          <CardItem
            id={SETTINGS_ANCHORS.SUB2API_DEFAULT_SCOPE}
            title={t("sub2apiManagedSite.defaultScope.title")}
            description={t("sub2apiManagedSite.defaultScope.description")}
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
