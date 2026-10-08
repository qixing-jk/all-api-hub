import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  type AxonHubChannelFieldId,
} from "~/constants/axonHub"
import {
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  type EditableResourceProjection,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type AxonHubNativeChannelPatch } from "~/services/apiAdapters/managedResources/axonHub/editorContracts"

export const readString = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return typeof value === "string" ? value.trim() : ""
}

export const readBoolean = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => values[fieldId] === true

export const readNumber = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  if (typeof value === "number" && Number.isFinite(value)) return value
  return value === "" ? Number.NaN : 0
}

export const readList = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export const readSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values[AXON_HUB_CHANNEL_FIELD_IDS.KEY]
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "kind")
  ) {
    const candidate = value as Record<PropertyKey, unknown>
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }
    if (
      candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      Object.prototype.hasOwnProperty.call(candidate, "value") &&
      typeof candidate.value === "string"
    ) {
      return {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: candidate.value,
      }
    }
  }
  return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

export const normalizeList = (values: readonly string[]) =>
  values.map((value) => value.trim()).filter(Boolean)

export const hasInvalidListValues = (values: readonly string[]) => {
  const normalized = values.map((value) => value.trim())
  return (
    normalized.some((value) => !value) ||
    new Set(normalized).size !== normalized.length
  )
}

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const AXON_HUB_MODEL_PATTERN_REGEX_CHARS = /[*?+[\]{}()^$.|\\]/

const AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER = /^\(\?([a-z]+)\)/

// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/utils/pattern.ts
export const isValidAxonHubModelPattern = (pattern: string) => {
  if (!pattern || pattern === "*") return true

  const inlineModifier = pattern.match(AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER)
  const modifiers = new Set(inlineModifier?.[1] ?? [])
  if ([...modifiers].some((modifier) => modifier !== "i")) return false

  const caseInsensitive = modifiers.has("i")
  const body = inlineModifier
    ? pattern.slice(inlineModifier[0].length)
    : pattern
  if (!AXON_HUB_MODEL_PATTERN_REGEX_CHARS.test(body)) return true

  const normalizedBody = body.replace(/^\^/, "").replace(/\$$/, "")
  try {
    new RegExp(`^(?:${normalizedBody})$`, caseInsensitive ? "i" : "")
    return true
  } catch {
    return false
  }
}

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index])

export const fieldChanged = (
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  const initialValue = baseline[fieldId]
  if (Array.isArray(value) && Array.isArray(initialValue)) {
    return !arraysEqual(value, initialValue)
  }
  return value !== initialValue
}

export const addNullableTextDiff = (
  input: AxonHubNativeChannelPatch,
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId:
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
  clearField: "clearAutoSyncModelPattern" | "clearRemark",
) => {
  if (!fieldChanged(values, baseline, fieldId)) return
  const next = readString(values, fieldId)
  if (next) input[fieldId] = next
  else input[clearField] = true
}
