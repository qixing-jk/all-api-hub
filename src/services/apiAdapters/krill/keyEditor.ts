import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import type {
  ResourceFieldIssue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/resourceNative"
import { RESOURCE_FIELD_ISSUE_CODES } from "~/services/apiAdapters/contracts/resourceNative"
import type { KrillChannel } from "~/services/apiService/krill/keys"

import { krillKeyFields } from "./keyResourceFields"

export type KrillKeyCommand = {
  name: string
  allowBalanceFallback: boolean
  ipWhitelist: readonly string[]
  ipWhitelistDisabled: boolean
  channelIds: readonly number[]
}

export type KrillKeyEditableDetail = {
  name: string
  channelIds: readonly number[]
  allowBalanceFallback: boolean
  ipWhitelist: readonly string[] | null
  ipWhitelistGrey?: boolean
  ipWhitelistDisabled?: boolean
  /** Full channel catalogue; absent when the detail came from a lean inventory read. */
  channels?: readonly KrillChannel[]
}

/** Split the console's free-text IP field the way the native dialog stores it. */
function parseKrillIpWhitelist(value: unknown): string[] | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return null
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
  return entries.length ? entries : null
}

const ipFieldId = krillKeyFields.IpWhitelist
const channelFieldId = krillKeyFields.Channels
const fallbackFieldId = krillKeyFields.AllowBalanceFallback

/** Explicit edits require at least one native channel. */
function validateChannels(
  values: Readonly<Record<string, unknown>>,
  channels: readonly KrillChannel[],
  issues: ResourceFieldIssue[],
) {
  const selected = values[channelFieldId]
  if (!Array.isArray(selected) || selected.length === 0) {
    issues.push({
      fieldId: channelFieldId,
      code: RESOURCE_FIELD_ISSUE_CODES.Required,
    })
    return
  }
  const known = new Set(channels.map((channel) => String(channel.id)))
  for (const value of selected)
    if (typeof value !== "string" || !known.has(value))
      issues.push({
        fieldId: channelFieldId,
        code: RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
      })
  // The provider publishes exclusivity through these native channel names;
  // channel ids are deployment-specific and cannot encode the rule.
  const exclusiveGroups = [
    ["国产模型官渠", "阿里云直连"],
    ["Max 官渠", "Kiro 渠道", "Max 官渠高可用", "Anthropic 官key"],
  ]
  const names = channels
    .filter((channel) => selected.includes(String(channel.id)))
    .map((channel) => channel.name)
  if (
    exclusiveGroups.some(
      (group) => group.filter((name) => names.includes(name)).length > 1,
    )
  )
    issues.push({
      fieldId: channelFieldId,
      code: RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
}

/**
 * The native editor's fields: name, channel permissions, balance fallback and
 * IP whitelist. There is no quota, expiry or model-restriction field upstream.
 * For the native empty channel sentinel, the editor shows the default-routed
 * channels and preserves the stored empty sentinel
 * when the selection is unchanged.
 */
export function createKrillKeyEditor(params: {
  channels: readonly KrillChannel[]
  detail?: KrillKeyEditableDetail
  nameHint?: string
  loadChannels?: (
    options?: ResourceOperationOptions,
  ) => Promise<readonly KrillChannel[]>
}): AccountKeyResourceEditorDefinition<KrillKeyCommand> {
  const { channels, detail, nameHint } = params
  const unrestricted = detail ? detail.channelIds.length === 0 : false
  const initialChannels = detail
    ? unrestricted
      ? channels
          .filter((channel) => channel.defaultRouted)
          .map((channel) => String(channel.id))
      : detail.channelIds.map(String)
    : channels
        .filter((channel) => channel.defaultRouted)
        .map((channel) => String(channel.id))
  return {
    fields: [
      { fieldId: krillKeyFields.Name, type: "text", nullable: true },
      {
        fieldId: channelFieldId,
        type: "multi-select",
        required: true,
        options: [],
        optionLoader: { dependsOn: [] },
      },
      { fieldId: fallbackFieldId, type: "boolean" },
      ...(detail?.ipWhitelistGrey
        ? [
            {
              fieldId: krillKeyFields.IpWhitelistDisabled,
              type: "boolean" as const,
            },
          ]
        : []),
      { fieldId: ipFieldId, type: "textarea", nullable: true },
    ],
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== channelFieldId) return []
      const loaded = params.loadChannels
        ? await params.loadChannels(options)
        : channels
      options?.signal?.throwIfAborted()
      return loaded.map((channel) => ({
        value: String(channel.id),
        displayLabel: channel.name,
        secondaryLabel: `×${channel.billingMultiplier.toFixed(4)}`,
      }))
    },
    initialValues: {
      name:
        detail?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
      [channelFieldId]: initialChannels,
      [fallbackFieldId]: detail?.allowBalanceFallback ?? true,
      [ipFieldId]: (detail?.ipWhitelist ?? []).join(", "),
      [krillKeyFields.IpWhitelistDisabled]:
        detail?.ipWhitelistDisabled ?? false,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (values.name !== null && typeof values.name !== "string")
        issues.push({
          fieldId: krillKeyFields.Name,
          code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        })
      validateChannels(values, channels, issues)
      if (
        detail?.ipWhitelistGrey &&
        values[krillKeyFields.IpWhitelistDisabled] !== true &&
        !parseKrillIpWhitelist(values[ipFieldId])
      )
        issues.push({
          fieldId: ipFieldId,
          code: RESOURCE_FIELD_ISSUE_CODES.Required,
        })
      if (
        values[ipFieldId] !== null &&
        values[ipFieldId] !== undefined &&
        typeof values[ipFieldId] !== "string"
      )
        issues.push({
          fieldId: ipFieldId,
          code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
        })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand: (values) => ({
      name: String(values.name ?? "").trim(),
      allowBalanceFallback: values[fallbackFieldId] !== false,
      ipWhitelist: parseKrillIpWhitelist(values[ipFieldId]) ?? ([] as string[]),
      ipWhitelistDisabled: values[krillKeyFields.IpWhitelistDisabled] === true,
      channelIds:
        unrestricted &&
        (values[channelFieldId] as string[]).length ===
          initialChannels.length &&
        initialChannels.every((id) =>
          (values[channelFieldId] as string[]).includes(id),
        )
          ? []
          : (values[channelFieldId] as string[]).map(Number),
    }),
  }
}
