import type { ManagedSiteType } from "~/constants/siteType"
import { formatOptionalSkPrefixSiteTokenComparableKey } from "~/services/accountTokens/apiTokenKey"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { supportsNativeManagedChannelMultiKeyImport } from "~/services/apiAdapters/managedResources/channelImport"
import { areManagedResourceRefsEqual } from "~/services/managedSites/managedResourceIdentity"
import type { ManagedSiteChannelDraft } from "~/types/managedSiteChannelDraft"
import type {
  ExecutableManagedSiteTokenBatchExportPreviewItem,
  ManagedSiteTokenBatchExportMatchedChannel,
  ManagedSiteTokenBatchImportMode,
} from "~/types/managedSiteTokenBatchExport"
import { normalizeList } from "~/utils/core/string"

export interface ManagedSiteTokenBatchImportGroup {
  target?: ManagedSiteTokenBatchExportMatchedChannel
  existingTargets: ManagedSiteTokenBatchExportMatchedChannel[]
  requiresTargetSelection: boolean
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
  targetsByGroupId: Readonly<Record<string, ManagedResourceRef | null>> = {},
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
      mode !== "independent" && supported
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
    const existingTargets =
      mode === "reuse"
        ? (first.existingImportTargets ?? []).filter((candidate) =>
            members.every((member) =>
              member.existingImportTargets?.some((other) =>
                areManagedResourceRefsEqual(candidate.ref, other.ref),
              ),
            ),
          )
        : []
    const selected = targetsByGroupId[first.id]
    const target =
      selected === null
        ? undefined
        : selected
          ? existingTargets.find((candidate) =>
              areManagedResourceRefsEqual(candidate.ref, selected),
            )
          : existingTargets.length === 1
            ? existingTargets[0]
            : undefined
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
      target,
      existingTargets,
      requiresTargetSelection:
        mode === "reuse" &&
        selected !== null &&
        !target &&
        (existingTargets.length > 1 || selected !== undefined),
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
