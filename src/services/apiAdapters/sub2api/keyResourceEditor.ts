import { getDefaultAccountKeyName } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import { resolveKeyCreationGroupIntent } from "~/services/apiAdapters/accountKeyResources/groupCreationIntent"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { fetchSub2ApiGroupDescriptors } from "~/services/apiService/sub2api"
import type {
  Sub2ApiCreateKeyPayload,
  Sub2ApiNativeKey,
} from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { normalizeToMs } from "~/utils/core/formatters"

const SUB2API_KEY_FIELD_IDS = {
  Name: "name",
  Group: "group_id",
  Quota: "quota",
  Unlimited: "unlimited",
  ExpiresAt: "expires_at",
  ExpiresInDays: "expires_in_days",
  Enabled: "enabled",
  IpWhitelist: "ip_whitelist",
} as const
const field = SUB2API_KEY_FIELD_IDS

export type Sub2ApiKeyEditable = {
  name: string
  group_id: number | null
  quota: number
  expires_at: string
  ip_whitelist: string[]
  status: string
}

export type Sub2ApiKeyEditorCommand = {
  baseline: Sub2ApiKeyEditable
  values: Sub2ApiKeyEditable
  create: Sub2ApiCreateKeyPayload
}

/** Normalize editable values without converting USD into another provider's quota. */
export function toSub2ApiKeyEditable(
  key: Sub2ApiNativeKey,
): Sub2ApiKeyEditable {
  const expiry = normalizeToMs(key.expires_at)
  return {
    name: key.name,
    group_id: key.group_id ?? null,
    quota: Number(key.quota) || 0,
    expires_at: expiry && expiry > 0 ? new Date(expiry).toISOString() : "",
    ip_whitelist: Array.isArray(key.ip_whitelist)
      ? key.ip_whitelist
      : (key.ip_whitelist ?? "")
          .split(/[,\n]/)
          .map((ip) => ip.trim())
          .filter(Boolean),
    status:
      key.status === 1
        ? "active"
        : key.status === 0 || key.status === 2
          ? "inactive"
          : String(key.status ?? "unknown"),
  }
}

/** Sub2API owns group IDs, total USD quota, and create-time expiry in whole days. */
export function createSub2ApiKeyEditor(
  request: ApiServiceRequest,
  key?: Sub2ApiNativeKey,
  intent?: AccountKeyCreationIntent,
  groups?: Awaited<ReturnType<typeof fetchSub2ApiGroupDescriptors>>,
): AccountKeyResourceEditorDefinition<Sub2ApiKeyEditorCommand> {
  const { allowedIds, preferred } = resolveKeyCreationGroupIntent(
    groups,
    key ? undefined : intent,
  )
  const baseline = key
    ? toSub2ApiKeyEditable(key)
    : {
        name:
          intent?.nameHint?.trim() ||
          getDefaultAccountKeyName(preferred?.displayName ?? ""),
        group_id: preferred?.id ?? null,
        quota: 0,
        expires_at: "",
        ip_whitelist: [],
        status: "active",
      }
  return {
    fields: [
      { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
      {
        fieldId: field.Group,
        type: RESOURCE_FIELD_TYPES.Select,
        nullable: true,
        options: key?.group_id
          ? [{ value: String(key.group_id), displayLabel: key.group_name }]
          : [],
        optionLoader: { dependsOn: [] },
      },
      { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
      {
        fieldId: field.Quota,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 0.000001,
      },
      key
        ? {
            fieldId: field.ExpiresAt,
            type: RESOURCE_FIELD_TYPES.DateTime,
            nullable: true,
          }
        : {
            fieldId: field.ExpiresInDays,
            type: RESOURCE_FIELD_TYPES.Number,
            min: 1,
            step: 1,
            nullable: true,
          },
      ...(key
        ? [
            {
              fieldId: field.Enabled,
              type: RESOURCE_FIELD_TYPES.Boolean,
            } as const,
          ]
        : []),
      { fieldId: field.IpWhitelist, type: RESOURCE_FIELD_TYPES.Textarea },
    ],
    initialValues: {
      name: baseline.name,
      group_id: baseline.group_id == null ? null : String(baseline.group_id),
      unlimited: baseline.quota <= 0,
      quota: baseline.quota,
      ...(key
        ? {
            expires_at: baseline.expires_at,
            enabled: baseline.status === "active",
          }
        : { expires_in_days: null }),
      ip_whitelist: baseline.ip_whitelist.join("\n"),
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: field.Name, code: "required" })
      if (typeof values.unlimited !== "boolean")
        issues.push({ fieldId: field.Unlimited, code: "invalid_value" })
      if (allowedIds && !allowedIds.has(String(values.group_id))) {
        issues.push({ fieldId: field.Group, code: "required" })
      }
      if (
        !values.unlimited &&
        (typeof values.quota !== "number" ||
          !Number.isFinite(values.quota) ||
          values.quota <= 0)
      )
        issues.push({ fieldId: field.Quota, code: "out_of_range" })
      if (
        values.group_id != null &&
        (typeof values.group_id !== "string" ||
          !/^[1-9]\d*$/.test(values.group_id) ||
          !Number.isSafeInteger(Number(values.group_id)))
      )
        issues.push({ fieldId: field.Group, code: "invalid_value" })
      if (typeof values.ip_whitelist !== "string")
        issues.push({ fieldId: field.IpWhitelist, code: "invalid_value" })
      if (key) {
        if (
          values.expires_at &&
          (typeof values.expires_at !== "string" ||
            !Number.isFinite(Date.parse(values.expires_at)))
        )
          issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
        if (typeof values.enabled !== "boolean")
          issues.push({ fieldId: field.Enabled, code: "invalid_value" })
      } else if (
        values.expires_in_days != null &&
        (!Number.isSafeInteger(values.expires_in_days) ||
          Number(values.expires_in_days) <= 0)
      )
        issues.push({ fieldId: field.ExpiresInDays, code: "out_of_range" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== field.Group) return []
      const groups = await fetchSub2ApiGroupDescriptors({
        ...request,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      })
      return groups
        .filter((group) => !allowedIds || allowedIds.has(String(group.id)))
        .map((group) => ({
          value: String(group.id),
          displayLabel: group.displayName,
          secondaryLabel: `${group.description} · #${group.id}`,
        }))
    },
    buildCommand(values) {
      const name = (values.name as string).trim()
      const group_id = values.group_id == null ? null : Number(values.group_id)
      const quota = values.unlimited ? 0 : (values.quota as number)
      const ip_whitelist = (values.ip_whitelist as string)
        .split(/[,\n]/)
        .map((ip) => ip.trim())
        .filter(Boolean)
      const expires_at = values.expires_at
        ? new Date(values.expires_at as string).toISOString()
        : ""
      const status =
        key && values.enabled !== (baseline.status === "active")
          ? values.enabled
            ? "active"
            : "inactive"
          : baseline.status
      return {
        baseline,
        values: { name, group_id, quota, ip_whitelist, expires_at, status },
        create: {
          name,
          group_id,
          quota,
          ip_whitelist,
          ...(values.expires_in_days == null
            ? {}
            : { expires_in_days: values.expires_in_days as number }),
        },
      }
    },
  }
}
