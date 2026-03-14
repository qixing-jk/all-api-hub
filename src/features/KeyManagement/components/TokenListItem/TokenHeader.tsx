import {
  ArrowPathIcon,
  DocumentDuplicateIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
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
import ManagedSiteChannelLinkButton from "~/components/ManagedSiteChannelLinkButton"
import Tooltip from "~/components/Tooltip"
import { Badge, Heading6, IconButton } from "~/components/ui"
import { NEW_API } from "~/constants/siteType"
import type { ManagedSiteType } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelAssessment,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  getManagedSiteLabelKey,
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
import { openApiCredentialProfilesPage } from "~/utils/navigation"

/**
 * Unified logger scoped to the Key Management token header actions.
 */
const logger = createLogger("TokenHeader")

/**
 *
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
    return t("managedSiteStatus.badges.checking")
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
  ) {
    return t("managedSiteStatus.badges.added")
  }

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.NOT_ADDED
  ) {
    return t("managedSiteStatus.badges.notAdded")
  }

  return t("managedSiteStatus.badges.unknown")
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
      return t("managedSiteStatus.descriptions.configMissing")
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.INPUT_PREPARATION_FAILED:
      return t("managedSiteStatus.descriptions.inputPreparationFailed")
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.VELOERA_BASE_URL_SEARCH_UNSUPPORTED:
      return t("managedSiteStatus.descriptions.veloeraBaseUrlSearchUnsupported")
    case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED:
      return t("managedSiteStatus.descriptions.backendSearchFailed")
    default:
      return null
  }
}

const appendManagedSiteKeyHintToTooltip = (
  t: TFunction,
  managedSiteType: ManagedSiteType,
  message: string,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  if (
    managedSiteType !== NEW_API ||
    assessment.key.reason !==
      MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE
  ) {
    return message
  }

  return `${message} ${t("managedSiteStatus.descriptions.newApiRetrieveKeyHint")}`
}

const getManagedSiteSignalBadgeVariant = (params: {
  assessment: ManagedSiteTokenChannelAssessment
  signal: "url" | "key" | "models"
}) => {
  if (params.signal === "url") {
    return params.assessment.url.matched
      ? ("success" as const)
      : ("outline" as const)
  }

  if (params.signal === "key") {
    if (params.assessment.key.matched) {
      return "success" as const
    }

    if (
      params.assessment.key.reason ===
        MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED ||
      params.assessment.key.reason ===
        MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE
    ) {
      return "warning" as const
    }

    return "outline" as const
  }

  if (params.assessment.models.matched) {
    return params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      ? ("success" as const)
      : ("info" as const)
  }

  if (
    params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED ||
    params.assessment.models.reason ===
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE
  ) {
    return "warning" as const
  }

  return "outline" as const
}

const getManagedSiteUrlSignalLabel = (
  t: TFunction,
  assessment: ManagedSiteTokenChannelAssessment,
) =>
  assessment.url.matched
    ? t("managedSiteStatus.signals.url.matched")
    : t("managedSiteStatus.signals.url.noMatch")

const getManagedSiteKeySignalLabel = (
  t: TFunction,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  switch (assessment.key.reason) {
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED:
      return t("managedSiteStatus.signals.key.matched")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED:
      return t("managedSiteStatus.signals.key.notProvided")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t("managedSiteStatus.signals.key.unavailable")
    default:
      return t("managedSiteStatus.signals.key.noMatch")
  }
}

const getManagedSiteModelsSignalLabel = (
  t: TFunction,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  switch (assessment.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return t("managedSiteStatus.signals.models.exact")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return t("managedSiteStatus.signals.models.contained")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return t("managedSiteStatus.signals.models.similar")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED:
      return t("managedSiteStatus.signals.models.notProvided")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t("managedSiteStatus.signals.models.unavailable")
    default:
      return t("managedSiteStatus.signals.models.noMatch")
  }
}

const getManagedSiteUrlSignalTooltip = (
  t: TFunction,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  if (assessment.url.matched) {
    return t("managedSiteStatus.signals.url.tooltipMatched", {
      count: assessment.url.candidateCount,
      channelName: assessment.url.channel?.name ?? "",
    })
  }

  return t("managedSiteStatus.signals.url.tooltipNoMatch")
}

const getManagedSiteKeySignalTooltip = (
  t: TFunction,
  managedSiteType: ManagedSiteType,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  switch (assessment.key.reason) {
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED:
      return t("managedSiteStatus.signals.key.tooltipMatched", {
        channelName: assessment.key.channel?.name ?? "",
      })
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED:
      return t("managedSiteStatus.signals.key.tooltipNotProvided")
    case MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return appendManagedSiteKeyHintToTooltip(
        t,
        managedSiteType,
        t("managedSiteStatus.signals.key.tooltipUnavailable"),
        assessment,
      )
    default:
      return t("managedSiteStatus.signals.key.tooltipNoMatch")
  }
}

const getManagedSiteModelsSignalTooltip = (
  t: TFunction,
  assessment: ManagedSiteTokenChannelAssessment,
) => {
  switch (assessment.models.reason) {
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT:
      return t("managedSiteStatus.signals.models.tooltipExact", {
        channelName: assessment.models.channel?.name ?? "",
      })
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED:
      return t("managedSiteStatus.signals.models.tooltipContained", {
        channelName: assessment.models.channel?.name ?? "",
      })
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.SIMILAR:
      return t("managedSiteStatus.signals.models.tooltipSimilar", {
        channelName: assessment.models.channel?.name ?? "",
        score: Math.round((assessment.models.similarityScore ?? 0) * 100),
      })
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED:
      return t("managedSiteStatus.signals.models.tooltipNotProvided")
    case MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE:
      return t("managedSiteStatus.signals.models.tooltipUnavailable")
    default:
      return t("managedSiteStatus.signals.models.tooltipNoMatch")
  }
}

/**
 *
 */
function ManagedSiteSignalBadge(props: {
  badgeText: string
  tooltipText: string
  variant: "success" | "info" | "outline" | "warning"
}) {
  return (
    <Tooltip content={props.tooltipText} position="top">
      <span title={props.tooltipText} className="inline-flex">
        <Badge variant={props.variant} size="sm" className="cursor-help">
          {props.badgeText}
        </Badge>
      </span>
    </Tooltip>
  )
}

/**
 * Renders action buttons for a token (copy, export, edit/delete).
 * @param props Component props container.
 * @param props.token Token being acted upon.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for integrations.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 * @param props.onManagedSiteImportSuccess Optional managed-site import success callback.
 */
function TokenActionButtons({
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
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

  const managedSiteLabel = t(getManagedSiteLabelKey(managedSiteType))

  const handleImportToManagedSite = async () => {
    await openWithAccount(account, token, (result) => {
      showResultToast(result)

      if (result?.success && onManagedSiteImportSuccess) {
        void Promise.resolve(onManagedSiteImportSuccess(token)).catch((error) =>
          logger.error("Managed-site import success callback failed", error),
        )
      }
    })
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
        <DocumentDuplicateIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
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
        aria-label={t("keyManagement:exportToKiloCode")}
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
}: TokenHeaderProps) {
  const { t } = useTranslation("keyManagement")
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
  const matchedManagedSiteChannel =
    managedSiteStatus && "matchedChannel" in managedSiteStatus
      ? managedSiteStatus.matchedChannel
      : undefined

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
                <ManagedSiteSignalBadge
                  badgeText={getManagedSiteUrlSignalLabel(
                    t,
                    managedSiteAssessment,
                  )}
                  tooltipText={getManagedSiteUrlSignalTooltip(
                    t,
                    managedSiteAssessment,
                  )}
                  variant={getManagedSiteSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "url",
                  })}
                />
                <ManagedSiteSignalBadge
                  badgeText={getManagedSiteKeySignalLabel(
                    t,
                    managedSiteAssessment,
                  )}
                  tooltipText={getManagedSiteKeySignalTooltip(
                    t,
                    managedSiteType,
                    managedSiteAssessment,
                  )}
                  variant={getManagedSiteSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "key",
                  })}
                />
                <ManagedSiteSignalBadge
                  badgeText={getManagedSiteModelsSignalLabel(
                    t,
                    managedSiteAssessment,
                  )}
                  tooltipText={getManagedSiteModelsSignalTooltip(
                    t,
                    managedSiteAssessment,
                  )}
                  variant={getManagedSiteSignalBadgeVariant({
                    assessment: managedSiteAssessment,
                    signal: "models",
                  })}
                />
              </>
            ) : null}
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
          </div>
        ) : null}
      </div>

      <TokenActionButtons
        token={token}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleDeleteToken}
        account={account}
        onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
      />
    </div>
  )
}
