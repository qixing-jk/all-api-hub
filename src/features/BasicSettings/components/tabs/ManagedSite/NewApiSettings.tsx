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
  WorkflowTransitionButton,
} from "~/components/ui"
import { getSiteApiRouter, NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { createTab } from "~/utils/browser/browserApi"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { joinUrl } from "~/utils/core/url"

/**
 * Settings panel for configuring New API connection credentials (base URL, admin token, user ID).
 * @returns Section containing inputs and reset handling for the New API config.
 */
export default function NewApiSettings() {
  const { t } = useTranslation("settings")
  const {
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

  const [localBaseUrl, setLocalBaseUrl] = useState(newApiBaseUrl)
  const [localAdminToken, setLocalAdminToken] = useState(newApiAdminToken)
  const [showAdminToken, setShowAdminToken] = useState(false)
  const [localUserId, setLocalUserId] = useState(newApiUserId)
  const [localUsername, setLocalUsername] = useState(newApiUsername)
  const [localPassword, setLocalPassword] = useState(newApiPassword)
  const [localTotpSecret, setLocalTotpSecret] = useState(newApiTotpSecret)
  const [showPassword, setShowPassword] = useState(false)
  const [showTotpSecret, setShowTotpSecret] = useState(false)
  const verification = useNewApiManagedVerification()

  useEffect(() => {
    setLocalBaseUrl(newApiBaseUrl)
  }, [newApiBaseUrl])

  useEffect(() => {
    setLocalAdminToken(newApiAdminToken)
  }, [newApiAdminToken])

  useEffect(() => {
    setLocalUserId(newApiUserId)
  }, [newApiUserId])

  useEffect(() => {
    setLocalUsername(newApiUsername)
  }, [newApiUsername])

  useEffect(() => {
    setLocalPassword(newApiPassword)
  }, [newApiPassword])

  useEffect(() => {
    setLocalTotpSecret(newApiTotpSecret)
  }, [newApiTotpSecret])

  const handleNewApiBaseUrlChange = async (url: string) => {
    if (url === newApiBaseUrl) return
    const success = await updateNewApiBaseUrl(url)
    showUpdateToast(success, t("newApi.fields.baseUrlLabel"))
  }

  const handleNewApiAdminTokenChange = async (token: string) => {
    if (token === newApiAdminToken) return
    const success = await updateNewApiAdminToken(token)
    showUpdateToast(success, t("newApi.fields.adminTokenLabel"))
  }

  const handleNewApiUserIdChange = async (id: string) => {
    if (id === newApiUserId) return
    const success = await updateNewApiUserId(id)
    showUpdateToast(success, t("newApi.fields.userIdLabel"))
  }

  const handleNewApiUsernameChange = async (username: string) => {
    const trimmedUsername = username.trim()
    setLocalUsername(trimmedUsername)
    if (trimmedUsername === newApiUsername) return
    const success = await updateNewApiUsername(trimmedUsername)
    showUpdateToast(success, t("newApi.fields.usernameLabel"))
  }

  const handleNewApiPasswordChange = async (password: string) => {
    if (password === newApiPassword) return
    const success = await updateNewApiPassword(password)
    showUpdateToast(success, t("newApi.fields.passwordLabel"))
  }

  const handleNewApiTotpSecretChange = async (totpSecret: string) => {
    const trimmedTotpSecret = totpSecret.trim()
    setLocalTotpSecret(trimmedTotpSecret)
    if (trimmedTotpSecret === newApiTotpSecret) return
    const success = await updateNewApiTotpSecret(trimmedTotpSecret)
    showUpdateToast(success, t("newApi.fields.totpSecretLabel"))
  }

  const trimmedBaseUrl = localBaseUrl.trim()
  const shouldShowAdminCredentialsLink = Boolean(trimmedBaseUrl)
  const adminCredentialsUrl = shouldShowAdminCredentialsLink
    ? joinUrl(trimmedBaseUrl, getSiteApiRouter(NEW_API).adminCredentialsPath)
    : ""

  const handleOpenAdminCredentials = async () => {
    if (!adminCredentialsUrl) return
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
            title={t("newApi.fields.baseUrlLabel")}
            description={t("newApi.urlDesc")}
            rightContent={
              <Input
                type="text"
                value={localBaseUrl}
                onChange={(e) => setLocalBaseUrl(e.target.value)}
                onBlur={(e) => handleNewApiBaseUrlChange(e.target.value)}
                placeholder={t("newApi.fields.baseUrlPlaceholder")}
              />
            }
          />

          {shouldShowAdminCredentialsLink && (
            <CardItem
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
            title={t("newApi.fields.adminTokenLabel")}
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
                        showAdminToken
                          ? t("newApi.fields.hideToken")
                          : t("newApi.fields.showToken")
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
            title={t("newApi.fields.userIdLabel")}
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

          <CardItem
            title={t("newApi.fields.usernameLabel")}
            description={t("newApi.fields.usernameDesc")}
            rightContent={
              <Input
                type="text"
                value={localUsername}
                onChange={(e) => setLocalUsername(e.target.value)}
                onBlur={(e) => handleNewApiUsernameChange(e.target.value)}
                placeholder={t("newApi.fields.usernamePlaceholder")}
              />
            }
          />

          <CardItem
            title={t("newApi.fields.passwordLabel")}
            description={t("newApi.fields.passwordDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={localPassword}
                  onChange={(e) => setLocalPassword(e.target.value)}
                  onBlur={(e) => handleNewApiPasswordChange(e.target.value)}
                  placeholder={t("newApi.fields.passwordPlaceholder")}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword
                          ? t("newApi.fields.hidePassword")
                          : t("newApi.fields.showPassword")
                      }
                    >
                      {showPassword ? (
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
            title={t("newApi.fields.totpSecretLabel")}
            description={t("newApi.fields.totpSecretDesc")}
            rightContent={
              <div className="relative">
                <Input
                  type={showTotpSecret ? "text" : "password"}
                  value={localTotpSecret}
                  onChange={(e) => setLocalTotpSecret(e.target.value)}
                  onBlur={(e) => handleNewApiTotpSecretChange(e.target.value)}
                  placeholder={t("newApi.fields.totpSecretPlaceholder")}
                  rightIcon={
                    <IconButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTotpSecret(!showTotpSecret)}
                      aria-label={
                        showTotpSecret
                          ? t("newApi.fields.hideTotpSecret")
                          : t("newApi.fields.showTotpSecret")
                      }
                    >
                      {showTotpSecret ? (
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
