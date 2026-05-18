import {
  getManagedSiteChannelExactMatch,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import type { ManagedSiteChannelMatchService } from "~/services/managedSites/channelMatchResolver"
import type { ManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import type { ChannelFormData } from "~/types/managedSite"

/**
 * Resolves whether a direct managed-site import has an exact duplicate.
 */
export async function resolveManagedSiteImportDuplicate(params: {
  service: ManagedSiteChannelMatchService
  managedConfig: ManagedSiteConfig
  formData: ChannelFormData
}) {
  const resolution = await resolveManagedSiteChannelMatch({
    service: params.service,
    managedConfig: params.managedConfig,
    accountBaseUrl: params.formData.base_url,
    models: params.formData.models,
    key: params.formData.key,
  })

  const exactMatch = getManagedSiteChannelExactMatch(resolution)
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
