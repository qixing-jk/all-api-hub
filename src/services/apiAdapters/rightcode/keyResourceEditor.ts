import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  toOptionalFiniteNumber,
  toStringArray,
} from "~/services/apiService/rightcode/parsing"
import type { RightCodeApiKey } from "~/services/apiService/rightcode/type"

import type { RightCodeChannelInfo } from "./channels"

export const RIGHTCODE_KEY_FIELD_IDS = {
  Name: "name",
  Channel: "channel",
  Unlimited: "unlimited_quota",
  QuotaUsd: "quotaUsd",
  ExpiresAt: "expires_at",
  IsActive: "is_active",
  Models: "models",
  AllowWallet: "allow_wallet",
} as const

const field = RIGHTCODE_KEY_FIELD_IDS

/**
 * Provider-shaped key state used for drift detection between the form's
 * baseline and the submitted values.
 *
 * `allowed_prefixes` and `allowed_item_ids` are not editable here, so they are
 * deliberately excluded: an edit must never clear a restriction the user did
 * not touch.
 */
export type RightCodeKeySnapshot = {
  name: string
  channelId: number | null
  quotaLimit: number | null
  expiresAt: string | null
  isActive: boolean
  allowedModels: string[]
  allowWallet: boolean
}

export type RightCodeKeyEditCommand = {
  baseline: RightCodeKeySnapshot
  values: RightCodeKeySnapshot
}

const pad2 = (value: number): string => String(value).padStart(2, "0")

const asString = (value: unknown): string =>
  typeof value === "string" ? value : ""

/**
 * The deployment stores expiries as timezone-less local wall clock and only
 * accepts `YYYY-MM-DDTHH:mm:ss`; anything else answers 400
 * "Failed to read HTTP message" (verified against the live API 2026-09-24).
 */
function formatRightCodeExpiry(value: string | null): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/** Editor value (`DateTime` uses ISO strings) for a stored expiry. */
const toEditorExpiry = (value: string | null): string => {
  if (!value) return ""
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ""
}

export const toRightCodeKeySnapshot = (
  key: RightCodeApiKey,
): RightCodeKeySnapshot => ({
  name: key.name?.trim() ?? "",
  channelId: toOptionalFiniteNumber(key.bound_upstream_id) ?? null,
  quotaLimit: toOptionalFiniteNumber(key.quota_limit) ?? null,
  expiresAt: key.expired_at?.trim() || null,
  isActive: key.is_active !== false,
  allowedModels: toStringArray(key.allowed_models),
  allowWallet: key.allow_wallet !== false,
})

/**
 * Key editor for Right Code.
 *
 * The deployment binds every new key to exactly one channel, and the channel
 * decides which models and which client address the key works with. Legacy keys
 * predate that binding: they keep a prefix list instead and must not be
 * converted implicitly, so the channel field is only offered when the key is
 * already bound (or on creation).
 */
