import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions,
  type AccountKeyResourceEditIntent,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  RELAYFOR_QUOTA_PER_USD,
  usdToQuota,
} from "~/services/apiService/relayfor/constants"
import {
  toFiniteNumber as readNumber,
  readRelayForStringList as readStringList,
  toOptionalString,
} from "~/services/apiService/relayfor/parsing"
import type {
  RelayForToken,
  RelayForTokenCreateRequest,
  RelayForTokenUpdateRequest,
} from "~/services/apiService/relayfor/type"

import { RELAYFOR_KEY_FIELDS } from "./keyFields"

export type RelayForCreateKeyCommand = RelayForTokenCreateRequest

export type RelayForEditKeyCommand = {
  rotate: boolean
  payload: RelayForTokenUpdateRequest
}

const readString = (value: unknown): string => toOptionalString(value) ?? ""

const readBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : fallback

const budgetFields = [
  RELAYFOR_KEY_FIELDS.Budget5h,
  RELAYFOR_KEY_FIELDS.BudgetDay,
  RELAYFOR_KEY_FIELDS.BudgetWeek,
  RELAYFOR_KEY_FIELDS.BudgetMonth,
] as const
const rateFields = [
  RELAYFOR_KEY_FIELDS.RequestsPerMinute,
  RELAYFOR_KEY_FIELDS.ConcurrentRequests,
] as const
const limitDescriptors: Extract<
  ResourceFieldDescriptor,
  { type: typeof RESOURCE_FIELD_TYPES.Number }
>[] = [
  ...budgetFields.map((fieldId) => ({
    fieldId,
    type: RESOURCE_FIELD_TYPES.Number,
    min: 0,
    step: 0.01,
  })),
  ...rateFields.map((fieldId) => ({
    fieldId,
    type: RESOURCE_FIELD_TYPES.Number,
    min: 0,
    step: 1,
    max: fieldId === RELAYFOR_KEY_FIELDS.RequestsPerMinute ? 100000 : 10000,
  })),
]
const limitValues = (detail?: RelayForToken) =>
  Object.fromEntries([
    ...budgetFields.map((id) => [
      id,
      readNumber(detail?.limits?.[id]) / RELAYFOR_QUOTA_PER_USD,
    ]),
    ...rateFields.map((id) => [id, readNumber(detail?.limits?.[id])]),
  ])
const buildLimits = (
  values: EditableResourceProjection,
  detail?: RelayForToken,
) => ({
  ...detail?.limits,
  ...Object.fromEntries([
    ...budgetFields.map((id) => [id, usdToQuota(readNumber(values[id]))]),
    ...rateFields.map((id) => [id, readNumber(values[id])]),
  ]),
})

const validateKeyValues = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const issues: {
    fieldId: string
    code: typeof RESOURCE_FIELD_ISSUE_CODES.InvalidValue
  }[] = []
  const check = (fieldId: string, valid: boolean) => {
    if (!valid)
      issues.push({ fieldId, code: RESOURCE_FIELD_ISSUE_CODES.InvalidValue })
  }
  if (!readString(values[RELAYFOR_KEY_FIELDS.Name]))
    return {
      valid: false,
      issues: [
        {
          fieldId: RELAYFOR_KEY_FIELDS.Name,
          code: RESOURCE_FIELD_ISSUE_CODES.Required,
        },
      ],
    }
  for (const field of limitDescriptors) {
    const raw = values[field.fieldId]
    const n = Number(raw ?? 0)
    check(
      field.fieldId,
      Number.isFinite(n) &&
        n >= 0 &&
        (!rateFields.some((id) => id === field.fieldId) ||
          (Number.isInteger(n) && n <= (field.max ?? Infinity))),
    )
  }
  const quota = Number(values[RELAYFOR_KEY_FIELDS.QuotaUsd] ?? -1)
  check(
    RELAYFOR_KEY_FIELDS.QuotaUsd,
    Number.isFinite(quota) && (quota === -1 || quota >= 0),
  )
  const expiry = readString(values[RELAYFOR_KEY_FIELDS.ExpiredAt])
  check(
    RELAYFOR_KEY_FIELDS.ExpiredAt,
    !expiry || Number.isFinite(new Date(expiry).getTime()),
  )
  return issues.length ? { valid: false, issues } : { valid: true }
}

