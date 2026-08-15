import { Check, Copy } from "lucide-react"
import { useEffect, useMemo, useState, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { CursorPlusIcon } from "~/components/icons/CursorPlusIcon"
import { KelivoIcon } from "~/components/icons/KelivoIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { KiloCodeExportDialog } from "~/components/KiloCodeExportDialog"
import { IconButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import {
  createCliProxyExportPayload,
  createExportAccount,
  createExportToken,
} from "~/features/ApiCredentialProfiles/utils/exportShims"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import {
  accountRuntimeKeyToLegacyAccountToken,
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
  type ServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import type { KelivoProviderExportInput } from "~/services/integrations/kelivo"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"
import { showResultToast } from "~/utils/core/toastHelpers"

interface RuntimeKeyActionControlsProps {
  runtimeKey: AccountRuntimeKey
  actionPolicy: Pick<KeyResourceActionPolicy, "copySecret" | "exportSecret">
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

const buildServiceCredentialExportProfile = (
  account: DisplaySiteData,
  runtimeKey: ServiceCredentialRuntimeKey,
): ApiCredentialProfile => {
  const now = Date.now()
  return {
    id: `service-credential:${account.id}:${runtimeKey.service}`,
    name: buildApiCredentialProfileName({
      accountName: account.name,
      fallbackAccountName: account.name,
      tokenName: runtimeKey.label,
    }),
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: runtimeKey.baseUrl,
    apiKey: runtimeKey.secret,
    tagIds: account.tagIds ?? [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Renders quick-list actions that are permitted by the normalized key policy.
 */
export function RuntimeKeyActionControls({
  runtimeKey,
  actionPolicy,
  copiedRuntimeKeyId,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: RuntimeKeyActionControlsProps) {
  const { t } = useTranslation(["ui", "keyManagement", "settings"])
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
    markGatewayGuidanceOnboardingCompleted,
  } = useUserPreferencesContext()
  const { openWithAccount, openWithCredentials } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)
  const [isCliProxyDialogOpen, setIsCliProxyDialogOpen] = useState(false)
  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)
  const [isCursorPlusDialogOpen, setIsCursorPlusDialogOpen] = useState(false)
  const [kelivoExportInput, setKelivoExportInput] =
    useState<KelivoProviderExportInput | null>(null)

  useEffect(() => {
    if (!actionPolicy.exportSecret) {
      setKelivoExportInput(null)
    }
  }, [actionPolicy.exportSecret])

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
  const accountToken = isAccountTokenRuntimeKey(runtimeKey)
    ? runtimeKey.token
    : null
  const serviceCredentialProfile = useMemo(
    () =>
      isServiceCredentialRuntimeKey(runtimeKey)
        ? buildServiceCredentialExportProfile(account, runtimeKey)
        : null,
    [account, runtimeKey],
  )
  const kelivoActionId = serviceCredentialProfile
    ? PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode
    : PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKelivoImportCode
  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation()
    void onCopyKey(runtimeKey)
  }

  const handleUseInCherry = async (event: MouseEvent) => {
    event.stopPropagation()
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      if (serviceCredentialProfile) {
        OpenInCherryStudio(
          createExportAccount(serviceCredentialProfile),
          createExportToken(serviceCredentialProfile),
        )
      } else {
        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          account,
          runtimeKey,
        )
        OpenInCherryStudio(
          account,
          accountRuntimeKeyToLegacyAccountToken(resolvedRuntimeKey),
        )
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleOpenKelivoExportDialog = async (event: MouseEvent) => {
    event.stopPropagation()

    try {
      let exportInput: KelivoProviderExportInput
      if (serviceCredentialProfile) {
        exportInput = serviceCredentialProfile
      } else {
        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          account,
          runtimeKey,
        )
        exportInput = {
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          name: buildApiCredentialProfileName({
            accountName: account.name,
            fallbackAccountName: account.name,
            tokenName: resolvedRuntimeKey.label,
          }),
          baseUrl: resolvedRuntimeKey.baseUrl,
          apiKey: resolvedRuntimeKey.secret,
        }
      }

      setKelivoExportInput(exportInput)
    } catch (error) {
      const tracker = startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: kelivoActionId,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error:
            toSanitizedErrorSummary(
              error,
              collectAccountRuntimeKeySecrets([runtimeKey]),
            ) || t("messages:errors.unknown"),
        }),
      })
    }
  }

  const handleExportToCCSwitch = (event: MouseEvent) => {
    event.stopPropagation()
    if (serviceCredentialProfile) {
      onOpenCCSwitchDialog?.(
        createExportToken(serviceCredentialProfile),
        createExportAccount(serviceCredentialProfile),
      )
      return
    }

    const legacyToken = accountRuntimeKeyToLegacyAccountToken(runtimeKey)
    onOpenCCSwitchDialog?.(legacyToken, account)
  }

  const handleImportToManagedSite = async (event: MouseEvent) => {
    event.stopPropagation()
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const result = serviceCredentialProfile
        ? await openWithCredentials(
            {
              name: serviceCredentialProfile.name,
              baseUrl: serviceCredentialProfile.baseUrl,
              apiKey: serviceCredentialProfile.apiKey,
            },
            (channelResult) => {
              showResultToast(channelResult)
              if (channelResult?.success) {
                void markGatewayGuidanceOnboardingCompleted()
              }
            },
            {
              managedSiteStatus: undefined,
            },
          )
        : await openWithAccount(
            account,
            accountRuntimeKeyToLegacyAccountToken(runtimeKey),
            (channelResult) => {
              showResultToast(channelResult)
              if (channelResult?.success) {
                void markGatewayGuidanceOnboardingCompleted()
              }
            },
          )

      if (result.opened || result.deferred) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        return
      }

      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleOpenCliProxyDialog = (event: MouseEvent) => {
    event.stopPropagation()
    if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:cliproxy.configMissing"),
      })
      return
    }
    setIsCliProxyDialogOpen(true)
  }

  const handleOpenClaudeCodeRouter = (event: MouseEvent) => {
    event.stopPropagation()
    if (!claudeCodeRouterBaseUrl) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  const renderKiloCodeExportDialog = () => {
    if (!isKiloCodeDialogOpen) return null

    if (serviceCredentialProfile) {
      return (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => setIsKiloCodeDialogOpen(false)}
          profile={serviceCredentialProfile}
        />
      )
    }

    if (!accountToken) return null

    return (
      <KiloCodeExportDialog
        isOpen={true}
        onClose={() => setIsKiloCodeDialogOpen(false)}
        initialSelectedSiteIds={[account.id]}
        initialSelectedTokenIdsBySite={{
          [account.id]: [`${accountToken.id}`],
        }}
      />
    )
  }

  const renderClaudeCodeRouterImportDialog = () => {
    if (!isClaudeCodeRouterOpen) return null

    if (serviceCredentialProfile) {
      return (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => setIsClaudeCodeRouterOpen(false)}
          account={createExportAccount(serviceCredentialProfile)}
          token={createExportToken(serviceCredentialProfile)}
          routerBaseUrl={claudeCodeRouterBaseUrl}
          routerApiKey={claudeCodeRouterApiKey}
        />
      )
    }

    const legacyToken = accountRuntimeKeyToLegacyAccountToken(runtimeKey)

    return (
      <ClaudeCodeRouterImportDialog
        isOpen={true}
        onClose={() => setIsClaudeCodeRouterOpen(false)}
        account={account}
        token={legacyToken}
        routerBaseUrl={claudeCodeRouterBaseUrl}
        routerApiKey={claudeCodeRouterApiKey}
      />
    )
  }

  const renderCliProxyExportDialog = () => {
    if (!isCliProxyDialogOpen) return null

    if (serviceCredentialProfile) {
      const cliProxyPayload = createCliProxyExportPayload(
        serviceCredentialProfile,
      )

      return (
        <CliProxyExportDialog
          isOpen={true}
          onClose={() => setIsCliProxyDialogOpen(false)}
          account={cliProxyPayload.account}
          token={cliProxyPayload.token}
          apiTypeHint={cliProxyPayload.apiTypeHint}
        />
      )
    }

    const legacyToken = accountRuntimeKeyToLegacyAccountToken(runtimeKey)

    return (
      <CliProxyExportDialog
        isOpen={true}
        onClose={() => setIsCliProxyDialogOpen(false)}
        account={account}
        token={legacyToken}
      />
    )
  }

  if (!actionPolicy.copySecret && !actionPolicy.exportSecret) return null

  return (
    <>
      {renderKiloCodeExportDialog()}
      {isCursorPlusDialogOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => setIsCursorPlusDialogOpen(false)}
          account={account}
          runtimeKey={runtimeKey}
        />
      ) : null}
      {actionPolicy.exportSecret && kelivoExportInput ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={() => setKelivoExportInput(null)}
          initialValue={kelivoExportInput}
          analyticsContext={{
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
            actionId: kelivoActionId,
            surfaceId:
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          }}
        />
      ) : null}
      {renderClaudeCodeRouterImportDialog()}
      {renderCliProxyExportDialog()}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {actionPolicy.copySecret ? (
          <IconButton
            aria-label={
              copiedRuntimeKeyId === runtimeKey.id
                ? t("dialog.copyKey.copied")
                : t("dialog.copyKey.copy")
            }
            variant="ghost"
            size="sm"
            onClick={handleCopy}
          >
            {copiedRuntimeKeyId === runtimeKey.id ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
            )}
          </IconButton>
        ) : null}
        {actionPolicy.exportSecret ? (
          <>
            <IconButton
              aria-label={t("dialog.copyKey.useInCherry")}
              variant="ghost"
              size="sm"
              onClick={handleUseInCherry}
            >
              <CherryIcon />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.copyKelivoImportCode")}
              variant="ghost"
              size="sm"
              onClick={handleOpenKelivoExportDialog}
            >
              <KelivoIcon />
            </IconButton>
            {onOpenCCSwitchDialog && (
              <IconButton
                aria-label={t("dialog.copyKey.exportToCCSwitch")}
                variant="ghost"
                size="sm"
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportToCCSwitchButton
                }
                onClick={handleExportToCCSwitch}
              >
                <CCSwitchIcon />
              </IconButton>
            )}
            <IconButton
              aria-label={t("keyManagement:actions.exportToKiloCode")}
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation()
                setIsKiloCodeDialogOpen(true)
              }}
            >
              <KiloCodeIcon className="dark:text-dark-text-tertiary text-gray-500" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.importToCliProxy")}
              variant="ghost"
              size="sm"
              onClick={handleOpenCliProxyDialog}
            >
              <CliProxyIcon size="sm" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.importToClaudeCodeRouter")}
              variant="ghost"
              size="sm"
              onClick={handleOpenClaudeCodeRouter}
            >
              <ClaudeCodeRouterIcon size="sm" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.exportToCursorPlus")}
              variant="ghost"
              size="sm"
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportToCursorPlusButton
              }
              onClick={(event) => {
                event.stopPropagation()
                setIsCursorPlusDialogOpen(true)
              }}
            >
              <CursorPlusIcon className="dark:text-dark-text-tertiary text-gray-500" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.importToManagedSite", {
                site: managedSiteLabel,
              })}
              variant="ghost"
              size="sm"
              onClick={handleImportToManagedSite}
            >
              <ManagedSiteIcon siteType={managedSiteType} size="sm" />
            </IconButton>
          </>
        ) : null}
      </div>
    </>
  )
}
