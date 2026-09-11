import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type {
  ChannelStatus,
  NewApiChannel,
  UpdateChannelPayload,
} from "~/types/newApi"
import type {
  NewApiChannelAdvancedPatch,
  NewApiChannelCommand,
} from "~/types/newApiChannelEditor"

import { readNewApiSettings } from "./newApiChannelSettings"

/** Merges edited nested keys, retaining all unrelated native settings. */
export function buildNewApiAdvancedPayload(
  native: Partial<NewApiChannel>,
  advanced?: NewApiChannelAdvancedPatch,
): Partial<UpdateChannelPayload> {
  if (!advanced) return {}
  const { setting, settings, ...payload } = advanced
  const result: Partial<UpdateChannelPayload> = { ...payload }
  for (const [key, patch] of [
    ["setting", setting],
    ["settings", settings],
  ] as const) {
    if (!patch) continue
    const existing = readNewApiSettings(native[key])
    if (!existing) throw new ManagedResourceError({ code: "validation_failed" })
    result[key] = JSON.stringify({ ...existing, ...patch })
  }
  return result
}

/** Checks only edited advanced values; upstream can normalize empty/default keys. */
export function hasNewApiAdvancedValues(
  detail: NewApiChannel,
  patch: NewApiChannelAdvancedPatch,
): boolean {
  return Object.entries(patch).every(([key, expected]) => {
    if (key === "setting" || key === "settings") {
      const actual = readNewApiSettings(detail[key])
      return (
        actual !== undefined &&
        Object.entries(expected).every(([nestedKey, value]) => {
          const saved =
            actual[nestedKey] ??
            (Array.isArray(value)
              ? []
              : typeof value === "boolean"
                ? false
                : "")
          return JSON.stringify(saved) === JSON.stringify(value)
        })
      )
    }
    const saved = detail[key as keyof NewApiChannel]
    if (key === "model_mapping") {
      const actual = readNewApiSettings(saved as string)
      const target = readNewApiSettings(expected as string)
      return Boolean(
        actual &&
          target &&
          Object.keys(actual).length === Object.keys(target).length &&
          Object.entries(target).every(
            ([name, value]) => actual[name] === value,
          ),
      )
    }
    return (saved ?? "") === expected
  })
}

/**
 * Builds a full New API update from the latest native detail.
 * The upstream controller validates the submitted object before loading the
 * stored channel, so provider-only fields must survive the edit projection:
 * https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
 */
export function buildNewApiUpdatePayload(
  native: NewApiChannel,
  draft: NewApiChannelCommand,
): UpdateChannelPayload {
  const payload: UpdateChannelPayload = {
    ...native,
    ...buildNewApiAdvancedPayload(native, draft.advanced),
    id: native.id,
    name: draft.name,
    type: draft.type,
    base_url: draft.base_url,
    models: draft.models.join(","),
    groups: draft.groups,
    group: draft.groups.join(","),
    priority: draft.priority,
    weight: draft.weight,
  }

  if (draft.status !== native.status) {
    payload.status = draft.status as ChannelStatus
  } else {
    delete payload.status
  }

  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  } else {
    delete payload.key
  }

  return payload
}
