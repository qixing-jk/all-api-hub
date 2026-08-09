import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteChannel } from "~/types/managedSite"

/** Resolves the native resource id represented by a legacy channel row. */
export function getManagedSiteChannelResourceId(
  managedSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
): string | number {
  if (managedSiteType === SITE_TYPES.AXON_HUB) {
    const nativeId = (
      channel as ManagedSiteChannel & {
        _axonHubData?: { id?: string | number }
      }
    )._axonHubData?.id
    if (nativeId !== undefined && nativeId !== null) {
      return nativeId
    }
  }

  return channel.id
}

/**
 * Returns the stable numeric identity that an old channel-config key could
 * have represented. AxonHub rows use process-local numeric projections, so
 * even a numeric-looking native id is not sufficient migration evidence.
 */
export function getStableLegacyChannelId(
  managedSiteType: ManagedSiteType,
  channel: ManagedSiteChannel,
): number | null {
  return managedSiteType === SITE_TYPES.AXON_HUB ? null : channel.id
}
