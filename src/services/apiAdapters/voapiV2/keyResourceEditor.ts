import { getDefaultAccountKeyName } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { fetchVoApiV2KeyGroupDescriptors } from "~/services/apiService/voapiV2"
import type {
  VoApiV2Key,
  VoApiV2KeyWrite,
} from "~/services/apiService/voapiV2/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { normalizeToMs } from "~/utils/core/formatters"

const VOAPI_V2_KEY_FIELD_IDS = {
  Name: "name",
  Groups: "groups",
  Amount: "amount",
  Unlimited: "boundlessAmount",
  ExpiresAt: "expires_at",
  Enabled: "enable",
  Note: "note",
} as const
const field = VOAPI_V2_KEY_FIELD_IDS

export type VoApiV2KeyEditCommand = {
  baseline: VoApiV2KeyWrite
  values: VoApiV2KeyWrite
}

/** Preserve all fields sent by the official VoAPI v2 key editor. */
export const toVoApiV2KeyWrite = (key: VoApiV2Key): VoApiV2KeyWrite => ({
  name: key.name ?? "",
  groups: (key.groups ?? []).map(Number),
  enable: key.enable ?? true,
  expireTime:
    key.expireTime && key.expireTime > 0 ? normalizeToMs(key.expireTime)! : -1,
  boundlessAmount: key.boundlessAmount === true,
  amount: String(key.amount ?? "0"),
  used: key.used ?? "0",
  note: key.note ?? "",
})

/** VoAPI v2 supports multiple exact groups and its own monetary amount field. */
export function createVoApiV2KeyEditor(
  request: ApiServiceRequest,
  key?: VoApiV2Key,
  intent?: AccountKeyCreationIntent,
  groups?: Awaited<ReturnType<typeof fetchVoApiV2KeyGroupDescriptors>>,
): AccountKeyResourceEditorDefinition<VoApiV2KeyEditCommand> {
  const allowedNames = key ? undefined : intent?.allowedGroups
  const allowedIds = allowedNames
    ? new Set(
        (groups ?? [])
          .filter((group) => allowedNames.includes(group.displayName))
          .map((group) => String(group.id)),
      )
    : null
  const preferred = (groups ?? []).filter((group) =>
    intent?.preferredGroup
      ? group.displayName === intent.preferredGroup
      : allowedNames?.length === 1 && group.displayName === allowedNames[0],
  )
  const baseline: VoApiV2KeyWrite = key
    ? toVoApiV2KeyWrite(key)
    : {
        name:
          intent?.nameHint?.trim() ||
          getDefaultAccountKeyName(
            preferred.length === 1 ? preferred[0].displayName : "",
          ),
        groups: preferred.length === 1 ? [preferred[0].id] : [],
        enable: true,
        expireTime: -1,
        boundlessAmount: false,
        amount: "0",
        used: "0",
        note: "",
      }
  return {
    fields: [
      { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
      {
        fieldId: field.Groups,
        type: RESOURCE_FIELD_TYPES.MultiSelect,
        required: true,
        options: baseline.groups.map((id) => ({
          value: String(id),
          displayLabel: String(id),
        })),
        optionLoader: { dependsOn: [] },
      },
      { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
      {
        fieldId: field.Amount,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 0.000001,
      },
      {
        fieldId: field.ExpiresAt,
        type: RESOURCE_FIELD_TYPES.DateTime,
        nullable: true,
      },
      { fieldId: field.Enabled, type: RESOURCE_FIELD_TYPES.Boolean },
      { fieldId: field.Note, type: RESOURCE_FIELD_TYPES.Textarea },
    ],
    initialValues: {
      name: baseline.name,
      groups: baseline.groups.map(String),
      amount: Number(baseline.amount),
      boundlessAmount: baseline.boundlessAmount,
      expires_at:
        baseline.expireTime > 0
          ? new Date(baseline.expireTime).toISOString()
          : "",
      enable: baseline.enable,
      note: baseline.note,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: field.Name, code: "required" })
      if (
        allowedIds &&
        Array.isArray(values.groups) &&
        values.groups.some((id) => !allowedIds.has(String(id)))
      ) {
        issues.push({ fieldId: field.Groups, code: "invalid_value" })
      }
      if (
        !Array.isArray(values.groups) ||
        values.groups.length === 0 ||
        values.groups.some(
          (id) =>
            typeof id !== "string" ||
            !/^[1-9]\d*$/.test(id) ||
            !Number.isSafeInteger(Number(id)),
        )
      )
        issues.push({ fieldId: field.Groups, code: "required" })
      if (
        !values.boundlessAmount &&
        (typeof values.amount !== "number" ||
          !Number.isFinite(values.amount) ||
          values.amount < 0 ||
          (!key && values.amount === 0))
      )
        issues.push({ fieldId: field.Amount, code: "out_of_range" })
      for (const id of [field.Unlimited, field.Enabled])
        if (typeof values[id] !== "boolean")
          issues.push({ fieldId: id, code: "invalid_value" })
      if (
        values.expires_at &&
        (typeof values.expires_at !== "string" ||
          !Number.isFinite(Date.parse(values.expires_at)))
      )
        issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
      if (typeof values.note !== "string")
        issues.push({ fieldId: field.Note, code: "invalid_value" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== field.Groups) return []
      const groups = await fetchVoApiV2KeyGroupDescriptors({
        ...request,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      })
      return groups
        .filter((group) => !allowedIds || allowedIds.has(String(group.id)))
        .map((group) => ({
          value: String(group.id),
          displayLabel: group.displayName,
          secondaryLabel: `#${group.id}`,
        }))
    },
    buildCommand(values) {
      return {
        baseline,
        values: {
          ...baseline,
          name: (values.name as string).trim(),
          groups: (values.groups as string[]).map(Number),
          amount:
            Number(baseline.amount) === values.amount || values.boundlessAmount
              ? baseline.amount
              : String(values.amount),
          boundlessAmount: values.boundlessAmount === true,
          enable: values.enable === true,
          note: values.note as string,
          expireTime: values.expires_at
            ? Date.parse(values.expires_at as string)
            : -1,
        },
      }
    },
  }
}