export function createRightCodeKeyEditor(params: {
  channels: readonly RightCodeChannelInfo[]
  key?: RightCodeApiKey
  intent?: AccountKeyCreationIntent
}): AccountKeyResourceEditorDefinition<RightCodeKeyEditCommand> {
  const { channels, key, intent } = params
  const isEdit = Boolean(key)
  const singleChannelId = channels.length === 1 ? channels[0]?.id : undefined
  const baseline: RightCodeKeySnapshot = key
    ? toRightCodeKeySnapshot(key)
    : {
        name: intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
        channelId: singleChannelId ?? null,
        quotaLimit: null,
        expiresAt: null,
        isActive: true,
        allowedModels: intent?.modelContext?.modelId
          ? [intent.modelContext.modelId]
          : [],
        allowWallet: true,
      }

  const isLegacyKey = isEdit && baseline.channelId === null
  const canChangeChannel = !isLegacyKey
  // The deployment accepts expiry writes but cannot clear one, so a key that
  // already expires must keep a date (verified 2026-09-24; `null`, `""` and an
  // empty body are all acknowledged and ignored).
  const expiryIsClearable = baseline.expiresAt === null

  const modelsForChannel = (channelId: string): string[] => {
    const channel = channels.find(
      (candidate) => String(candidate.id) === channelId,
    )
    if (channel) return channel.models
    if (isLegacyKey) {
      const allowed = toStringArray(key?.allowed_prefixes)
      const scoped = channels.filter((candidate) =>
        allowed.includes(candidate.prefix),
      )
      return (scoped.length ? scoped : channels).flatMap(
        (candidate) => candidate.models,
      )
    }
    return []
  }

  const fields: ResourceFieldDescriptor[] = [
    { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
    ...(canChangeChannel
      ? [
          {
            fieldId: field.Channel,
            type: RESOURCE_FIELD_TYPES.Select,
            required: true,
            options: channels.map((channel) => ({
              value: String(channel.id),
              displayLabel: channel.name,
              secondaryLabel: channel.prefix,
            })),
          } satisfies ResourceFieldDescriptor,
        ]
      : []),
    { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
    { fieldId: field.QuotaUsd, type: RESOURCE_FIELD_TYPES.Number, min: 0 },
    {
      fieldId: field.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: expiryIsClearable,
    },
    ...(isEdit
      ? [
          {
            fieldId: field.IsActive,
            type: RESOURCE_FIELD_TYPES.Boolean,
          } satisfies ResourceFieldDescriptor,
        ]
      : []),
    {
      fieldId: field.Models,
      type: RESOURCE_FIELD_TYPES.MultiSelect,
      options: modelsForChannel(String(baseline.channelId ?? "")).map(
        (value) => ({ value, displayLabel: value }),
      ),
      optionLoader: { dependsOn: [field.Channel] },
    },
    { fieldId: field.AllowWallet, type: RESOURCE_FIELD_TYPES.Boolean },
  ]

  return {
    fields,
    initialValues: {
      [field.Name]: baseline.name,
      [field.Channel]:
        baseline.channelId === null ? "" : String(baseline.channelId),
      [field.Unlimited]: baseline.quotaLimit === null,
      [field.QuotaUsd]: baseline.quotaLimit ?? 0,
      [field.ExpiresAt]: toEditorExpiry(baseline.expiresAt),
      [field.IsActive]: baseline.isActive,
      [field.Models]: baseline.allowedModels,
      [field.AllowWallet]: baseline.allowWallet,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []

      const nameValue = asString(values[field.Name])
      if (!nameValue.trim()) {
        issues.push({ fieldId: field.Name, code: "required" })
      }

      if (canChangeChannel) {
        const channelValue = asString(values[field.Channel]).trim()
        const channelId = channelValue ? Number(channelValue) : Number.NaN
        if (
          !Number.isFinite(channelId) ||
          !channels.some((channel) => channel.id === channelId)
        ) {
          issues.push({ fieldId: field.Channel, code: "required" })
        }
      }

      if (values[field.Unlimited] !== true) {
        const quota = values[field.QuotaUsd]
        if (typeof quota !== "number" || !Number.isFinite(quota) || quota < 0) {
          issues.push({ fieldId: field.QuotaUsd, code: "out_of_range" })
        }
      }

      const expiry = asString(values[field.ExpiresAt])
      if (expiry.trim()) {
        if (!Number.isFinite(Date.parse(expiry))) {
          issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
        }
      } else if (!expiryIsClearable) {
        issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
      }

      const modelValues = values[field.Models]
      if (
        !Array.isArray(modelValues) ||
        modelValues.some((model) => typeof model !== "string")
      ) {
        issues.push({ fieldId: field.Models, code: "invalid_value" })
      }

      if (typeof values[field.AllowWallet] !== "boolean") {
        issues.push({ fieldId: field.AllowWallet, code: "invalid_value" })
      }

      return issues.length ? { valid: false, issues } : { valid: true }
    },
    async loadOptions(fieldId, values) {
      if (fieldId !== field.Models) return []
      const selected = asString(values[field.Channel]).trim()
      return modelsForChannel(selected || String(baseline.channelId ?? "")).map(
        (value) => ({ value, displayLabel: value }),
      )
    },
    buildCommand(values) {
      const channelValue = asString(values[field.Channel]).trim()
      const channelId = canChangeChannel
        ? channelValue
          ? Number(channelValue)
          : Number.NaN
        : baseline.channelId
      const unlimited = values[field.Unlimited] === true
      const quotaValue = values[field.QuotaUsd]
      const expiryValue = asString(values[field.ExpiresAt]).trim()

      return {
        baseline,
        values: {
          name: asString(values[field.Name]).trim(),
          channelId:
            channelId !== null && Number.isFinite(channelId) ? channelId : null,
          quotaLimit:
            unlimited || typeof quotaValue !== "number" ? null : quotaValue,
          expiresAt: formatRightCodeExpiry(expiryValue || null),
          isActive: values[field.IsActive] !== false,
          allowedModels: toStringArray(values[field.Models]),
          allowWallet: values[field.AllowWallet] === true,
        },
      }
    },
  }
}
