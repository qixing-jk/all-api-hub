import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_ISSUE_CODES as issueCodes,
  RESOURCE_FIELD_TYPES as types,
  type EditableResourceProjection,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { NANOGPT_KEY_POLICIES as policies } from "~/services/apiService/nanogpt/constants"
import {
  NANOGPT_KEY_LIMIT_FIELDS,
  type NanoGptKey,
  type NanoGptKeyWrite,
  type NanoGptLimitField,
} from "~/services/apiService/nanogpt/management"

const NANOGPT_KEY_VALIDATION = {
  maxNameLength: 120,
  maxUsdLimit: 100_000,
  maxDailyRequests: 10_000_000,
  maxIntegerLimit: 2_147_483_647,
  usdStep: 0.0001,
  integerStep: 1,
  stepTolerance: 0.000001,
} as const

const nanoGptLimitBounds = (field: NanoGptLimitField) => ({
  max: field.endsWith("usd_limit")
    ? NANOGPT_KEY_VALIDATION.maxUsdLimit
    : field === "daily_rpd_limit"
      ? NANOGPT_KEY_VALIDATION.maxDailyRequests
      : NANOGPT_KEY_VALIDATION.maxIntegerLimit,
  step: field.endsWith("usd_limit")
    ? NANOGPT_KEY_VALIDATION.usdStep
    : NANOGPT_KEY_VALIDATION.integerStep,
})

/** PATCH is a projection of changed fields, never a replacement of the native key. */
export function nanoGptKeyEditor(
  detail?: NanoGptKey,
  nameHint?: string,
): AccountKeyResourceEditorDefinition<Partial<NanoGptKeyWrite>> {
  const initialValues: EditableResourceProjection = {
    name: detail?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
    expires_at: detail?.expires_at ?? null,
    zdr_policy: detail?.zdr_policy ?? policies.Off,
    ...Object.fromEntries(
      NANOGPT_KEY_LIMIT_FIELDS.map((field) => [field, detail?.[field] ?? null]),
    ),
  }
  return {
    fields: [
      { fieldId: "name", type: types.Text, required: true },
      { fieldId: "expires_at", type: types.DateTime, nullable: true },
      {
        fieldId: "zdr_policy",
        type: types.Select,
        required: true,
        options: [
          policies.ZeroDataRetention,
          policies.Off,
          ...(detail?.zdr_policy === policies.Unset ? [policies.Unset] : []),
        ].map((value) => ({ value })),
      },
      ...NANOGPT_KEY_LIMIT_FIELDS.map((field) => ({
        fieldId: field,
        type: types.Number,
        nullable: true,
        min: 0,
        ...nanoGptLimitBounds(field),
      })),
    ],
    initialValues,
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: "name", code: issueCodes.Required })
      else if (values.name.trim().length > NANOGPT_KEY_VALIDATION.maxNameLength)
        issues.push({ fieldId: "name", code: issueCodes.OutOfRange })
      if (
        ![policies.ZeroDataRetention, policies.Off].some(
          (policy) => policy === String(values.zdr_policy),
        ) &&
        !(
          detail?.zdr_policy === policies.Unset &&
          values.zdr_policy === policies.Unset
        )
      )
        issues.push({
          fieldId: "zdr_policy",
          code: issueCodes.UnsupportedOption,
        })
      if (
        values.expires_at !== null &&
        (typeof values.expires_at !== "string" ||
          !Number.isFinite(Date.parse(values.expires_at)))
      )
        issues.push({ fieldId: "expires_at", code: issueCodes.InvalidValue })
      for (const field of NANOGPT_KEY_LIMIT_FIELDS) {
        const value = values[field]
        const { max, step } = nanoGptLimitBounds(field)
        if (
          value !== null &&
          (typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            value > max ||
            Math.abs(value / step - Math.round(value / step)) >
              NANOGPT_KEY_VALIDATION.stepTolerance)
        )
          issues.push({ fieldId: field, code: issueCodes.OutOfRange })
      }
      return { valid: issues.length === 0, issues }
    },
    buildCommand(values) {
      const command: Partial<NanoGptKeyWrite> = {}
      for (const field of [
        "name",
        "expires_at",
        "zdr_policy",
        ...NANOGPT_KEY_LIMIT_FIELDS,
      ]) {
        const value =
          field === "name" ? String(values.name).trim() : values[field]
        if (
          (!detail || value !== initialValues[field]) &&
          !(field === "zdr_policy" && value === policies.Unset)
        )
          Object.assign(command, {
            [field]:
              field === "expires_at" && typeof value === "string"
                ? new Date(value).toISOString()
                : value,
          })
      }
      return command
    },
  }
}
