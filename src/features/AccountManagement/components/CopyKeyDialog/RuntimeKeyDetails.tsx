import { CheckIcon, ClockIcon } from "@heroicons/react/24/outline"
import { Copy } from "lucide-react"
import { MouseEvent, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { CCSwitchIcon } from "~/components/icons/CCSwitchIcon"
import { CherryIcon } from "~/components/icons/CherryIcon"
import { ClaudeCodeRouterIcon } from "~/components/icons/ClaudeCodeRouterIcon"
import { CliProxyIcon } from "~/components/icons/CliProxyIcon"
import { KiloCodeIcon } from "~/components/icons/KiloCodeIcon"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
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
import {
  accountRuntimeKeyToLegacyAccountToken,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
  type ServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
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
import type { ApiToken, DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"
import {
  formatKeyTime,
  formatQuota,
  formatUsedQuota,
} from "~/utils/core/formatters"
import { showResultToast } from "~/utils/core/toastHelpers"

interface RuntimeKeyDetailsProps {
  runtimeKey: AccountRuntimeKey
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

const SECRET_PREVIEW_PREFIX_LENGTH = 16
const SECRET_PREVIEW_SUFFIX_LENGTH = 6
const SECRET_PREVIEW_MASK_LENGTH = 6

const getSecretPreviewParts = (secret: string) => {
  if (
    secret.length <=
    SECRET_PREVIEW_PREFIX_LENGTH + SECRET_PREVIEW_SUFFIX_LENGTH
  ) {
    return {
      prefix: secret,
      suffix: "",
    }
  }

  return {
    prefix: secret.slice(0, SECRET_PREVIEW_PREFIX_LENGTH),
    suffix: secret.slice(-SECRET_PREVIEW_SUFFIX_LENGTH),
  }
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
 * Displays detailed runtime key metadata, quota information, and export actions inside copy key dialog.
 */
export function RuntimeKeyDetails({
  runtimeKey,
  copiedRuntimeKeyId,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: RuntimeKeyDetailsProps) {
  const { t } = useTranslation(["ui", "keyManagement", "settings"])
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithAccount, openWithCredentials } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)
  const [isCliProxyDialogOpen, setIsCliProxyDialogOpen] = useState(false)
  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)

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
  const secretPreview = getSecretPreviewParts(runtimeKey.secret)

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

    const result = serviceCredentialProfile
      ? await openWithCredentials(
          {
            name: serviceCredentialProfile.name,
            baseUrl: serviceCredentialProfile.baseUrl,
            apiKey: serviceCredentialProfile.apiKey,
          },
          (channelResult) => {
            showResultToast(channelResult)
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
          },
        )

    if (result.opened || result.deferred) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      return
    }

    tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
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

  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-t border-gray-100 bg-gray-50/30 px-3 pb-3">
      {renderKiloCodeExportDialog()}
      {renderClaudeCodeRouterImportDialog()}
      {renderCliProxyExportDialog()}
      {accountToken ? (
        <div className="dark:text-dark-text-secondary mb-3 flex items-center space-x-1 pt-3 text-xs text-gray-500">
          <ClockIcon className="h-3 w-3" />
          <span>
            {t("dialog.copyKey.expireTime", {
              time: formatKeyTime(accountToken.expired_time),
            })}
          </span>
        </div>
      ) : null}

      {accountToken ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
            <div className="dark:text-dark-text-secondary mb-0.5 text-xs text-gray-500">
              {t("dialog.copyKey.usedQuota")}
            </div>
            <div className="dark:text-dark-text-primary text-sm font-semibold text-gray-900">
              {formatUsedQuota(accountToken)}
            </div>
          </div>
          <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
            <div className="dark:text-dark-text-secondary mb-0.5 text-xs text-gray-500">
              {t("dialog.copyKey.remainingQuota")}
            </div>
            <div
              className={`text-sm font-semibold ${
                accountToken.unlimited_quota || accountToken.remain_quota < 0
                  ? "text-green-600"
                  : accountToken.remain_quota < 1000000
                    ? "text-orange-600"
                    : "dark:text-dark-text-primary text-gray-900"
              }`}
            >
              {formatQuota(accountToken)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary rounded border border-gray-100 bg-white p-2">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="dark:text-dark-text-secondary text-xs font-medium tracking-wide text-gray-500 uppercase">
            {t("dialog.copyKey.apiKey")}
          </span>
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
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
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
              )}
            </IconButton>
            <IconButton
              aria-label={t("dialog.copyKey.useInCherry")}
              variant="ghost"
              size="sm"
              onClick={handleUseInCherry}
            >
              <CherryIcon />
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
              aria-label={t("keyManagement:actions.importToManagedSite", {
                site: managedSiteLabel,
              })}
              variant="ghost"
              size="sm"
              onClick={handleImportToManagedSite}
            >
              <ManagedSiteIcon siteType={managedSiteType} size="sm" />
            </IconButton>
          </div>
        </div>
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary dark:text-dark-text-secondary rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs break-all text-gray-700">
          <span className="dark:text-dark-text-primary text-gray-900">
            {secretPreview.prefix}
          </span>
          {secretPreview.suffix ? (
            <>
              <span className="text-gray-400 dark:text-gray-600">
                {"•".repeat(SECRET_PREVIEW_MASK_LENGTH)}
              </span>
              <span className="dark:text-dark-text-primary text-gray-900">
                {secretPreview.suffix}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
