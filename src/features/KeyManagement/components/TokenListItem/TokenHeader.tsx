import {
  ArrowPathIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { Copy } from "lucide-react"
import { useState } from "react"
import toast from "react-hot-toast"
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
import {
  getKeySignalLabel,
  getKeySignalTooltip,
  getModelsSignalLabel,
  getModelsSignalTooltip,
  getSignalBadgeVariant,
  getUrlSignalLabel,
  getUrlSignalTooltip,
  SignalBadge,
} from "~/components/ManagedSiteChannelAssessmentSignalHelpers"
import ManagedSiteChannelLinkButton from "~/components/ManagedSiteChannelLinkButton"
import {
  Badge,
  Button,
  Heading6,
  IconButton,
  WorkflowTransitionButton,
} from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  getManagedSiteLabel,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"
import {
  openApiCredentialProfilesPage,
  openSettingsTab,
} from "~/utils/navigation"

/**
 * Unified logger scoped to the Key Management token header actions.
 */
const logger = createLogger("TokenHeader")

/**
 * Build a stable API credential profile name from token and account labels.
 */
function buildApiCredentialProfileName(params: {
  accountName: string
  fallbackAccountName?: string
  tokenName: string
}) {
  const parts = [
    params.accountName,
    params.fallbackAccountName ?? "",
    params.tokenName,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)

  return parts.join(" - ")
}

interface TokenHeaderProps {
  /**
   * Token data with account display name included.
   */
  token: AccountToken
  /**
   * Copy handler for placing the key on clipboard.
   */
  copyKey: (account: DisplaySiteData, token: AccountToken) => Promise<void>
  /**
   * Handler to open the edit dialog for the token.
   */
  handleEditToken: (token: AccountToken) => void
  /**
   * Handler to delete the token.
   */
  handleDeleteToken: (token: AccountToken) => void
  /**
   * Account metadata for linking cross-app actions.
   */
  account: DisplaySiteData
  /**
   * Optional opener for CCSwitch export dialog.
   */
  onOpenCCSwitchDialog?: () => void
  /**
   * Current managed-site status for the token, when available.
   */
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  /**
   * Whether a managed-site status check is currently running for the token.
   */
  isManagedSiteStatusChecking?: boolean
  /**
   * Optional callback invoked after a successful managed-site import.
   */
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  /**
   * Optional callback invoked to recover a New API exact-verification state.
   */
  onManagedSiteVerificationRetry?: (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
}

const getManagedSiteStatusBadgeVariant = (params: {
  isChecking: boolean
  managedSiteStatus?: ManagedSiteTokenChannelStatus
}) => {
  if (params.isChecking) {
    return "info" as const
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
  ) {
    return "success" as const
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED
  ) {
    return "outline" as const
  }

  return "warning" as const
}

const getManagedSiteStatusLabel = (
  t: TFunction,
  params: {
    isChecking: boolean
    managedSiteStatus?: ManagedSiteTokenChannelStatus
  },
) => {
  if (params.isChecking) {
    return t("keyManagement:managedSiteStatus.badges.checking")
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
  ) {
    return t("keyManagement:managedSiteStatus.badges.added")
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED
  ) {
    return t("keyManagement:managedSiteStatus.badges.notAdded")
  }

  return t("keyManagement:managedSiteStatus.badges.unknown")
}

const getManagedSiteStatusDescription = (
  t: TFunction,
  managedSiteStatus?: ManagedSiteTokenChannelStatus,
) => {
  if (!managedSiteStatus) {
    return null
  }

  if ("assessment" in managedSiteStatus) {
    return null
  }

  switch (managedSiteStatus.reason) {
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING:
      return t("keyManagement:managedSiteStatus.descriptions.configMissing")
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED:
      return t(
        "keyManagement:managedSiteStatus.descriptions.inputPreparationFailed",
      )
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BASE_URL_SEARCH_UNSUPPORTED:
      return t(
        "keyManagement:managedSiteStatus.descriptions.baseUrlSearchUnsupported",
      )
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED:
      return t(
        "keyManagement:managedSiteStatus.descriptions.backendSearchFailed",
      )
    default:
      return null
  }
}

/**
 * Renders action buttons for a token (copy, export, edit/delete).
 * @param props Component props container.
 * @param props.token Token being acted upon.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for integrations.
 * @param props.managedSiteStatus Current managed-site status used to reuse duplicate-review results when available.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 * @param props.onManagedSiteImportSuccess Optional managed-site import success callback.
 */
function TokenActionButtons({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  managedSiteStatus,
  onOpenCCSwitchDialog,
  onManagedSiteImportSuccess,
}: TokenHeaderProps) {
  const { t } = useTranslation(["keyManagement", "settings"])
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { openWithAccount } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)
  const [isCliProxyDialogOpen, setIsCliProxyDialogOpen] = useState(false)
  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const handleImportToManagedSite = async () => {
    await openWithAccount(
      account,
      token,
      (result) => {
        showResultToast(result)

        if (result?.success && onManagedSiteImportSuccess) {
          void Promise.resolve(onManagedSiteImportSuccess(token)).catch(
            (error) =>
              logger.error(
                "Managed-site import success callback failed",
                error,
              ),
          )
        }
      },
      {
        managedSiteStatus,
      },
    )
  }

  const handleOpenCliProxyDialog = () => {
    if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:cliproxy.configMissing"),
      })
      return
    }
    setIsCliProxyDialogOpen(true)
  }

  const handleOpenClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  const handleUseInCherry = async () => {
    try {
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
      )
      OpenInCherryStudio(account, resolvedToken)
    } catch (error) {
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error),
        }),
      })
    }
  }

  const handleSaveToApiCredentialProfiles = async () => {
    const apiType: ApiVerificationApiType = API_TYPES.OPENAI_COMPATIBLE
    const profileName = buildApiCredentialProfileName({
      accountName: account.name,
      fallbackAccountName: token.accountName,
      tokenName: token.name,
    })
    let resolvedToken = token

    try {
      resolvedToken = await resolveDisplayAccountTokenForSecret(account, token)
      const profile = await apiCredentialProfilesStorage.createProfile({
        name: profileName,
        apiType,
        baseUrl: account.baseUrl,
        apiKey: resolvedToken.key,
        tagIds: account.tagIds ?? [],
      })
      toast.success(
        (toastInstance) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">
              {t("keyManagement:messages.savedToApiProfiles", {
                name: profile.name,
              })}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              onClick={() => {
                openApiCredentialProfilesPage()
                toast.dismiss(toastInstance.id)
              }}
            >
              {t("keyManagement:actions.openApiProfiles")}
            </button>
          </div>
        ),
        { duration: 8000 },
      )
    } catch (error) {
      logger.error("Failed to save token to API profiles", {
        message: toSanitizedErrorSummary(
          error,
          [
            token.key,
            resolvedToken.key,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })
      toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <KiloCodeExportDialog
        isOpen={isKiloCodeDialogOpen}
        onClose={() => setIsKiloCodeDialogOpen(false)}
        initialSelectedSiteIds={[account.id]}
        initialSelectedTokenIdsBySite={{ [account.id]: [`${token.id}`] }}
      />
      <ClaudeCodeRouterImportDialog
        isOpen={isClaudeCodeRouterOpen}
        onClose={() => setIsClaudeCodeRouterOpen(false)}
        account={account}
        token={token}
        routerBaseUrl={claudeCodeRouterBaseUrl}
        routerApiKey={claudeCodeRouterApiKey}
      />
      <CliProxyExportDialog
        isOpen={isCliProxyDialogOpen}
        onClose={() => setIsCliProxyDialogOpen(false)}
        account={account}
        token={token}
      />
      <IconButton
        aria-label={t("common:actions.copyKey")}
        size="sm"
        variant="ghost"
        onClick={() => void copyKey(account, token)}
      >
        <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
      </IconButton>
      <IconButton
        aria-label={t("keyManagement:actions.saveToApiProfiles")}
        size="sm"
        variant="ghost"
        onClick={handleSaveToApiCredentialProfiles}
      >
        <PlusIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
      </IconButton>
      <IconButton
        aria-label={t("actions.useInCherry")}
        size="sm"
        variant="ghost"
        onClick={() => void handleUseInCherry()}
      >
        <CherryIcon />
      </IconButton>
      {onOpenCCSwitchDialog && (
        <IconButton
          aria-label={t("actions.exportToCCSwitch")}
          size="sm"
          variant="ghost"
          onClick={onOpenCCSwitchDialog}
        >
          <CCSwitchIcon />
        </IconButton>
      )}
      <IconButton
        aria-label={t("keyManagement:actions.exportToKiloCode")}
        size="sm"
        variant="ghost"
        onClick={() => setIsKiloCodeDialogOpen(true)}
      >
        <KiloCodeIcon className="dark:text-dark-text-tertiary text-gray-500" />
      </IconButton>
      <IconButton
        aria-label={t("actions.importToCliProxy")}
        size="sm"
        variant="ghost"
        onClick={handleOpenCliProxyDialog}
      >
        <CliProxyIcon size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.importToClaudeCodeRouter")}
        size="sm"
        variant="ghost"
        onClick={handleOpenClaudeCodeRouter}
      >
        <ClaudeCodeRouterIcon size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.importToManagedSite", {
          site: managedSiteLabel,
        })}
        size="sm"
        variant="ghost"
        onClick={handleImportToManagedSite}
      >
        <ManagedSiteIcon siteType={managedSiteType} size="sm" />
      </IconButton>
      <IconButton
        aria-label={t("actions.editKey")}
        size="sm"
        variant="outline"
        onClick={() => handleEditToken(token)}
      >
        <PencilIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
      </IconButton>
      <IconButton
        aria-label={t("actions.deleteKey")}
        size="sm"
        variant="destructive"
        onClick={() => handleDeleteToken(token)}
      >
        <TrashIcon className="h-4 w-4" />
      </IconButton>
    </div>
  )
}

