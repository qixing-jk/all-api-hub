import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { OPTIONS_MENU_ITEM_ICONS } from "~/components/icons/optionsPageIcons"
import { Button, Notice } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import { accountStorage } from "~/services/accounts/accountStorage"
import { canResolveAccountRuntimeKeySecret } from "~/services/accounts/keyProductCapabilities"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { pushWithinOptionsPage } from "~/utils/navigation"

import AxonHubSettings from "./AxonHubSettings"
import ClaudeCodeHubSettings from "./ClaudeCodeHubSettings"
import DoneHubSettings from "./DoneHubSettings"
import ManagedSiteModelSyncSettings from "./managedSiteModelSyncSettings"
import ManagedSiteSelector from "./ManagedSiteSelector"
import ModelRedirectSettings from "./ModelRedirectSettings"
import NewApiSettings from "./NewApiSettings"
import OctopusSettings from "./OctopusSettings"
import Sub2ApiSettings from "./Sub2ApiSettings"
import VeloeraSettings from "./VeloeraSettings"

const gatewayActionClassName = "max-w-full"
const AccountKeysIcon = OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.KEYS]
const ApiKeysIcon =
  OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.API_CREDENTIAL_PROFILES]
const ManagedSiteChannelsIcon =
  OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_CHANNELS]

/**
 * Basic Settings tab aggregating managed site selector, managed site settings,
 * model sync, and model redirect.
 */
export default function ManagedSiteTab() {
  const { t } = useTranslation("settings")
  const { preferences, managedSiteType } = useUserPreferencesContext()
  const [guidedImportAccountId, setGuidedImportAccountId] = useState<
    string | undefined
  >()
  const guidedImportParams = {
    [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
      KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
  }

  useEffect(() => {
    let isCurrent = true

    void accountStorage
      .getAllAccounts()
      .then((accounts) => accountStorage.convertToDisplayData(accounts))
      .then((accounts) => {
        if (isCurrent) {
          setGuidedImportAccountId(
            accounts.find(canResolveAccountRuntimeKeySecret)?.id,
          )
        }
      })
      .catch(() => {
        // Guidance remains useful without an account preselection.
      })

    return () => {
      isCurrent = false
    }
  }, [])
  const isManagedSiteConfigComplete = hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )
  const gatewayTitle = isManagedSiteConfigComplete
    ? t("managedSite.gatewayGuidance.configComplete.title")
    : t("managedSite.gatewayGuidance.unconfigured.title")
  const gatewayDescription = isManagedSiteConfigComplete
    ? t("managedSite.gatewayGuidance.configComplete.description")
    : t("managedSite.gatewayGuidance.unconfigured.description")

  const renderSiteSettings = () => {
    switch (managedSiteType) {
      case SITE_TYPES.OCTOPUS:
        return <OctopusSettings />
      case SITE_TYPES.DONE_HUB:
        return <DoneHubSettings />
      case SITE_TYPES.VELOERA:
        return <VeloeraSettings />
      case SITE_TYPES.AXON_HUB:
        return <AxonHubSettings />
      case SITE_TYPES.CLAUDE_CODE_HUB:
        return <ClaudeCodeHubSettings />
      case SITE_TYPES.SUB2API:
        return <Sub2ApiSettings />
      case SITE_TYPES.NEW_API:
      default:
        return <NewApiSettings />
    }
  }

  return (
    <div className="space-y-6">
      <ManagedSiteSelector />

      {renderSiteSettings()}

      <Notice
        title={gatewayTitle}
        description={gatewayDescription}
        actions={
          isManagedSiteConfigComplete ? (
            <>
              <Button
                type="button"
                size="sm"
                className={gatewayActionClassName}
                leftIcon={<AccountKeysIcon className="h-4 w-4" aria-hidden />}
                onClick={() =>
                  pushWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`, {
                    ...(guidedImportAccountId
                      ? { accountId: guidedImportAccountId }
                      : {}),
                    ...guidedImportParams,
                  })
                }
              >
                {t("managedSite.gatewayGuidance.actions.importAccountKeys")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={gatewayActionClassName}
                leftIcon={<ApiKeysIcon className="h-4 w-4" aria-hidden />}
                onClick={() =>
                  pushWithinOptionsPage(
                    `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`,
                    guidedImportParams,
                  )
                }
              >
                {t("managedSite.gatewayGuidance.actions.importApiKeys")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={gatewayActionClassName}
                leftIcon={
                  <ManagedSiteChannelsIcon className="h-4 w-4" aria-hidden />
                }
                onClick={() =>
                  pushWithinOptionsPage(
                    `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
                  )
                }
              >
                {t("managedSite.gatewayGuidance.actions.viewChannels")}
              </Button>
            </>
          ) : undefined
        }
      />

      {/* These providers do not expose New-API-style model sync or redirect controls. */}
      {managedSiteType !== SITE_TYPES.AXON_HUB &&
        managedSiteType !== SITE_TYPES.CLAUDE_CODE_HUB &&
        managedSiteType !== SITE_TYPES.SUB2API && (
          <>
            <ManagedSiteModelSyncSettings />
            <ModelRedirectSettings />
          </>
        )}
    </div>
  )
}
