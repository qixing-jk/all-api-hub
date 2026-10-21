import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_TYPES as fieldTypes,
  RESOURCE_FIELD_ISSUE_CODES as issueCodes,
  RESOURCE_SECRET_STATES,
  RESOURCE_SECRET_EDIT_INTENT_KINDS as secretIntents,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { ResourceFieldIssue } from "~/services/apiAdapters/contracts/resourceNative"
import { DAYA_KEY_STATUSES } from "~/services/apiService/daya/constants"
import type { DayaGroup, DayaKey } from "~/services/apiService/daya/keys"

import { DAYA_KEY_EDITOR_FIELDS as fields } from "./keyResourceFields"

export type DayaKeyCommand = {
  allowFast: boolean
  customKey?: string
  ipWhitelist: readonly string[]
  ipBlacklist: readonly string[]
  rateLimits: DayaKey["rateLimits"]

  name: string
  groupIds: readonly number[]
  quotaUsd: number
  /** Edit only; create expresses expiry through whole days on the wire. */
  status?: typeof DAYA_KEY_STATUSES.Active | typeof DAYA_KEY_STATUSES.Inactive
  expiresAt?: string | null
  expiresInDays?: number | null
}

export type DayaKeyEditableDetail = {
  allowFast?: boolean
  name: string
  groupIds: readonly number[]
  status: string
  quotaUsd: number
  expiresAt: string | null
  ipWhitelist?: readonly string[] | null
  ipBlacklist?: readonly string[] | null
  rateLimits?: DayaKeyCommand["rateLimits"]
}

const budgetFields = [
  fields.RateLimit5h,
  fields.RateLimit1d,
  fields.RateLimit7d,
] as const
const ipFields = [fields.IpWhitelist, fields.IpBlacklist] as const
const groupOptions = (groups: readonly DayaGroup[]) =>
  groups.map((group) => ({
    value: String(group.id),
    displayLabel: group.name,
    secondaryLabel: `×${group.rateMultiplier}`,
    ...(group.description ? { description: group.description } : {}),
  }))
const parseIps = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : []

