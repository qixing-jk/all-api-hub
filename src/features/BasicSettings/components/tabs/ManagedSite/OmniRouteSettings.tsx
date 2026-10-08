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
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { validateOmniRouteCredential } from "~/services/managedSites/providers/omniroute"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { createTab } from "~/utils/browser/browserApi"
import { joinUrl } from "~/utils/core/url"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "./managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "./useManagedSiteConfigDraft"

/**
 * Configures one self-hosted OmniRoute deployment.
 *
 * Accepts an existing admin-scoped access token generated in the gateway.
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
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.omniroute,
    defaults: DEFAULT_PREFERENCES.omniroute,
    reset: resetOmniRouteConfig,
    fields: {
      baseUrl: {
        setting: t("omniroute.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) => updateOmniRouteBaseUrl(value, options),
      },
      token: {
        setting: t("omniroute.fields.credentialLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateOmniRouteConfig({ token: value }, options),
      },
    },
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
      {...resetProps}
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
                onBlur={(event) => commitField("baseUrl", event.target.value)}
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
                onBlur={(event) => commitField("token", event.target.value)}
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
        </CardList>
      </Card>
    </SettingSection>
  )
}
