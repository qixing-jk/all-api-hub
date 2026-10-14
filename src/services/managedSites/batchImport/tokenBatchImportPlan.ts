import type { ManagedSiteType } from "~/constants/siteType"
import { formatOptionalSkPrefixSiteTokenComparableKey } from "~/services/accountTokens/apiTokenKey"
import { supportsNativeManagedChannelMultiKeyImport } from "~/services/apiAdapters/managedResources/channelImport"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import type {
  ExecutableManagedSiteTokenBatchExportPreviewItem,
  ManagedSiteTokenBatchImportMode,
} from "~/types/managedSiteTokenBatchExport"
import { normalizeList } from "~/utils/core/string"

export interface ManagedSiteTokenBatchImportGroup {
  id: string
  itemIds: string[]
  draft: ManagedSiteChannelDraft
  modelSetsDiffer: boolean
  supportsMultipleCredentials: boolean
}

/** Normalize endpoint spelling without removing meaningful paths such as /v1. */
function endpointIdentity(value: string) {
  try {
    const url = new URL(value.trim())
    url.pathname = url.pathname.replace(/\/+$/, "") || "/"
    return url.href
  } catch {
    return value.trim()
  }
}

/** One shared plan drives preview and execution; model permissions remain the user's decision. */
export function planManagedSiteTokenBatchImport(
  siteType: ManagedSiteType,
  items: readonly ExecutableManagedSiteTokenBatchExportPreviewItem[],
  mode: ManagedSiteTokenBatchImportMode,
): ManagedSiteTokenBatchImportGroup[] {
  const buckets = new Map<
    string,
    ExecutableManagedSiteTokenBatchExportPreviewItem[]
  >()
  for (const item of items) {
    const supported = supportsNativeManagedChannelMultiKeyImport(
      siteType,
      item.draft,
    )
    const key =
      mode === "grouped" && supported
        ? JSON.stringify([
            endpointIdentity(item.draft.base_url),
            String(item.draft.type),
            item.draft.enabled,
            [...item.draft.groups].sort(),
            item.draft.notes ?? "",
          ])
        : item.id
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }
  return [...buckets.values()].map((members) => {
    const first = members[0]!
    const keys = new Map<string, string>()
    for (const member of members) {
      const key = member.draft.key.trim()
      const identity = formatOptionalSkPrefixSiteTokenComparableKey(
        key,
        siteType,
      )
      if (!keys.has(identity)) keys.set(identity, key)
    }
    const modelSets = members.map((member) =>
      JSON.stringify(normalizeList(member.draft.models).sort()),
    )
    return {
      id: first.id,
      itemIds: members.map((item) => item.id),
      supportsMultipleCredentials: supportsNativeManagedChannelMultiKeyImport(
        siteType,
        first.draft,
      ),
      modelSetsDiffer: new Set(modelSets).size > 1,
      draft:
        members.length > 1
          ? {
              ...first.draft,
              name: first.accountName || first.draft.name,
              key: keys.values().next().value!,
              credentials: [...keys.values()],
              models: normalizeList(
                members.flatMap((member) => member.draft.models),
              ),
            }
          : first.draft,
    }
  })
}
