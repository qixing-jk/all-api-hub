import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { MANAGED_SITE_CONFIG_TEXT_POLICIES } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/managedSiteConfigFields"
import { useManagedSiteConfigDraft } from "~/features/BasicSettings/components/tabs/ManagedSite/configuration/useManagedSiteConfigDraft"
import { ManagedSiteDeploymentLink } from "~/features/ManagedSiteWidgets/ManagedSiteDeploymentLink"
import { blurInputOnEnter } from "~/hooks/preferences/useDeferredPreferenceField"
import toast from "~/lib/notify"
import { listMagpieProviders } from "~/services/apiService/magpie/providers"
import { MagpieApiError } from "~/services/apiService/magpie/request"
import { DEFAULT_MAGPIE_CONFIG } from "~/types/magpieConfig"

/** Configure a Magpie Web deployment independently of its inference gateway. */
export default function MagpieSettings() {
  const { t } = useTranslation("settings")
  const { preferences, updateMagpieConfig, resetMagpieConfig } =
    useUserPreferencesContext()
  const savedConfig = useMemo(
    () => ({ ...DEFAULT_MAGPIE_CONFIG, ...preferences.magpie }),
    [preferences.magpie],
  )
  const {
    draft: localConfig,
    setDraft: setLocalConfig,
    commitField,
    resetProps,
  } = useManagedSiteConfigDraft({
    savedConfig,
    savedVersion: preferences.lastUpdated,
    storedConfig: preferences?.magpie,
    defaults: DEFAULT_MAGPIE_CONFIG,
    reset: resetMagpieConfig,
    fields: {
      webKey: {
        setting: t("magpie.fields.webKeyLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateMagpieConfig({ webKey: value }, options),
      },
      baseUrl: {
        setting: t("magpie.fields.baseUrlLabel"),
        policy: MANAGED_SITE_CONFIG_TEXT_POLICIES.Trimmed,
        update: (value, options) =>
          updateMagpieConfig({ baseUrl: value }, options),
      },
    },
  })
  const [isValidating, setIsValidating] = useState(false)

  const handleValidateConfig = async () => {
    const baseUrl = localConfig.baseUrl.trim()
    const webKey = localConfig.webKey.trim()
    if (!baseUrl || !webKey) {
      toast.error(t("magpie.validation.missingFields"))
      return
    }

    setLocalConfig({ baseUrl, webKey })
    setIsValidating(true)
    try {
      await listMagpieProviders({ baseUrl, webKey })
      toast.success(t("magpie.validation.success"))
    } catch (error) {
      toast.error(
        error instanceof MagpieApiError && error.status === 401
          ? t("magpie.validation.invalidCredential")
          : t("magpie.validation.failed"),
      )
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <SettingSection
      titleActions={<ManagedSiteDeploymentLink siteType={SITE_TYPES.MAGPIE} />}
      id={SETTINGS_ANCHORS.MAGPIE}
      title={t("magpie.title")}
      description={t("magpie.description")}
      {...resetProps}
      resetRequiresConfirmation
      resetDescription={t("settings:messages.resetConnectionConfirmDesc")}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id={SETTINGS_ANCHORS.MAGPIE_BASE_URL}
            title={t("magpie.fields.baseUrlLabel")}
            description={t("magpie.fields.baseUrlDesc")}
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
                placeholder={t("magpie.fields.baseUrlPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.MAGPIE_WEB_KEY}
            title={t("magpie.fields.webKeyLabel")}
            description={t("magpie.fields.webKeyDesc")}
            rightContent={
              <Input
                type="password"
                revealable
                revealLabels={{
                  show: t("magpie.fields.showWebKey"),
                  hide: t("magpie.fields.hideWebKey"),
                }}
                value={localConfig.webKey}
                onChange={(event) =>
                  setLocalConfig((current) => ({
                    ...current,
                    webKey: event.target.value,
                  }))
                }
                onBlur={(event) => commitField("webKey", event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("magpie.fields.webKeyPlaceholder")}
              />
            }
          />

          <CardItem
            id={SETTINGS_ANCHORS.MAGPIE_VALIDATE}
            title={t("magpie.validation.title")}
            description={t("magpie.validation.description")}
            rightContent={
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateConfig}
                loading={isValidating}
              >
                {isValidating
                  ? t("magpie.validation.validating")
                  : t("magpie.validation.validate")}
              </Button>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
