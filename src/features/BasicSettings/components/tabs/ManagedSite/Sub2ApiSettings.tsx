import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Button, Card, CardItem, CardList, Input } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { blurInputOnEnter } from "~/hooks/useDeferredPreferenceField"
import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"
import { validateSub2ApiManagedSiteConfig } from "~/services/managedSites/providers/sub2api"
import { getErrorMessage } from "~/utils/core/error"
import {
  createVersionedPreferenceSaveOptions,
  getPreferenceWriteFailureMessage,
  runPreferenceUpdateWithToast,
} from "~/utils/core/toastHelpers"

/** Configures the default Admin API Key integration for Sub2API. */
export default function Sub2ApiSettings() {
  const { t } = useTranslation("settings")
  const {
    preferences,
    sub2ApiManagedSiteBaseUrl,
    sub2ApiManagedSiteAdminToken,
    updateSub2ApiManagedSiteBaseUrl,
    updateSub2ApiManagedSiteAdminToken,
    updateSub2ApiManagedSiteConfig,
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
    expectedLastUpdated,
  } = usePreferenceDraft({
    savedValue: savedConfig,
    savedVersion: preferences.lastUpdated,
  })
  const [isValidating, setIsValidating] = useState(false)

  const handleBaseUrlChange = async (value: string) => {
    const baseUrl = value.trim()
    if (baseUrl === sub2ApiManagedSiteBaseUrl) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("sub2apiManagedSite.fields.baseUrlLabel"),
      update: (options) => updateSub2ApiManagedSiteBaseUrl(baseUrl, options),
    })
  }

  const handleAdminApiKeyChange = async (value: string) => {
    const adminToken = value.trim()
    if (adminToken === sub2ApiManagedSiteAdminToken) return
    await runPreferenceUpdateWithToast({
      expectedLastUpdated,
      setting: t("sub2apiManagedSite.fields.adminApiKeyLabel"),
      update: (options) =>
        updateSub2ApiManagedSiteAdminToken(adminToken, options),
    })
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
      const saveResult = await updateSub2ApiManagedSiteConfig(
        { baseUrl, adminToken },
        createVersionedPreferenceSaveOptions(expectedLastUpdated),
      )
      if (saveResult.ok) {
        toast.success(t("sub2apiManagedSite.validation.success"))
      } else {
        toast.error(
          getPreferenceWriteFailureMessage(saveResult.reason, {
            fallback: t("messages.updateFailed", {
              name: t("sub2apiManagedSite.title"),
            }),
          }),
        )
      }
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
      id={SETTINGS_ANCHORS.SUB2API}
      title={t("sub2apiManagedSite.title")}
      description={t("sub2apiManagedSite.description")}
      onReset={resetSub2ApiManagedSiteConfig}
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
                onBlur={(event) => handleBaseUrlChange(event.target.value)}
                onKeyDown={blurInputOnEnter}
                placeholder={t("sub2apiManagedSite.fields.baseUrlPlaceholder")}
              />
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
                onBlur={(event) => handleAdminApiKeyChange(event.target.value)}
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