/**
 * Token header displaying name, status badges, and action buttons.
 * @param props Component props container.
 * @param props.token Token entity with account name.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for cross-app operations.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 * @param props.managedSiteStatus Current managed-site status for the token.
 * @param props.isManagedSiteStatusChecking Whether the managed-site status is checking.
 * @param props.onManagedSiteImportSuccess Optional callback after successful managed-site import.
 * @param props.onManagedSiteVerificationRetry Optional callback for New API verification-assisted retry.
 */
export function TokenHeader({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog,
  managedSiteStatus,
  isManagedSiteStatusChecking = false,
  onManagedSiteImportSuccess,
  onManagedSiteVerificationRetry,
}: TokenHeaderProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const { managedSiteType } = useUserPreferencesContext()
  const isManagedSiteStatusSupported =
    supportsManagedSiteBaseUrlChannelLookup(managedSiteType)

  const shouldRenderManagedSiteStatus =
    isManagedSiteStatusSupported &&
    (isManagedSiteStatusChecking || Boolean(managedSiteStatus))
  const managedSiteStatusDescription = getManagedSiteStatusDescription(
    t,
    managedSiteStatus,
  )
  const managedSiteAssessment =
    managedSiteStatus && "assessment" in managedSiteStatus
      ? managedSiteStatus.assessment
      : undefined
  const managedSiteRecovery =
    managedSiteStatus?.status === MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN &&
    managedSiteStatus.reason ===
      MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
      ? managedSiteStatus.recovery
      : undefined
  const canRetryManagedSiteVerification = Boolean(
    managedSiteRecovery?.loginCredentialsConfigured ||
      managedSiteRecovery?.authenticatedBrowserSessionExists,
  )
  const matchedManagedSiteChannel =
    managedSiteStatus && "matchedChannel" in managedSiteStatus
      ? managedSiteStatus.matchedChannel
      : undefined
  const shouldShowManagedSiteVerificationRetry = Boolean(
    canRetryManagedSiteVerification &&
      managedSiteStatus &&
      onManagedSiteVerificationRetry,
  )
  const shouldShowManagedSiteSettingsAction = Boolean(
    managedSiteRecovery && !canRetryManagedSiteVerification,
  )
  const managedSiteRecoveryMessage = managedSiteRecovery
    ? canRetryManagedSiteVerification
      ? t("managedSiteStatus.recovery.verificationRequired")
      : t("managedSiteStatus.recovery.configureLogin")
    : null

  const handleManagedSiteVerificationRetryClick = () => {
    if (!managedSiteStatus || !onManagedSiteVerificationRetry) {
      return
    }

    void Promise.resolve(
      onManagedSiteVerificationRetry(token, managedSiteStatus),
    ).catch((error) =>
      logger.error("Managed-site verification retry callback failed", error),
    )
  }

  const handleOpenManagedSiteSettings = () => {
    void openSettingsTab("managedSite", { preserveHistory: true }).catch(
      (error) => logger.error("Failed to open managed-site settings", error),
    )
  }

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
          <Heading6 className="truncate text-sm sm:text-base md:text-lg">
            {token.name}
          </Heading6>
          <Badge
            variant={token.status === 1 ? "success" : "destructive"}
            size="sm"
          >
            {token.status === 1 ? t("actions.enable") : t("actions.disable")}
          </Badge>
          <Badge variant="outline" size="sm">
            {token.accountName}
          </Badge>
        </div>

        {shouldRenderManagedSiteStatus ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {/* managed site status badge with optional description and signal badges - only show if the managed site supports base URL channel lookup and there's a status to show (either checking or a known status) */}
            <Badge
              variant={getManagedSiteStatusBadgeVariant({
                isChecking: isManagedSiteStatusChecking,
                managedSiteStatus,
              })}
              size="sm"
            >
              {isManagedSiteStatusChecking ? (
                <ArrowPathIcon className="h-3 w-3 animate-spin" />
              ) : null}
              {getManagedSiteStatusLabel(t, {
                isChecking: isManagedSiteStatusChecking,
                managedSiteStatus,
              })}
            </Badge>
            {managedSiteStatusDescription ? (
              <span
                className="break-words whitespace-normal"
                title={managedSiteStatusDescription}
              >
                {managedSiteStatusDescription}
              </span>
            ) : null}
            {managedSiteAssessment ? (
              <>
                <SignalBadge
                  badgeText={getUrlSignalLabel(t, managedSiteAssessment)}
                  tooltipText={getUrlSignalTooltip(t, managedSiteAssessment)}
                  variant={getSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "url",
                  })}
                />
                <SignalBadge
                  badgeText={getKeySignalLabel(t, managedSiteAssessment)}
                  tooltipText={getKeySignalTooltip(
                    t,
                    managedSiteType,
                    managedSiteAssessment,
                  )}
                  variant={getSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "key",
                  })}
                />
                <SignalBadge
                  badgeText={getModelsSignalLabel(t, managedSiteAssessment)}
                  tooltipText={getModelsSignalTooltip(t, managedSiteAssessment)}
                  variant={getSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "models",
                  })}
                />
              </>
            ) : null}

            {/* channel link button - only show if there's a matched channel or a search URL available (which indicates the user can review potential matches on the managed site) */}
            {matchedManagedSiteChannel ? (
              <ManagedSiteChannelLinkButton
                channelName={matchedManagedSiteChannel.name}
                channelId={
                  managedSiteStatus?.status ===
                  MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
                    ? matchedManagedSiteChannel.id
                    : undefined
                }
                search={
                  managedSiteStatus?.status ===
                  MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
                    ? undefined
                    : managedSiteAssessment?.searchBaseUrl
                }
                className="h-auto px-0 py-0 text-xs"
              />
            ) : managedSiteAssessment?.searchBaseUrl ? (
              <ManagedSiteChannelLinkButton
                channelName={t("managedSiteStatus.actions.reviewChannels")}
                search={managedSiteAssessment.searchBaseUrl}
                className="h-auto px-0 py-0 text-xs"
              />
            ) : null}

            {/* verification retry button - only show if the token is in an exact-verification-unavailable unknown status with login credentials configured, which indicates the user can take action to potentially recover to an added status without needing to re-import */}
            {managedSiteRecoveryMessage ? (
              <span className="break-words whitespace-normal">
                {managedSiteRecoveryMessage}
              </span>
            ) : null}
            {shouldShowManagedSiteVerificationRetry ? (
              <Button
                size="sm"
                variant="outline"
                className="h-auto px-2 py-0.5 text-xs"
                onClick={handleManagedSiteVerificationRetryClick}
              >
                {t("managedSiteStatus.actions.verifyNow")}
              </Button>
            ) : null}
            {shouldShowManagedSiteSettingsAction ? (
              <WorkflowTransitionButton
                size="sm"
                variant="outline"
                className="h-auto px-2 py-0.5 text-xs"
                onClick={handleOpenManagedSiteSettings}
                title={managedSiteRecoveryMessage ?? undefined}
              >
                {t("common:labels.settings")}
              </WorkflowTransitionButton>
            ) : null}
          </div>
        ) : null}
      </div>

      <TokenActionButtons
        token={token}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleDeleteToken}
        account={account}
        managedSiteStatus={managedSiteStatus}
        onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />
    </div>
  )
}
