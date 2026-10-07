import { useCallback } from "react"

import { type useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { type useManagedSiteKeyStatuses } from "~/features/KeyManagement/hooks/useManagedSiteKeyStatuses"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { type useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { getRecoverableManagedSiteChannelCandidate } from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"

const canRetryNewApiManagedVerification = (
  managedSiteStatus?: ManagedSiteTokenChannelStatus,
) => {
  if (!managedSiteStatus) {
    return false
  }

  if (
    managedSiteStatus.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
  ) {
    return false
  }

  if (
    managedSiteStatus.reason !==
    MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
  ) {
    return false
  }

  return Boolean(
    managedSiteStatus.recovery?.loginCredentialsConfigured ||
      managedSiteStatus.recovery?.authenticatedBrowserSessionExists,
  )
}

const getRecoverableNewApiCandidateChannel = (
  managedSiteStatus?: ManagedSiteTokenChannelStatus,
) => {
  if (!managedSiteStatus) {
    return null
  }

  if (
    managedSiteStatus.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
  ) {
    return null
  }

  if (
    managedSiteStatus.reason !==
    MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
  ) {
    return null
  }

  return getRecoverableManagedSiteChannelCandidate(managedSiteStatus.assessment)
}

type ManagedSiteActionsInput = Pick<
  ReturnType<typeof useUserPreferencesContext>,
  | "managedSiteType"
  | "newApiBaseUrl"
  | "newApiUserId"
  | "newApiUsername"
  | "newApiPassword"
  | "newApiTotpSecret"
> & {
  verification: Pick<
    ReturnType<typeof useNewApiManagedVerification>,
    "openNewApiManagedVerification"
  >
  refreshManagedSiteTokenStatuses: ReturnType<
    typeof useManagedSiteKeyStatuses
  >["refresh"]
  refreshManagedSiteTokenStatusForToken: ReturnType<
    typeof useManagedSiteKeyStatuses
  >["refreshKey"]
  confirmManagedSiteTokenStatusWithChannelKey: ReturnType<
    typeof useManagedSiteKeyStatuses
  >["confirm"]
}
/** Own authenticated channel verification recovery behind explicit user commands. */
export function useKeyManagementManagedSiteActions({
  managedSiteType,
  newApiBaseUrl,
  newApiUserId,
  newApiUsername,
  newApiPassword,
  newApiTotpSecret,
  verification,
  refreshManagedSiteTokenStatuses,
  refreshManagedSiteTokenStatusForToken,
  confirmManagedSiteTokenStatusWithChannelKey,
}: ManagedSiteActionsInput) {
  const handleRefreshManagedSiteStatuses = useCallback(async () => {
    await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
      PROTECTION_BYPASS_SURFACES.Options,
      async (protectionBypassExecution) => {
        await refreshManagedSiteTokenStatuses({
          protectionBypassExecution,
        })
      },
    )
  }, [refreshManagedSiteTokenStatuses])

  const handleManagedSiteVerificationRetry = async (
    runtimeKey: AccountRuntimeKey,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => {
    if (
      getManagedSiteCapabilities(managedSiteType).matching.secretVerification
        ?.kind !== MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION
    ) {
      return
    }

    const candidateChannel =
      getRecoverableNewApiCandidateChannel(managedSiteStatus)

    if (candidateChannel) {
      const resourceRef = candidateChannel.ref
      let resolvedChannelKey = ""

      await loadNewApiChannelKeyWithVerification({
        resourceRef,
        command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        label: runtimeKey.label,
        requestKind: "token",
        config: {
          baseUrl: newApiBaseUrl,
          userId: newApiUserId,
          username: newApiUsername,
          password: newApiPassword,
          totpSecret: newApiTotpSecret,
        },
        setKey: (key) => {
          resolvedChannelKey = key
        },
        onLoaded: async () => {
          await confirmManagedSiteTokenStatusWithChannelKey(
            runtimeKey,
            managedSiteStatus,
            {
              resourceRef,
              channelKey: resolvedChannelKey,
            },
          )
        },
        openVerification: verification.openNewApiManagedVerification,
      })
      return
    }

    const refreshedStatus =
      (await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) =>
          await refreshManagedSiteTokenStatusForToken(runtimeKey, {
            protectionBypassExecution,
          }),
      )) ?? managedSiteStatus

    if (!canRetryNewApiManagedVerification(refreshedStatus)) {
      return
    }

    const refreshedCandidateChannel =
      getRecoverableNewApiCandidateChannel(refreshedStatus)
    if (!refreshedCandidateChannel) {
      return
    }

    verification.openNewApiManagedVerification({
      kind: "token",
      label: runtimeKey.label,
      config: {
        baseUrl: newApiBaseUrl,
        userId: newApiUserId,
        username: newApiUsername,
        password: newApiPassword,
        totpSecret: newApiTotpSecret,
      },
      onVerified: async () => {
        await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
          PROTECTION_BYPASS_SURFACES.Options,
          async (protectionBypassExecution) => {
            await refreshManagedSiteTokenStatusForToken(runtimeKey, {
              protectionBypassExecution,
            })
          },
        )
      },
    })
  }

  const handleManagedSiteImportSuccess = async (
    runtimeKey: AccountRuntimeKey,
  ) => {
    await refreshManagedSiteTokenStatusForToken(runtimeKey)
  }

  return {
    handleRefreshManagedSiteStatuses,
    handleManagedSiteVerificationRetry,
    handleManagedSiteImportSuccess,
  }
}
