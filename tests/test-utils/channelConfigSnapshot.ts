import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  type ChannelConfigSnapshot,
} from "~/types/channelConfig"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
} from "~/types/managedUpstreamResource"

/** Builds a canonical scoped channel-config snapshot for backup tests. */
export function channelConfigSnapshot(
  entries: Array<{
    resourceId: string | number
    scopeKey?: string
    channelId?: number
    updatedAt: number
  }>,
): ChannelConfigSnapshot {
  const configs = Object.fromEntries(
    entries.map(
      ({
        resourceId,
        scopeKey = "https://admin.example.invalid",
        channelId,
        updatedAt,
      }) => {
        const resourceRef = createManagedUpstreamResourceRef({
          managedSiteType: "new-api",
          scopeKey,
          resourceId,
        })
        return [
          getManagedUpstreamResourceRefKey(resourceRef),
          {
            resourceRef,
            ...(channelId !== undefined ? { channelId } : {}),
            modelFilterSettings: { rules: [], updatedAt },
            createdAt: updatedAt,
            updatedAt,
          },
        ]
      },
    ),
  )

  return { schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION, configs }
}
