import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { isAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  fetchDisplayAccountRuntimeKeys,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { buildManagedSiteChannelDraftSource } from "~/services/managedSites/channelDraftSource"
import {
  getManagedSiteChannelExactMatch,
  getRecoverableManagedSiteChannelCandidate,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import {
  createManagedSiteChannelMatchRequestCache,
  resolveManagedSiteChannelMatch,
} from "~/services/managedSites/channelMatchResolver"
import { getCurrentManagedSiteType } from "~/services/managedSites/runtimeConfig"
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
      let formData: Awaited<
        ReturnType<typeof managedSite.channelDrafts.prepareFormData>
      >
      try {
        formData = await managedSite.channelDrafts.prepareFormData(
          buildManagedSiteChannelDraftSource({
            ...resolvedRuntimeKey,
            baseUrl:
              isAccountKeyResourceRuntimeKey(resolvedRuntimeKey) &&
              resolvedRuntimeKey.baseUrl.trim() ===
                tokenLookupAccount.baseUrl.trim()
                ? normalizedAccountBaseUrl
                : resolvedRuntimeKey.baseUrl,
          }),
        )
      } catch (error) {
        logger.warn(
          "Failed to build channel match inputs; using URL-only match",
          {
            diagnostic: toSanitizedErrorSummary(
              error,
              Array.from(secretsToRedact),
            ),
            siteId: site.id,
            baseUrl: site.baseUrl,
            siteType: site.siteType,
          },
        )
        return handleChannelLocateFallback(
          t("actions.channelLocateInputPreparationFallback"),
        )
      }

      const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(
        formData.base_url,
      )

      if (!searchBaseUrl || formData.models.length === 0) {
        return handleChannelLocateFallback(
          t("actions.channelLocateInputPreparationFallback"),
        )
      }

      const requestCache = createManagedSiteChannelMatchRequestCache()
      const matchParams = {
        managedSite,
        managedConfig,
        accountBaseUrl: searchBaseUrl,
        models: formData.models,
        key: formData.key,
        requestCache,
      }
      let resolution = await resolveManagedSiteChannelMatch(matchParams)
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
        resolution = await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
          getCurrentTempWindowRequestSource(),
          async (protectionBypassExecution) =>
            await resolveManagedSiteChannelMatch({
              ...matchParams,
              resolveHiddenKeys: true,
              hiddenKeyResourceRefs: [recoverableCandidate.ref],
              protectionBypassExecution,
            }),
        )
      }
      const exactMatch = getManagedSiteChannelExactMatch(resolution)

      if (
        exactMatch &&
        resolution.models.reason ===
          MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
      ) {
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
