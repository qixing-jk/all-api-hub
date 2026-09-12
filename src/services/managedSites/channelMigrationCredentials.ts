import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES as warnings,
} from "~/types/managedSiteMigration"
import type {
  ManagedSiteMigrationCanonicalPreview,
  ManagedSiteMigrationCanonicalPreviewItem,
  ManagedSiteMigrationCredentialResolution,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

/** Detect membership/order changes between split writes without retaining secrets. */
export async function migrationCredentialRevision(
  credentials: NonNullable<
    Extract<
      ManagedSiteMigrationCredentialResolution,
      { status: "ready" }
    >["credentials"]
  >,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(credentials)),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Plan one target resource per key when native grouping cannot preserve its state. */
export function planMigrationCredentials(
  preview: ManagedSiteMigrationCanonicalPreview,
  supportsMultiple: (source: ManagedSiteMigrationSource) => boolean,
): ManagedSiteMigrationCanonicalPreview {
  const items = preview.items.flatMap(
    (item): ManagedSiteMigrationCanonicalPreviewItem[] => {
      if (item.status !== "ready") return [item]
      const metadata = item.source.credentialMetadata
      if (!metadata) {
        if (!item.source.lossSignals.hasMultiKeyState) return [item]
        return [
          {
            selection: item.selection,
            status: "blocked",
            source: item.source,
            warningCodes: item.warningCodes,
            blockingReasonCode: blockers.SOURCE_MULTI_KEY_UNSUPPORTED,
          },
        ]
      }
      if (metadata.length === 0)
        return [
          {
            selection: item.selection,
            status: "blocked",
            source: item.source,
            warningCodes: item.warningCodes,
            blockingReasonCode: blockers.SOURCE_KEY_MISSING,
          },
        ]
      if (supportsMultiple(item.source))
        return [
          {
            ...item,
            target: {
              ...item.target,
              projection: {
                ...item.target.projection,
                keyCount: metadata.length,
              },
            },
          },
        ]
      return metadata.map((key, index) => {
        const suffix = metadata.length > 1 ? ` [Key ${index + 1}]` : ""
        return {
          ...item,
          selection: {
            ...item.selection,
            selectionId: JSON.stringify([item.selection.selectionId, index]),
            displayName: `${item.selection.displayName}${suffix}`,
            credentialIndex: index,
          },
          warningCodes:
            metadata.length > 1
              ? [...item.warningCodes, warnings.SPLITS_KEYS]
              : item.warningCodes,
          target: {
            ...item.target,
            projection: {
              ...item.target.projection,
              name: `${item.target.projection.name}${suffix}`,
              enabled: item.target.projection.enabled && key.enabled,
              keyCount: 1,
            },
          },
        }
      })
    },
  )
  const readyCount = items.filter((item) => item.status === "ready").length
  return {
    ...preview,
    items,
    totalCount: items.length,
    readyCount,
    blockedCount: items.length - readyCount,
  }
}

/** Validate the complete execution-time bundle before choosing a previewed slot. */
export function resolveMigrationCredentials(
  item: Extract<ManagedSiteMigrationCanonicalPreviewItem, { status: "ready" }>,
  resolution: Extract<
    ManagedSiteMigrationCredentialResolution,
    { status: "ready" }
  >,
): ManagedSiteMigrationCredentialResolution {
  const metadata = item.source.credentialMetadata
  const credentials = resolution.credentials
  if (!metadata && !credentials) return resolution
  if (
    !metadata ||
    !credentials ||
    metadata.length !== credentials.length ||
    metadata.some((key, index) => key.enabled !== credentials[index].enabled)
  ) {
    return { status: "blocked", reasonCode: blockers.SOURCE_KEYS_CHANGED }
  }
  if (
    !credentials.length ||
    credentials.some((key) => !hasUsableManagedSiteChannelKey(key.value))
  ) {
    return { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
  }
  const index = item.selection.credentialIndex
  if (index !== undefined) {
    if (!Number.isSafeInteger(index) || index < 0 || !credentials[index])
      return { status: "blocked", reasonCode: blockers.SOURCE_KEYS_CHANGED }
    return { status: "ready", credential: credentials[index].value }
  }
  return { status: "ready", credential: credentials[0].value, credentials }
}
