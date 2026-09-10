import {
  getManagedSiteChannelExactMatch,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import type { ManagedSiteChannelMatchContext } from "~/services/managedSites/channelMatchResolver"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"

/**
 * Resolves whether a direct managed-site import has an exact duplicate.
 */
export async function resolveManagedSiteImportDuplicate(params: {
  managedSite: ManagedSiteChannelMatchContext
  managedConfig: ManagedSiteRuntimeConfigValue
  formData: ManagedSiteChannelDraft
  protectionBypassExecution?: ProtectionBypassExecution
}) {
  const resolution = await resolveManagedSiteChannelMatch({
    managedSite: params.managedSite,
    managedConfig: params.managedConfig,
    accountBaseUrl: params.formData.base_url,
    models: params.formData.models,
    key: params.formData.key,
    protectionBypassExecution: params.protectionBypassExecution,
  })

  const exactMatch = getManagedSiteChannelExactMatch(
    resolution,
    params.managedSite.matching,
  )
  if (exactMatch) {
    return exactMatch
  }

  if (
    resolution.searchCompleted &&
    resolution.url.matched &&
    params.formData.key?.trim() &&
    !resolution.key.comparable &&
    resolution.models.reason === MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT
  ) {
    throw new MatchResolutionUnresolvedError(
      resolution.unresolvedReason ??
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    )
  }

  return null
}
