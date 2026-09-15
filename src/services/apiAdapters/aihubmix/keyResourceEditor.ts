import { UI_CONSTANTS } from "~/constants/ui"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  RESOURCE_FIELD_TYPES,
  type ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { fetchAccountAvailableModels } from "~/services/apiService/aihubmix"
import type {
  AIHubMixKey,
  AIHubMixKeyWrite,
} from "~/services/apiService/aihubmix/keyTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

const AIHUBMIX_KEY_FIELD_IDS = {
  Name: "name",
  Quota: "quotaUsd",
  Unlimited: "unlimited_quota",
  ExpiresAt: "expires_at",
  Models: "models",
  Subnet: "subnet",
} as const
const field = AIHUBMIX_KEY_FIELD_IDS
const quotaPerUsd = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
export type AIHubMixKeyEditCommand = {
  baseline: AIHubMixKeyWrite
  values: AIHubMixKeyWrite
}

/** Project the documented AIHubMix write fields, retaining compatible read aliases. */
export const toAIHubMixKeyWrite = (key: AIHubMixKey): AIHubMixKeyWrite => ({
  name: key.name ?? "",
  expired_time: Number(key.expired_time ?? -1),
  unlimited_quota: key.unlimited_quota === true,
  remain_quota: key.unlimited_quota ? -1 : Number(key.remain_quota ?? 0),
  models: key.models ?? key.model_limits ?? "",
  subnet: key.subnet ?? key.allow_ips ?? key.ip_whitelist ?? "",
})

/** AIHubMix offers model and subnet restrictions, with no New API group field. */
export function createAIHubMixKeyEditor(
  request: ApiServiceRequest,
  key?: AIHubMixKey,
  intent?: AccountKeyCreationIntent,
): AccountKeyResourceEditorDefinition<AIHubMixKeyEditCommand> {
  const baseline: AIHubMixKeyWrite = key
    ? toAIHubMixKeyWrite(key)
    : {
        name: intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
        expired_time: -1,
        unlimited_quota: true,
        remain_quota: -1,
        models: intent?.modelContext?.modelId ?? "",
        subnet: "",
      }
  const modelIds = baseline.models
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  return {
    fields: [
      { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
      { fieldId: field.Unlimited, type: RESOURCE_FIELD_TYPES.Boolean },
      {
        fieldId: field.Quota,
        type: RESOURCE_FIELD_TYPES.Number,
        min: 0,
        step: 1 / quotaPerUsd,
      },
      {
        fieldId: field.ExpiresAt,
        type: RESOURCE_FIELD_TYPES.DateTime,
        nullable: true,
      },
      {
        fieldId: field.Models,
        type: RESOURCE_FIELD_TYPES.MultiSelect,
        options: modelIds.map((value) => ({ value, displayLabel: value })),
        optionLoader: { dependsOn: [] },
      },
      { fieldId: field.Subnet, type: RESOURCE_FIELD_TYPES.Textarea },
    ],
    initialValues: {
      name: baseline.name,
      unlimited_quota: baseline.unlimited_quota,
      quotaUsd: Math.max(0, baseline.remain_quota) / quotaPerUsd,
      expires_at:
        baseline.expired_time > 0
          ? new Date(baseline.expired_time * 1000).toISOString()
          : "",
      models: modelIds,
      subnet: baseline.subnet,
    },
    validate(values) {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: field.Name, code: "required" })
      if (typeof values.unlimited_quota !== "boolean")
        issues.push({ fieldId: field.Unlimited, code: "invalid_value" })
      if (
        !values.unlimited_quota &&
        (typeof values.quotaUsd !== "number" ||
          !Number.isFinite(values.quotaUsd) ||
          values.quotaUsd < 0 ||
          !Number.isSafeInteger(Math.round(values.quotaUsd * quotaPerUsd)))
      )
        issues.push({ fieldId: field.Quota, code: "out_of_range" })
      if (
        values.expires_at &&
        (typeof values.expires_at !== "string" ||
          !Number.isFinite(Date.parse(values.expires_at)))
      )
        issues.push({ fieldId: field.ExpiresAt, code: "invalid_value" })
      if (
        !Array.isArray(values.models) ||
        values.models.some((id) => typeof id !== "string")
      )
        issues.push({ fieldId: field.Models, code: "invalid_value" })
      if (typeof values.subnet !== "string")
        issues.push({ fieldId: field.Subnet, code: "invalid_value" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    async loadOptions(fieldId, _values, options) {
      if (fieldId !== field.Models) return []
      return (
        await fetchAccountAvailableModels({
          ...request,
          ...(options?.signal ? { abortSignal: options.signal } : {}),
        })
      ).map((value) => ({ value, displayLabel: value }))
    },
    buildCommand(values) {
      return {
        baseline,
        values: {
          name: (values.name as string).trim(),
          unlimited_quota: values.unlimited_quota === true,
          remain_quota: values.unlimited_quota
            ? -1
            : Math.round((values.quotaUsd as number) * quotaPerUsd),
          expired_time: values.expires_at
            ? Math.floor(Date.parse(values.expires_at as string) / 1000)
            : -1,
          models: (values.models as string[]).join(","),
          subnet: (values.subnet as string).trim(),
        },
      }
    },
  }
}
