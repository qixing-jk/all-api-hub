import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { isAccountKeyResourceRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/configuration/channelDraftSource"
import { getCurrentManagedSiteType } from "~/services/managedSites/configuration/runtimeConfig"
import {
  getManagedSiteChannelExactMatch,
  getRecoverableManagedSiteChannelCandidate,
} from "~/services/managedSites/matching/channelMatch"
import { prepareManagedSiteChannelMatch } from "~/services/managedSites/matching/prepareChannelMatch"
import { createManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { createLogger } from "~/utils/core/logger"
import { openManagedSiteChannelsPage } from "~/utils/navigation"

import {
  addRedactionSecrets,
  addRuntimeKeyRedactionSecrets,
} from "./accountActionSecrets"
import { resolveLocateManagedSiteChannelToastMessage } from "./locateManagedSiteChannelToast"

const logger = createLogger("AccountActionButtons")
/** Resolve a managed resource or fall back to the account URL through existing matching adapters. */
export function useLocateManagedSiteChannel({
  site,
  canLocateManagedSiteChannel,
  isManagedSiteChannelLookupSupported,
}: {
  site: DisplaySiteData
  canLocateManagedSiteChannel: boolean
  isManagedSiteChannelLookupSupported: boolean
}) {
  const { t } = useTranslation([
    "account",
    "shareSnapshots",
    "messages",
    "common",
    "autoCheckin",
  ])
  const handleLocateManagedSiteChannel = async () => {
    if (!canLocateManagedSiteChannel || !isManagedSiteChannelLookupSupported) {
      return
    }

    const accountBaseUrl = site.baseUrl.trim()
    const normalizedAccountBaseUrl =
      normalizeManagedSiteChannelBaseUrl(accountBaseUrl)
    if (!normalizedAccountBaseUrl) {
      return
    }
    const handleChannelLocateFallback = (message: string) => {
      openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
      toast.warning(message)
    }

    const secretsToRedact = new Set<string>()
    addRedactionSecrets(secretsToRedact, [
      site.token,
      site.cookieAuthSessionCookie,
    ])

    try {
      const managedSite = getManagedSiteCapabilities(
        await getCurrentManagedSiteType(),
      )
      const managedConfig = await managedSite.config.get()

      if (!managedConfig) {
        return handleChannelLocateFallback(
          t("actions.channelLocateConfigMissing"),
        )
      }

      addRedactionSecrets(
        secretsToRedact,
        collectManagedConfigSecrets(managedConfig),
      )

      const tokenLookupAccount = {
        ...site,
        baseUrl: accountBaseUrl,
      }
      const runtimeKeys =
        await fetchDisplayAccountRuntimeKeys(tokenLookupAccount)
      addRuntimeKeyRedactionSecrets(secretsToRedact, runtimeKeys)

      const [runtimeKey] = runtimeKeys
      if (!runtimeKey) {
        return handleChannelLocateFallback(
          t("actions.channelLocateNoKeyFallback"),
        )
      }

      if (runtimeKeys.length > 1) {
        return handleChannelLocateFallback(
          t("actions.channelLocateMultipleKeysFallback"),
        )
      }

      const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
        tokenLookupAccount,
        runtimeKey,
      )
      addRuntimeKeyRedactionSecrets(secretsToRedact, [resolvedRuntimeKey])
      const source = buildManagedSiteChannelDraftSource({
        ...resolvedRuntimeKey,
        baseUrl:
          isAccountKeyResourceRuntimeKey(resolvedRuntimeKey) &&
          resolvedRuntimeKey.baseUrl.trim() ===
            tokenLookupAccount.baseUrl.trim()
            ? normalizedAccountBaseUrl
            : resolvedRuntimeKey.baseUrl,
      })
      let inputsPrepared = false
      const matchParams = {
        source,
        managedSite,
        managedConfig,
        purpose: "matching" as const,
        onDraftPrepared: () => {
          inputsPrepared = true
        },
        operationContext: createManagedSiteOperationContext({
          freshChannelSearches: true,
        }),
      }
      let prepared: Awaited<ReturnType<typeof prepareManagedSiteChannelMatch>>
      try {
        prepared = await prepareManagedSiteChannelMatch(matchParams)
      } catch (error) {
        if (inputsPrepared) throw error
        logger.warn("Failed to build channel match inputs", {
          diagnostic: toSanitizedErrorSummary(
            error,
            Array.from(secretsToRedact),
          ),
          siteId: site.id,
        })
        // Upstream input failures retain a URL search; backend lookup failures
        // remain errors once the shared preparation has produced its inputs.
        return handleChannelLocateFallback(
          t("actions.channelLocateInputPreparationFallback"),
        )
      }
      let resolution = prepared.resolution
      if (!resolution)
        return handleChannelLocateFallback(
          t("actions.channelLocateInputPreparationFallback"),
        )
      const recoverableCandidate = getRecoverableManagedSiteChannelCandidate({
        url: resolution.url,
        models: resolution.models,
      })

      if (
        recoverableCandidate &&
        managedSite.matching.secretVerification?.kind ===
          MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION &&
        "userId" in managedConfig
      ) {
        const verified = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
          getCurrentTempWindowRequestSource(),
          async (protectionBypassExecution) =>
            await prepareManagedSiteChannelMatch({
              ...matchParams,
              preparedDraft: prepared.draft,
              hiddenKeyResourceRefs: [recoverableCandidate.ref],
              protectionBypassExecution,
            }),
        )
        if (verified.resolution) resolution = verified.resolution
      }
      const exactMatch = getManagedSiteChannelExactMatch(
        resolution,
        managedSite.matching,
      )

      if (exactMatch) {
        openManagedSiteChannelsPage({ resourceRef: exactMatch.ref })
        return
      }

      openManagedSiteChannelsPage({ search: resolution.searchBaseUrl })

      if (!resolution.searchCompleted) {
        toast.error(t("actions.channelLocateFailed"))
        return
      }

      toast.success(resolveLocateManagedSiteChannelToastMessage(t, resolution))
    } catch (error) {
      logger.error("Failed to locate managed site channel", {
        diagnostic: toSanitizedErrorSummary(error, Array.from(secretsToRedact)),
        siteId: site.id,
        baseUrl: site.baseUrl,
        siteType: site.siteType,
      })

      openManagedSiteChannelsPage({ search: normalizedAccountBaseUrl })
      toast.error(t("actions.channelLocateFailed"))
    }
  }

  return handleLocateManagedSiteChannel
}
