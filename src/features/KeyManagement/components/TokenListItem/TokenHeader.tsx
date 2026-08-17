import type { TFunction } from "i18next"
import { RefreshCw } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

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
import { Badge, Button, WorkflowTransitionButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  KeyResourceCardHeader,
  type KeyResourceCardHeaderRenderProps,
} from "~/features/KeyManagement/components/KeyResourceCard"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { supportsManagedSiteBaseUrlChannelLookup } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { AccountToken } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openSettingsTab } from "~/utils/navigation"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import {
  TokenActionButtons,
  type TokenActionButtonsProps,
} from "./TokenActionButtons"

/**
 * Unified logger scoped to the Key Management token header actions.
 */
const logger = createLogger("TokenHeader")

export interface TokenHeaderProps extends TokenActionButtonsProps {
  /** Shared header content and controls owned by the key-resource card. */
  headerProps: KeyResourceCardHeaderRenderProps
  /**
   * Whether a managed-site status check is currently running for the token.
   */
  isManagedSiteStatusChecking?: boolean
  /**
   * Optional callback invoked to recover a New API exact-verification state.
   */
  onManagedSiteVerificationRetry?: (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
}

export const getManagedSiteStatusBadgeVariant = (params: {
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

export const getManagedSiteStatusLabel = (
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

  if (
    params.managedSiteStatus?.status ===
    MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
  ) {
    switch (params.managedSiteStatus.reason) {
      case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.MATCH_REQUIRES_CONFIRMATION:
        return t("keyManagement:managedSiteStatus.badges.requiresConfirmation")
      case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE:
        return t(
          "keyManagement:managedSiteStatus.badges.verificationUnavailable",
        )
      case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.BACKEND_SEARCH_FAILED:
        return t("keyManagement:managedSiteStatus.badges.checkFailed")
      case MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING:
        return t("keyManagement:managedSiteStatus.badges.configMissing")
      default:
        break
    }
  }

  return t("keyManagement:managedSiteStatus.badges.unknown")
}

export const getManagedSiteStatusDescription = (
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
      return t(
        "keyManagement:managedSiteStatus.descriptions.configMissingOptional",
      )
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

export const getManagedSiteSettingsActionLabel = (
  t: TFunction,
  params: {
    isConfigMissing: boolean
  },
) =>
  params.isConfigMissing
    ? t("keyManagement:managedSiteStatus.actions.configureChecks")
    : t("common:labels.settings")

/**
 * Token header displaying name, status badges, and action buttons.
 * @param props Component props container.
 * @param props.headerProps Shared key-resource header content and controls.
 * @param props.association Current API credential-library relationship.
 * @param props.actionPolicy Provider capability policy controlling available token actions.
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
 * @param props.guidedManagedSiteImportRequest Request key that highlights the managed-site import action.
 */
export function TokenHeader({
  headerProps,
  association,
  actionPolicy,
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
  guidedManagedSiteImportRequest,
}: TokenHeaderProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const { managedSiteType } = useUserPreferencesContext()
  const [
    isManagedSiteVerificationRetrying,
    setIsManagedSiteVerificationRetrying,
  ] = useState(false)
  const isManagedSiteStatusSupported =
    supportsManagedSiteBaseUrlChannelLookup(managedSiteType)

  const shouldRenderManagedSiteStatus =
    actionPolicy.exportSecret &&
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
  const isManagedSiteConfigMissing =
    managedSiteStatus?.status === MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN &&
    managedSiteStatus.reason ===
      MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING
  const shouldShowManagedSiteSettingsAction = Boolean(
    (managedSiteRecovery && !canRetryManagedSiteVerification) ||
      isManagedSiteConfigMissing,
  )
  const managedSiteRecoveryMessage = managedSiteRecovery
    ? canRetryManagedSiteVerification
      ? t("managedSiteStatus.recovery.verificationRequired")
      : t("managedSiteStatus.recovery.configureLogin")
    : null

  const handleManagedSiteVerificationRetryClick = () => {
    if (
      isManagedSiteVerificationRetrying ||
      !managedSiteStatus ||
      !onManagedSiteVerificationRetry
    ) {
      return
    }

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryManagedSiteTokenVerification,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setIsManagedSiteVerificationRetrying(true)

    void (async () => {
      try {
        await onManagedSiteVerificationRetry(token, managedSiteStatus)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } catch (error) {
        logger.error("Managed-site verification retry callback failed", error)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        })
      } finally {
        setIsManagedSiteVerificationRetrying(false)
      }
    })()
  }

  const handleOpenManagedSiteSettings = () => {
    void Promise.resolve(
      openSettingsTab("managedSite", {
        preserveHistory: true,
      }),
    ).catch((error) =>
      logger.error("Failed to open managed-site settings", error),
    )
  }

  const providerBadges = shouldRenderManagedSiteStatus ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      {/* managed site status badge with optional description and signal badges - only show if the managed site supports base URL channel lookup and there's a status to show (either checking or a known status) */}
      <Badge
        variant={getManagedSiteStatusBadgeVariant({
          isChecking: isManagedSiteStatusChecking,
          managedSiteStatus,
        })}
        size="sm"
        data-testid={KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge}
      >
        {isManagedSiteStatusChecking ? (
          <RefreshCw className="h-3 w-3 animate-spin" />
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
          testId={KEY_MANAGEMENT_TEST_IDS.managedSiteChannelLinkButton}
        />
      ) : managedSiteAssessment?.searchBaseUrl ? (
        <ManagedSiteChannelLinkButton
          channelName={t("managedSiteStatus.actions.reviewChannels")}
          search={managedSiteAssessment.searchBaseUrl}
          className="h-auto px-0 py-0 text-xs"
          testId={KEY_MANAGEMENT_TEST_IDS.managedSiteChannelLinkButton}
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
          data-testid={
            KEY_MANAGEMENT_TEST_IDS.managedSiteVerificationRetryButton
          }
          loading={isManagedSiteVerificationRetrying}
          onClick={handleManagedSiteVerificationRetryClick}
        >
          {isManagedSiteVerificationRetrying
            ? t("common:status.checking")
            : t("managedSiteStatus.actions.verifyNow")}
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
          {getManagedSiteSettingsActionLabel(t, {
            isConfigMissing: isManagedSiteConfigMissing,
          })}
        </WorkflowTransitionButton>
      ) : null}
    </div>
  ) : undefined

  return (
    <KeyResourceCardHeader
      {...headerProps}
      association={undefined}
      providerBadges={providerBadges}
      actions={
        <>
          {headerProps.actions}
          <TokenActionButtons
            association={association}
            actionPolicy={actionPolicy}
            token={token}
            copyKey={copyKey}
            handleEditToken={handleEditToken}
            handleDeleteToken={handleDeleteToken}
            account={account}
            managedSiteStatus={managedSiteStatus}
            onOpenCCSwitchDialog={onOpenCCSwitchDialog}
            onManagedSiteImportSuccess={onManagedSiteImportSuccess}
            guidedManagedSiteImportRequest={guidedManagedSiteImportRequest}
          />
        </>
      }
    />
  )
}