const keyEditorFields = () => [
  ...limitDescriptors,
  {
    fieldId: RELAYFOR_KEY_FIELDS.Name,
    type: RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: RELAYFOR_KEY_FIELDS.UnlimitedQuota,
    type: RESOURCE_FIELD_TYPES.Boolean,
  },
  {
    fieldId: RELAYFOR_KEY_FIELDS.QuotaUsd,
    type: RESOURCE_FIELD_TYPES.Number,
    min: -1,
    step: 0.000001,
  },
  {
    fieldId: RELAYFOR_KEY_FIELDS.ExpiredAt,
    type: RESOURCE_FIELD_TYPES.DateTime,
    nullable: true,
  },
  {
    fieldId: RELAYFOR_KEY_FIELDS.IpLimits,
    type: RESOURCE_FIELD_TYPES.Textarea,
  },
  {
    fieldId: RELAYFOR_KEY_FIELDS.ModelLimits,
    type: RESOURCE_FIELD_TYPES.Textarea,
  },
]

/** Converts editor values while preserving provider-only limit settings on edits. */
const buildKeyPayload = (
  values: EditableResourceProjection,
  detail?: RelayForToken,
): RelayForTokenCreateRequest => {
  const quotaUsd = readNumber(
    detail
      ? values[RELAYFOR_KEY_FIELDS.QuotaUsd]
      : values[RELAYFOR_KEY_FIELDS.QuotaUsd] ?? -1,
  )
  const expiry = readString(values[RELAYFOR_KEY_FIELDS.ExpiredAt])
  return {
    limits: buildLimits(values, detail),
    name: readString(values[RELAYFOR_KEY_FIELDS.Name]),
    unlimited_quota: readBoolean(
      values[RELAYFOR_KEY_FIELDS.UnlimitedQuota],
      detail?.unlimited_quota ?? false,
    ),
    remain_quota: quotaUsd < 0 ? -1 : usdToQuota(quotaUsd),
    expires_at: expiry ? new Date(expiry).toISOString() : "",
    ip_limits: readStringList(values[RELAYFOR_KEY_FIELDS.IpLimits]).join(","),
    model_limits: readStringList(values[RELAYFOR_KEY_FIELDS.ModelLimits]),
  }
}

/**
 * Creates the key creation editor definition for RelayFor tokens.
 */
export function createRelayForKeyEditor(
  nameHint?: string,
): AccountKeyResourceEditorDefinition<RelayForCreateKeyCommand> {
  return {
    fields: keyEditorFields(),
    initialValues: {
      ...limitValues(),
      [RELAYFOR_KEY_FIELDS.Name]:
        nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
      [RELAYFOR_KEY_FIELDS.UnlimitedQuota]: false,
      [RELAYFOR_KEY_FIELDS.QuotaUsd]: -1,
      [RELAYFOR_KEY_FIELDS.ExpiredAt]: "",
      [RELAYFOR_KEY_FIELDS.IpLimits]: "",
      [RELAYFOR_KEY_FIELDS.ModelLimits]: "",
    },
    validate: validateKeyValues,
    buildCommand: (values) => buildKeyPayload(values),
  }
}

/**
 * Creates the key editing editor definition for RelayFor tokens.
 */
export function editRelayForKeyEditor(
  detail: RelayForToken,
  intent?: AccountKeyResourceEditIntent,
): AccountKeyResourceEditorDefinition<RelayForEditKeyCommand> {
  const action = intent?.action
  if (
    action === editActions.Rotate ||
    action === editActions.Enable ||
    action === editActions.Disable
  ) {
    return {
      action,
      fields: [],
      initialValues: {},
      validate: () => ({ valid: true }),
      buildCommand: () => ({
        rotate: action === editActions.Rotate,
        payload:
          action === editActions.Rotate
            ? {}
            : { status: action === editActions.Enable ? 1 : 2 },
      }),
    }
  }
  return {
    fields: keyEditorFields(),
    initialValues: {
      ...limitValues(detail),
      [RELAYFOR_KEY_FIELDS.Name]: detail.name,
      [RELAYFOR_KEY_FIELDS.UnlimitedQuota]: detail.unlimited_quota,
      [RELAYFOR_KEY_FIELDS.QuotaUsd]:
        detail.remain_quota < 0
          ? -1
          : detail.remain_quota / RELAYFOR_QUOTA_PER_USD,
      [RELAYFOR_KEY_FIELDS.ExpiredAt]: detail.expired_at || "",
      [RELAYFOR_KEY_FIELDS.IpLimits]: readStringList(detail.ip_limits).join(
        ",",
      ),
      [RELAYFOR_KEY_FIELDS.ModelLimits]: (detail.model_limits || []).join("\n"),
    },
    validate: validateKeyValues,
    buildCommand: (values) => {
      return { rotate: false, payload: buildKeyPayload(values, detail) }
    },
  }
}
