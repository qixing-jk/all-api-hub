import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import {
  resolveAccountSiteRouteUrl,
  SITE_ROUTE_KINDS,
} from "~/services/accounts/utils/siteRouteResolver"
import { isManagedSiteAdminUserIdInputValid } from "~/services/managedSites/utils/adminUserId"
import { createTab } from "~/utils/browser/browserApi"
import { runPreferenceUpdateWithToast } from "~/utils/core/toastHelpers"

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
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const verification = useNewApiManagedVerification()
  const localBaseUrl = localConfig.baseUrl
  const localAdminToken = localConfig.adminToken
  const localUserId = localConfig.userId
  const localUsername = localConfig.username
  const localPassword = localConfig.password
  const localTotpSecret = localConfig.totpSecret

  const handleNewApiBaseUrlChange = async (url: string) => {
    if (url === newApiBaseUrl) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.baseUrlLabel"),
      update: (options) => updateNewApiBaseUrl(url, options),
    })
  }

  const handleNewApiAdminTokenChange = async (token: string) => {
    if (token === newApiAdminToken) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.adminTokenLabel"),
      update: (options) => updateNewApiAdminToken(token, options),
    })
  }

  const handleNewApiUserIdChange = async (id: string) => {
    const trimmedId = id.trim()
    if (!isManagedSiteAdminUserIdInputValid(trimmedId)) return

    setLocalConfig((prev) => ({ ...prev, userId: trimmedId }))
    if (trimmedId === newApiUserId) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.userIdLabel"),
      update: (options) => updateNewApiUserId(trimmedId, options),
    })
  }

  const handleNewApiUsernameChange = async (username: string) => {
    const trimmedUsername = username.trim()
    setLocalConfig((prev) => ({ ...prev, username: trimmedUsername }))
    if (trimmedUsername === newApiUsername) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.usernameLabel"),
      update: (options) => updateNewApiUsername(trimmedUsername, options),
    })
  }

  const handleNewApiPasswordChange = async (password: string) => {
    if (password === newApiPassword) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.passwordLabel"),
      update: (options) => updateNewApiPassword(password, options),
    })
  }

  const handleNewApiTotpSecretChange = async (totpSecret: string) => {
    const trimmedTotpSecret = totpSecret.trim()
    setLocalConfig((prev) => ({ ...prev, totpSecret: trimmedTotpSecret }))
    if (trimmedTotpSecret === newApiTotpSecret) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("newApi.fields.totpSecretLabel"),
      update: (options) => updateNewApiTotpSecret(trimmedTotpSecret, options),
    })
  }

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
    try {
      await createTab(adminCredentialsUrl, true)
    } catch {
      window.open(adminCredentialsUrl, "_blank", "noopener,noreferrer")
    }
  }

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
      id="new-api"
      title={t("newApi.title")}
      description={t("newApi.description")}
      onReset={resetNewApiConfig}
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
                onBlur={(e) => handleNewApiBaseUrlChange(e.target.value)}
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
                  onBlur={(e) => handleNewApiAdminTokenChange(e.target.value)}
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
                onBlur={(e) => handleNewApiUserIdChange(e.target.value)}
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
                onBlur={(e) => handleNewApiUsernameChange(e.target.value)}
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
                  onBlur={(e) => handleNewApiPasswordChange(e.target.value)}
                  placeholder={t("newApi.fields.passwordPlaceholder")}
                />
              </div>
            }
          />

          <CardItem
            id="new-api-totp-secret"
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
                  onBlur={(e) => handleNewApiTotpSecretChange(e.target.value)}
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
              >
                {verification.dialogState.isBusy &&
                verification.dialogState.request?.kind === "settings"
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
