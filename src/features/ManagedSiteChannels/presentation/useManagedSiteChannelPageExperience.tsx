import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import Tooltip from "~/components/Tooltip"
import { Button, IconButton, Notice } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import { buildGuidedAccountKeyImportTarget } from "~/features/UnifiedApiGuidance/navigation"
import { accountStorage } from "~/services/accounts/accountStorage"
import { canResolveAccountRuntimeKeySecret } from "~/services/accounts/keyProductCapabilities"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  buildManagedSiteChannelConsoleUrl,
  buildManagedSiteTokenConsoleUrl,
} from "~/services/managedSites/managedSiteConsoleRoutes"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createTab } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { pushWithinOptionsPage } from "~/utils/navigation"

const logger = createLogger("ManagedSiteChannelPageExperience")

type ManagedSiteChannelPageExperience = {
  titleActions?: ReactNode
  description: ReactNode
  configurationMissingNotice: ReactNode
  emptyContent?: ReactNode
}

type Options = {
  siteType: ManagedSiteType
  baseUrl?: string
  isConfigurationMissing: boolean
  isLoadedEmpty: boolean
  canImportChannel: boolean
}

/** Owns the shared gateway guidance shown by both legacy and native routes. */
export function useManagedSiteChannelPageExperience({
  siteType,
  baseUrl = "",
  isConfigurationMissing,
  isLoadedEmpty,
  canImportChannel,
}: Options): ManagedSiteChannelPageExperience {
  const { t } = useTranslation("managedSiteChannels")
  const [importAccountId, setImportAccountId] = useState<string>()
  const [hasCredentialProfiles, setHasCredentialProfiles] = useState(false)
  const [isInventoryLoaded, setIsInventoryLoaded] = useState(false)

  useEffect(() => {
    if (!canImportChannel || isInventoryLoaded) return
    let isCurrent = true

    void Promise.all([
      accountStorage.getAllAccounts().catch((error) => {
        logger.warn(
          "Failed to load account context for gateway guidance",
          error,
        )
        return []
      }),
      apiCredentialProfilesStorage.listProfiles().catch((error) => {
        logger.warn(
          "Failed to load API credential context for gateway guidance",
          error,
        )
        return []
      }),
    ]).then(([accounts, profiles]) => {
      if (!isCurrent) return
      const displayAccounts = accountStorage.convertToDisplayData(accounts)
      setImportAccountId(
        displayAccounts.find(canResolveAccountRuntimeKeySecret)?.id,
      )
      setHasCredentialProfiles(profiles.length > 0)
      setIsInventoryLoaded(true)
    })

    return () => {
      isCurrent = false
    }
  }, [canImportChannel, isInventoryLoaded])

  const channelConsoleUrl = buildManagedSiteChannelConsoleUrl(baseUrl, siteType)
  const tokenConsoleUrl = buildManagedSiteTokenConsoleUrl(baseUrl, siteType)
  const openAccountImport = useCallback(() => {
    const target = buildGuidedAccountKeyImportTarget(importAccountId)
    pushWithinOptionsPage(`#${target.menuItemId}`, target.params)
  }, [importAccountId])
  const openCredentialProfiles = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`, {
      [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
        KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
    })
  }, [])
  const importActions = useMemo(() => {
    if (!isInventoryLoaded) return []
    const account = {
      label: t("gatewayGuidance.empty.importFromAccountKey"),
      onClick: openAccountImport,
    }
    const profile = {
      label: t("gatewayGuidance.empty.importFromApiKeyLibrary"),
      onClick: openCredentialProfiles,
    }
    return !importAccountId && hasCredentialProfiles
      ? [profile, account]
      : [account, profile]
  }, [
    hasCredentialProfiles,
    importAccountId,
    isInventoryLoaded,
    openAccountImport,
    openCredentialProfiles,
    t,
  ])

  return {
    titleActions:
      !isConfigurationMissing && channelConsoleUrl ? (
        <Tooltip content={t("gatewayGuidance.openChannelConsole")}>
          <IconButton
            type="button"
            size="sm"
            variant="outline"
            aria-label={t("gatewayGuidance.openChannelConsole")}
            analyticsAction={{
              featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
              actionId:
                PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelManagement,
              surfaceId:
                PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
              entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
            }}
            onClick={() => void createTab(channelConsoleUrl, true)}
          >
            <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
          </IconButton>
        </Tooltip>
      ) : undefined,
    description: (
      <>
        {t("gatewayGuidance.headerDescription")}{" "}
        {!isConfigurationMissing && tokenConsoleUrl ? (
          <>
            {t("gatewayGuidance.clientHint")}{" "}
            <a
              href={tokenConsoleUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none dark:text-blue-200"
            >
              {t("gatewayGuidance.openTokenConsole")}
            </a>
          </>
        ) : null}
      </>
    ),
    configurationMissingNotice: (
      <Notice
        tone="info"
        className="mx-auto max-w-md text-left"
        description={t("gatewayGuidance.unconfiguredValueDescription")}
      />
    ),
    emptyContent:
      isLoadedEmpty && canImportChannel ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-4 text-center">
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {t("gatewayGuidance.empty.title")}
            </div>
            <div className="text-muted-foreground text-sm">
              {t("gatewayGuidance.empty.description")}
            </div>
          </div>
          <div className="flex w-full max-w-full flex-wrap items-center justify-center gap-2">
            {importActions.map((action, index) => (
              <Button
                key={action.label}
                type="button"
                variant={index === 0 ? "default" : "outline"}
                size="sm"
                className="h-auto min-h-8 max-w-full break-words whitespace-normal"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      ) : undefined,
  }
}
