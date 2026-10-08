import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import {
  Card,
  CardItem,
  CardList,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { getSiteRouteConfigForKey, SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { createTab } from "~/utils/browser/tabs"
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
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.veloera,
    defaults: DEFAULT_PREFERENCES.veloera,
    reset: resetVeloeraConfig,
    fields: {
      baseUrl: {
        setting: t("veloera.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedComparison,
        update: (value, options) => updateVeloeraBaseUrl(value, options),
      },
      adminToken: {
        setting: t("veloera.fields.adminTokenLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedComparison,
        update: (value, options) => updateVeloeraAdminToken(value, options),
      },
      userId: {
        setting: t("veloera.fields.userIdLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.UserIdComparison,
        update: (value, options) => updateVeloeraUserId(value, options),
      },
    },
  })
  const localBaseUrl = localConfig.baseUrl
  const localAdminToken = localConfig.adminToken
  const localUserId = localConfig.userId

  const trimmedBaseUrl = localBaseUrl.trim()
  const userIdError =
    localUserId.trim() !== "" &&
    !isManagedSiteAdminUserIdInputValid(localUserId)
      ? t("messages:errors.validation.userIdNumeric")
      : undefined
  const adminCredentialsPath = getSiteRouteConfigForKey(
    SITE_TYPES.VELOERA,
  ).adminCredentialsPath
  const adminCredentialsUrl =
    trimmedBaseUrl && adminCredentialsPath
      ? joinUrl(trimmedBaseUrl, adminCredentialsPath)
      : ""
  const shouldShowAdminCredentialsLink = Boolean(adminCredentialsUrl)

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
      titleActions={<ManagedSiteDeploymentLink siteType={SITE_TYPES.VELOERA} />}
      id="veloera"
      title={t("veloera.title")}
      description={t("veloera.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="veloera-base-url"
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
                onBlur={(e) => commitField("baseUrl", e.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("veloera.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              id="veloera-admin-credentials-link"
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
            id="veloera-admin-token"
            title={t("veloera.fields.adminTokenLabel")}
            description={t("veloera.tokenDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("veloera.fields.showToken"),
                  hide: t("veloera.fields.hideToken"),
                }}
                value={localAdminToken}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    adminToken: e.target.value,
                  }))
                }
                onBlur={(e) => commitField("adminToken", e.target.value)}
                onKeyDown={blurInputOnEnter}
              />
            }
          />

          <CardItem
            id="veloera-user-id"
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
                onBlur={(e) => commitField("userId", e.target.value)}
                onKeyDown={blurInputOnEnter}
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