/** Native ordered routes, spending controls and create-only custom secret. */
export function createDayaKeyEditor(params: {
  groups: readonly DayaGroup[]
  detail?: DayaKeyEditableDetail
  defaultGroupIds?: readonly number[]
  nameHint?: string
}): AccountKeyResourceEditorDefinition<DayaKeyCommand> {
  const { groups, detail, nameHint } = params
  const isEdit = detail !== undefined
  // Both create and edit prepare the catalogue before exposing the form.
  return {
    fields: [
      { fieldId: fields.AllowFast, type: fieldTypes.Boolean },
      ...ipFields.map((fieldId) => ({ fieldId, type: fieldTypes.Textarea })),
      ...budgetFields.map((fieldId) => ({
        fieldId,
        type: fieldTypes.Number,
        min: 0,
        step: 0.01,
      })),
      ...(!isEdit
        ? [
            {
              fieldId: fields.CustomKey,
              type: fieldTypes.Secret,
              secretState: RESOURCE_SECRET_STATES.Unavailable,
              canReplace: true,
              allowClear: false,
            },
          ]
        : []),
      { fieldId: fields.Name, type: fieldTypes.Text, nullable: true },
      {
        fieldId: fields.Groups,
        type: fieldTypes.MultiSelect,
        required: true,
        options: groupOptions(groups),
      },
      { fieldId: fields.Unlimited, type: fieldTypes.Boolean },
      {
        fieldId: fields.Quota,
        type: fieldTypes.Number,
        min: 0,
        step: 0.01,
      },
      ...(isEdit
        ? [{ fieldId: fields.Enabled, type: fieldTypes.Boolean }]
        : []),
      ...(isEdit
        ? [
            {
              fieldId: fields.ExpiresAt,
              type: fieldTypes.DateTime,
              nullable: true,
            },
          ]
        : [
            {
              fieldId: fields.ExpiresInDays,
              type: fieldTypes.Number,
              min: 1,
              step: 1,
              nullable: true,
            },
          ]),
    ],
    initialValues: {
      [fields.AllowFast]: detail?.allowFast ?? true,
      [fields.CustomKey]: { kind: secretIntents.Unchanged },
      [fields.IpWhitelist]: (detail?.ipWhitelist ?? []).join("\n"),
      [fields.IpBlacklist]: (detail?.ipBlacklist ?? []).join("\n"),
      [fields.RateLimit5h]: detail?.rateLimits?.hours5Usd ?? 0,
      [fields.RateLimit1d]: detail?.rateLimits?.dayUsd ?? 0,
      [fields.RateLimit7d]: detail?.rateLimits?.days7Usd ?? 0,
      [fields.Name]:
        detail?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
      [fields.Groups]: detail
        ? detail.groupIds.map(String)
        : (params.defaultGroupIds ?? []).map(String),
      [fields.Unlimited]: detail ? detail.quotaUsd === 0 : true,
      [fields.Quota]: detail ? detail.quotaUsd : 0,
      [fields.Enabled]: detail
        ? detail.status === DAYA_KEY_STATUSES.Active
        : true,
      [fields.ExpiresAt]: detail?.expiresAt ?? null,
      [fields.ExpiresInDays]: null,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values[fields.AllowFast] !== "boolean")
        issues.push({
          fieldId: fields.AllowFast,
          code: issueCodes.InvalidValue,
        })
      for (const fieldId of budgetFields) {
        const amount = values[fieldId]
        if (
          amount !== undefined &&
          (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)
        )
          issues.push({ fieldId, code: issueCodes.OutOfRange })
      }
      for (const fieldId of ipFields) {
        if (
          values[fieldId] !== undefined &&
          typeof values[fieldId] !== "string"
        )
          issues.push({ fieldId, code: issueCodes.InvalidValue })
      }
      const custom = values[fields.CustomKey]
      if (
        !isEdit &&
        custom !== undefined &&
        (!custom ||
          typeof custom !== "object" ||
          !("kind" in custom) ||
          (custom.kind !== secretIntents.Unchanged &&
            (custom.kind !== secretIntents.Replace ||
              custom.value.length < 16 ||
              !/^[a-zA-Z0-9_-]+$/.test(custom.value))))
      )
        issues.push({
          fieldId: fields.CustomKey,
          code: issueCodes.InvalidValue,
        })
      if (
        values[fields.Name] !== null &&
        typeof values[fields.Name] !== "string"
      )
        issues.push({ fieldId: fields.Name, code: issueCodes.InvalidValue })
      const selected = values[fields.Groups]
      if (!Array.isArray(selected) || selected.length === 0)
        issues.push({ fieldId: fields.Groups, code: issueCodes.Required })
      else {
        const known = new Set(groups.map((group) => String(group.id)))
        for (const value of selected)
          if (typeof value !== "string" || !known.has(value))
            issues.push({
              fieldId: fields.Groups,
              code: issueCodes.UnsupportedOption,
            })
      }
      if (typeof values[fields.Unlimited] !== "boolean")
        issues.push({
          fieldId: fields.Unlimited,
          code: issueCodes.InvalidValue,
        })
      if (
        values[fields.Unlimited] !== true &&
        (typeof values[fields.Quota] !== "number" ||
          !Number.isFinite(values[fields.Quota]) ||
          Math.round((values[fields.Quota] as number) * 100) <= 0)
      )
        issues.push({ fieldId: fields.Quota, code: issueCodes.OutOfRange })
      if (isEdit && typeof values[fields.Enabled] !== "boolean")
        issues.push({ fieldId: fields.Enabled, code: issueCodes.InvalidValue })
      if (
        values[fields.ExpiresAt] !== null &&
        values[fields.ExpiresAt] !== undefined &&
        typeof values[fields.ExpiresAt] !== "string"
      )
        issues.push({
          fieldId: fields.ExpiresAt,
          code: issueCodes.InvalidValue,
        })
      const days = values[fields.ExpiresInDays]
      if (
        !isEdit &&
        days !== null &&
        days !== undefined &&
        (typeof days !== "number" || !Number.isSafeInteger(days) || days <= 0)
      )
        issues.push({
          fieldId: fields.ExpiresInDays,
          code: issueCodes.OutOfRange,
        })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values) {
      const expiresAt = values[fields.ExpiresAt]
      const custom = values[fields.CustomKey]
      return {
        allowFast: values[fields.AllowFast] === true,
        customKey:
          !isEdit &&
          custom &&
          typeof custom === "object" &&
          "kind" in custom &&
          custom.kind === secretIntents.Replace
            ? custom.value
            : undefined,
        ipWhitelist: parseIps(values[fields.IpWhitelist]),
        ipBlacklist: parseIps(values[fields.IpBlacklist]),
        rateLimits: {
          hours5Usd: Number(values[fields.RateLimit5h] ?? 0),
          dayUsd: Number(values[fields.RateLimit1d] ?? 0),
          days7Usd: Number(values[fields.RateLimit7d] ?? 0),
        },
        name: String(values[fields.Name] ?? "").trim(),
        groupIds: (values[fields.Groups] as string[]).map(Number),
        quotaUsd:
          values[fields.Unlimited] === true
            ? 0
            : Math.round(Number(values[fields.Quota]) * 100) / 100,
        status: isEdit
          ? values[fields.Enabled] === false
            ? DAYA_KEY_STATUSES.Inactive
            : DAYA_KEY_STATUSES.Active
          : undefined,
        expiresInDays:
          !isEdit && typeof values[fields.ExpiresInDays] === "number"
            ? (values[fields.ExpiresInDays] as number)
            : null,
        expiresAt:
          typeof expiresAt === "string" && expiresAt.trim()
            ? new Date(expiresAt).toISOString()
            : null,
      }
    },
  }
}
