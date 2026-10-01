import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import {
  Button,
  Card,
  CardItem,
  CardList,
  Input,
  WorkflowTransitionButton,
} from "~/components/ui"
import { isOmniRouteAccessToken } from "~/constants/omniroute"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { createPreferenceDraftReset } from "~/features/BasicSettings/components/shared/createPreferenceDraftReset"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import toast from "~/lib/notify"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { validateOmniRouteCredential } from "~/services/managedSites/providers/omniroute"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { createTab } from "~/utils/browser/browserApi"
import { joinUrl } from "~/utils/core/url"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"
import {
  getPreferenceWriteFailureMessage,
  runPreferenceUpdateWithToast,
} from "~/utils/feedback/preferenceFeedback"

/**
 * Configures one self-hosted OmniRoute deployment.
 *
 * Authentication is bearer-only, so the form accepts either an `oma_` scoped
 * access token or the panel password used once to mint one. A password is never
 * persisted: it is exchanged through the gateway's public connect route and only
 * the returned token is stored.
 */
export default function OmniRouteSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    omniRouteBaseUrl,
    omniRouteToken,
    updateOmniRouteBaseUrl,
    updateOmniRouteConfig,
    resetOmniRouteConfig,
  } = useUserPreferencesContext()

  const savedConfig = useMemo(
    () => ({ baseUrl: omniRouteBaseUrl, token: omniRouteToken }),
    [omniRouteBaseUrl, omniRouteToken],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [isValidating, setIsValidating] = useState(false)

  const parsedBaseUrl = tryParseHttpUrl(localConfig.baseUrl)
  const tokensPath =
    getAccountSiteDefinition(SITE_TYPES.OMNIROUTE)?.managedResource
      ?.consoleRoutes.tokens ?? null
  const tokensUrl =
    parsedBaseUrl && tokensPath
      ? joinUrl(`${parsedBaseUrl.origin}${parsedBaseUrl.pathname}`, tokensPath)
      : null

  const handleOpenTokens = async () => {
    if (!tokensUrl) return
    try {
      await createTab(tokensUrl, true)
    } catch {
      window.open(tokensUrl, "_blank", "noopener,noreferrer")
    }
  }

  const handleBaseUrlChange = async (value: string) => {
    const baseUrl = value.trim()
    if (baseUrl === omniRouteBaseUrl) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("omniroute.fields.baseUrlLabel"),
      update: (options) => updateOmniRouteBaseUrl(baseUrl, options),
    })
  }

  const handleCredentialChange = async (value: string) => {
    const credential = value.trim()
    if (credential === omniRouteToken) return
    // A password is a one-time input for minting a token; storing it would keep
    // the gateway's management password in extension preferences.
    if (!isOmniRouteAccessToken(credential)) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("omniroute.fields.credentialLabel"),
      update: (options) =>
        updateOmniRouteConfig({ token: credential }, options),
    })
  }

  const handleValidateConfig = async () => {
    const baseUrl = localConfig.baseUrl.trim()
    const credential = localConfig.token.trim()
    if (!baseUrl || !credential) {
      toast.error(t("omniroute.validation.missingFields"))
      return
    }

    setLocalConfig({ baseUrl, token: credential })
    setIsValidating(true)
    try {
      const result = await validateOmniRouteCredential({ baseUrl, credential })
      switch (result.status) {
        case "valid": {
          // Persist the verified token — for the password path this is the only
          // chance to keep the minted token, since the password is discarded.
          const write = await updateOmniRouteConfig(
            { baseUrl, token: result.token },
            { expectedLastUpdated },
          )
          if (!write.ok) {
            toast.error(
              getPreferenceWriteFailureMessage(write.reason, {
                setting: t("omniroute.fields.credentialLabel"),
              }),
            )
            return
          }
          setLocalConfig({ baseUrl, token: result.token })
          toast.success(t("omniroute.validation.success"))
          return
        }
        case "insufficient-scope":
          toast.error(
            t("omniroute.validation.insufficientScope", {
              have: result.have || t("omniroute.validation.unknownScope"),
              need: result.need,
            }),
          )
          return
        case "default-password-rejected":
          toast.error(t("omniroute.validation.defaultPassword"))
          return
        case "invalid-credential":
          toast.error(
            t("omniroute.validation.invalidCredential", {
              error: result.message,
            }),
          )
          return
        case "unreachable":
        default:
          toast.error(
            t("omniroute.validation.failed", { error: result.message }),
          )
      }
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={
        <ManagedSiteDeploymentLink siteType={SITE_TYPES.OMNIROUTE} />
      }
      id={SETTINGS_ANCHORS.OMNIROUTE}
      title={t("omniroute.title")}
      description={t("omniroute.description")}
      {...createPreferenceDraftReset({
        draft: localConfig,
        storedValue: preferences?.omniroute,
        savedValue: savedConfig,
        defaults: DEFAULT_PREFERENCES.omniroute,
        reset: resetOmniRouteConfig,
        setDraft: setLocalConfig,
      })}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.OMNIROUTE_BASE_URL}
            title={t("omniroute.fields.baseUrlLabel")}
            description={t("omniroute.fields.baseUrlDesc")}
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
                onBlur={(event) => handleBaseUrlChange(event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("omniroute.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.OMNIROUTE_CREDENTIAL}
            title={t("omniroute.fields.credentialLabel")}
            description={t("omniroute.fields.credentialDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("omniroute.fields.showCredential"),
                  hide: t("omniroute.fields.hideCredential"),
                }}
                value={localConfig.token}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    token: event.target.value,
                  }))
                }
                onBlur={(event) => handleCredentialChange(event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("omniroute.fields.credentialPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.OMNIROUTE_TOKENS_LINK}
            title={t("omniroute.accessTokens.title")}
            description={
              tokensUrl
                ? t("omniroute.accessTokens.description")
                : t("omniroute.accessTokens.missingBaseUrl")
            }
            rightContent={
              <WorkflowTransitionButton
                variant="link"
                size="sm"
                disabled={!tokensUrl}
                onClick={handleOpenTokens}
              >
                {t("omniroute.accessTokens.open")}
              </WorkflowTransitionButton>
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.OMNIROUTE_VALIDATE}
            title={t("omniroute.validation.title")}
            description={t("omniroute.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("omniroute.validation.validating")
                  : t("omniroute.validation.validate")}
              </Button>
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.OMNIROUTE_SECURITY_NOTE}
            title={t("omniroute.securityNote.title")}
            description={t("omniroute.securityNote.description")}
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
