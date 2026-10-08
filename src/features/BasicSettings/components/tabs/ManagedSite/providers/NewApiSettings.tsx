import { useMemo } from "react"
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
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { ManagedSiteDeploymentLink } from "~/features/ManagedSiteWidgets/ManagedSiteDeploymentLink"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { createTab } from "~/utils/browser/tabs"

/**
 * Settings panel for configuring New API connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the New API config.
 */
export default function NewApiSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    newApiBaseUrl,
    newApiAdminToken,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
    updateNewApiBaseUrl,
    updateNewApiAdminToken,
    updateNewApiUserId,
    updateNewApiUsername,
    updateNewApiPassword,
    updateNewApiTotpSecret,
    resetNewApiConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({
      baseUrl: newApiBaseUrl,
      adminToken: newApiAdminToken,
      userId: newApiUserId,
      username: newApiUsername,
      password: newApiPassword,
      totpSecret: newApiTotpSecret,
    }),
    [
      newApiAdminToken,
      newApiBaseUrl,
      newApiPassword,
      newApiTotpSecret,
      newApiUserId,
      newApiUsername,
    ],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.newApi,
    defaults: DEFAULT_PREFERENCES.newApi,
    reset: resetNewApiConfig,
    fields: {
      baseUrl: {
        setting: t("newApi.fields.baseUrlLabel"),
        update: (value, options) => updateNewApiBaseUrl(value, options),
      },
      adminToken: {
        setting: t("newApi.fields.adminTokenLabel"),
        update: (value, options) => updateNewApiAdminToken(value, options),
      },
      userId: {
        setting: t("newApi.fields.userIdLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.UserId,
        update: (value, options) => updateNewApiUserId(value, options),
      },
      username: {
        setting: t("newApi.fields.usernameLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedDraft,
        update: (value, options) => updateNewApiUsername(value, options),
      },
      password: {
        setting: t("newApi.fields.passwordLabel"),
        update: (value, options) => updateNewApiPassword(value, options),
      },
      totpSecret: {
        setting: t("newApi.fields.totpSecretLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.TrimmedDraft,
        update: (value, options) => updateNewApiTotpSecret(value, options),
      },
    },
  })
  const verification = useNewApiManagedVerification()
  const localBaseUrl = localConfig.baseUrl
  const localAdminToken = localConfig.adminToken
  const localUserId = localConfig.userId
  const localUsername = localConfig.username
  const localPassword = localConfig.password
  const localTotpSecret = localConfig.totpSecret

  const trimmedBaseUrl = localBaseUrl.trim()
  const userIdError =
    localUserId.trim() !== "" &&
    !isManagedSiteAdminUserIdInputValid(localUserId)
      ? t("messages:errors.validation.userIdNumeric")
      : undefined
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const handleOpenAdminCredentials = async () => {
    if (!shouldShowAdminCredentialsLink) return
    const adminCredentialsUrl = await resolveAccountSiteRouteUrl(
      { baseUrl: trimmedBaseUrl, siteType: SITE_TYPES.NEW_API },
      SITE_ROUTE_KINDS.AdminCredentials,
    )
    if (!adminCredentialsUrl) return
    try {
      await createTab(adminCredentialsUrl, true)
    } catch {
      window.open(adminCredentialsUrl, "_blank", "noopener,noreferrer")
    }
  }

  /** The dialog also serves token and channel flows; only this tab owns this button's busy state. */
  const isTestingManagedSession =
    verification.dialogState.isBusy &&
    verification.dialogState.request?.kind === "settings"

  const handleTestManagedSession = () => {
    verification.openNewApiManagedVerification({
      kind: "settings",
      config: {
        baseUrl: trimmedBaseUrl,
        userId: localUserId,
        username: localUsername,
        password: localPassword,
        totpSecret: localTotpSecret,
      },
    })
  }

  return (
    <SettingSection
      titleActions={<ManagedSiteDeploymentLink siteType={SITE_TYPES.NEW_API} />}
      id="new-api"
      title={t("newApi.title")}
      description={t("newApi.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="new-api-base-url"
            title={t("newApi.fields.baseUrlLabel")}
            description={t("newApi.urlDesc")}
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
                placeholder={t("newApi.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
              id="new-api-admin-credentials-link"
              title={t("newApi.adminCredentialsLink.title")}
              description={t("newApi.adminCredentialsLink.description")}
              rightContent={
                <WorkflowTransitionButton
                  variant="link"
                  size="sm"
                  onClick={handleOpenAdminCredentials}
                >
                  {t("newApi.adminCredentialsLink.open")}
                </WorkflowTransitionButton>
              }
            />
          )}

          <CardItem
            id="new-api-admin-token"
            title={t("newApi.fields.adminTokenLabel")}
            description={t("newApi.tokenDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("newApi.fields.showToken"),
                    hide: t("newApi.fields.hideToken"),
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
              </div>
            }
          />

          <CardItem
            id="new-api-user-id"
            title={t("newApi.fields.userIdLabel")}
            description={t("newApi.userIdDesc")}
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

          <CardItem
            id="new-api-username"
            title={t("newApi.fields.usernameLabel")}
            description={t("newApi.fields.usernameDesc")}
            rightContent={
              <Input
                type="text"
                value={localUsername}
                onChange={(e) =>
                  setLocalConfig((prev) => ({
                    ...prev,
                    username: e.target.value,
                  }))
                }
                onBlur={(e) => commitField("username", e.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("newApi.fields.usernamePlaceholder")}
              />
            }
          />

          <CardItem
            id="new-api-password"
            title={t("newApi.fields.passwordLabel")}
            description={t("newApi.fields.passwordDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("newApi.fields.showPassword"),
                    hide: t("newApi.fields.hidePassword"),
                  }}
                  value={localPassword}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  onBlur={(e) => commitField("password", e.target.value)}
                  onKeyDown={blurInputOnEnter}
                  placeholder={t("newApi.fields.passwordPlaceholder")}
                />
              </div>
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.NEW_API_TOTP_SECRET}
            title={t("newApi.fields.totpSecretLabel")}
            description={t("newApi.fields.totpSecretDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type="password"
                  revealable
                  revealLabels={{
                    show: t("newApi.fields.showTotpSecret"),
                    hide: t("newApi.fields.hideTotpSecret"),
                  }}
                  value={localTotpSecret}
                  onChange={(e) =>
                    setLocalConfig((prev) => ({
                      ...prev,
                      totpSecret: e.target.value,
                    }))
                  }
                  onBlur={(e) => commitField("totpSecret", e.target.value)}
                  onKeyDown={blurInputOnEnter}
                  placeholder={t("newApi.fields.totpSecretPlaceholder")}
                />
              </div>
            }
          />

          <CardItem
            id="new-api-session-test"
            title={t("newApi.sessionTest.title")}
            description={t("newApi.sessionTest.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestManagedSession}
                disabled={!trimmedBaseUrl || verification.dialogState.isBusy}
                loading={isTestingManagedSession}
              >
                {isTestingManagedSession
                  ? t("newApi.sessionTest.testing")
                  : t("newApi.sessionTest.action")}
              </Button>
            }
          />
        </CardList>
      </Card>

      <NewApiManagedVerificationDialog
        isOpen={verification.dialogState.isOpen}
        step={verification.dialogState.step}
        request={verification.dialogState.request}
        code={verification.dialogState.code}
        errorMessage={verification.dialogState.errorMessage}
        isBusy={verification.dialogState.isBusy}
        busyMessage={verification.dialogState.busyMessage}
        onCodeChange={verification.setCode}
        onClose={verification.closeDialog}
        onSubmit={verification.submitCode}
        onRetry={verification.retryVerification}
        onOpenSite={verification.openBaseUrl}
        onUpdateRequestConfig={verification.patchRequestConfig}
      />
    </SettingSection>
  )
}
