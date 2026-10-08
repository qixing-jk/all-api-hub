import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_TYPES as types,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/resourceNative"
import type { NewApiKeyEditCommand } from "~/services/apiAdapters/newApi/keys/keyResourceEditor"
import {
  LAOZHANG_BILLING_TYPES as billing,
  LAOZHANG_KEY_FIELD_IDS as field,
  LAOZHANG_AUTO_GROUP,
  LAOZHANG_RETRY_BILLING_MODES as retryBilling,
} from "~/services/apiAdapters/newApi/keys/laozhangKeyResourceFields"

const billingTypeOptions: readonly string[] = Object.values(billing)
const retryBillingOptions: readonly string[] = Object.values(retryBilling)

const textFields = [
  field.Remark,
  field.DiscordProxyUrl,
  field.TranslationBaseUrl,
  field.TranslationModel,
  field.RateLimitMessage,
] as const
const booleanFields = [
  field.ActivateOnFirstUse,
  field.TranslationEnabled,
  field.RateLimitEnabled,
] as const
const numericFields = {
  [field.ValidDuration]: 18000,
  [field.RateLimitDuration]: 18000,
  [field.RateLimitNum]: Number.MAX_SAFE_INTEGER,
} as const
const splitGroups = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : []

/** Adds the ordinary-account settings exposed by LaoZhang's native token form. */
export function withLaozhangKeySettings(
  base: AccountKeyResourceEditorDefinition<NewApiKeyEditCommand>,
): AccountKeyResourceEditorDefinition<NewApiKeyEditCommand> {
  const baseline = base.buildCommand(base.initialValues).baseline
  const savedSecret =
    typeof baseline[field.TranslationApiKey] === "string"
      ? baseline[field.TranslationApiKey]
      : ""
  const initialValues = {
    ...base.initialValues,
    ...Object.fromEntries(
      textFields.map((id) => [
        id,
        typeof baseline[id] === "string" ? baseline[id] : "",
      ]),
    ),
    ...Object.fromEntries(
      Object.keys(numericFields).map((id) => [id, Number(baseline[id]) || 0]),
    ),
    [field.BillingType]: String(
      baseline[field.BillingType] ?? billing.UsagePriority,
    ),
    [field.FallbackGroups]: splitGroups(baseline[field.FallbackGroups]),
    [field.RetryBilling]:
      baseline[field.RetryBilling] == null
        ? retryBilling.Auto
        : baseline[field.RetryBilling] === true
          ? retryBilling.On
          : retryBilling.Off,
    [field.ActivateOnFirstUse]: baseline[field.ActivateOnFirstUse] === true,
    [field.TranslationEnabled]: baseline[field.TranslationEnabled] === true,
    [field.TranslationApiKey]: { kind: "unchanged" } as SecretEditIntent,
    [field.RateLimitEnabled]: Boolean(
      baseline[field.RateLimitDuration] ||
        baseline[field.RateLimitNum] ||
        baseline[field.RateLimitMessage],
    ),
  }
  const extraFields: ResourceFieldDescriptor[] = [
    {
      fieldId: field.BillingType,
      type: types.Select,
      options: billingTypeOptions.map((value) => ({ value })),
    },
    {
      fieldId: field.FallbackGroups,
      type: types.MultiSelect,
      options: initialValues[field.FallbackGroups].map((value) => ({ value })),
      optionLoader: { dependsOn: ["group"] },
    },
    {
      fieldId: field.RetryBilling,
      type: types.Select,
      options: retryBillingOptions.map((value) => ({ value })),
    },
    ...textFields.map(
      (fieldId) => ({ fieldId, type: types.Textarea }) as const,
    ),
    ...booleanFields.map(
      (fieldId) => ({ fieldId, type: types.Boolean }) as const,
    ),
    ...Object.entries(numericFields).map(
      ([fieldId, max]) =>
        ({ fieldId, type: types.Number, min: 0, max, step: 1 }) as const,
    ),
    {
      fieldId: field.TranslationApiKey,
      type: types.Secret,
      secretState: savedSecret ? "masked" : "unavailable",
      canReplace: true,
      allowClear: true,
    },
  ]
  return {
    ...base,
    fields: [...base.fields, ...extraFields],
    initialValues,
    async loadOptions(fieldId, values, options) {
      if (fieldId !== field.FallbackGroups)
        return base.loadOptions?.(fieldId, values, options) ?? []
      if (values.group === LAOZHANG_AUTO_GROUP) return []
      return (
        (await base.loadOptions?.("group", values, options)) ?? []
      ).filter(
        (option) =>
          option.value !== values.group && option.value !== LAOZHANG_AUTO_GROUP,
      )
    },
    validate(values) {
      const common = base.validate(values)
      const issues: ResourceFieldIssue[] = common.valid
        ? []
        : [...common.issues]
      if (
        !billingTypeOptions.includes(String(values[field.BillingType])) ||
        typeof values[field.BillingType] !== "string"
      )
        issues.push({ fieldId: field.BillingType, code: "unsupported_option" })
      if (!retryBillingOptions.includes(String(values[field.RetryBilling])))
        issues.push({
          fieldId: field.RetryBilling,
          code: "unsupported_option",
        })
      for (const id of booleanFields)
        if (typeof values[id] !== "boolean")
          issues.push({ fieldId: id, code: "invalid_value" })
      for (const id of textFields)
        if (typeof values[id] !== "string")
          issues.push({ fieldId: id, code: "invalid_value" })
      for (const [id, max] of Object.entries(numericFields)) {
        if (
          id.startsWith("rate_limit_") &&
          values[field.RateLimitEnabled] !== true
        )
          continue
        const value = values[id]
        if (
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > max
        )
          issues.push({ fieldId: id, code: "out_of_range" })
      }
      const groups = values[field.FallbackGroups]
      if (
        !Array.isArray(groups) ||
        groups.some(
          (group) =>
            typeof group !== "string" ||
            !group.trim() ||
            group.includes(",") ||
            group === LAOZHANG_AUTO_GROUP ||
            group === values.group,
        ) ||
        new Set(groups).size !== groups.length
      )
        issues.push({ fieldId: field.FallbackGroups, code: "invalid_value" })
      const secret = values[field.TranslationApiKey] as
        | SecretEditIntent
        | undefined
      if (
        !secret ||
        !["unchanged", "replace", "clear"].includes(secret.kind) ||
        (secret.kind === "replace" &&
          (typeof secret.value !== "string" || !secret.value.trim()))
      )
        issues.push({ fieldId: field.TranslationApiKey, code: "invalid_value" })
      if (values[field.TranslationEnabled] === true) {
        for (const id of [field.TranslationBaseUrl, field.TranslationModel])
          if (typeof values[id] === "string" && !values[id].trim())
            issues.push({ fieldId: id, code: "required" })
        if (
          secret?.kind === "clear" ||
          (secret?.kind === "unchanged" && !savedSecret)
        )
          issues.push({ fieldId: field.TranslationApiKey, code: "required" })
      }
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand(values) {
      const command = base.buildCommand(values)
      const secret = values[field.TranslationApiKey] as SecretEditIntent
      return {
        ...command,
        values: {
          ...command.values,
          ...Object.fromEntries(textFields.map((id) => [id, values[id]])),
          ...Object.fromEntries(
            Object.keys(numericFields).map((id) => [id, values[id]]),
          ),
          [field.BillingType]: Number(values[field.BillingType]),
          [field.FallbackGroups]:
            values.group === LAOZHANG_AUTO_GROUP
              ? ""
              : (values[field.FallbackGroups] as string[]).join(","),
          [field.ActivateOnFirstUse]: values[field.ActivateOnFirstUse],
          [field.TranslationEnabled]: values[field.TranslationEnabled],
          [field.RetryBilling]:
            values[field.RetryBilling] === retryBilling.Auto
              ? null
              : values[field.RetryBilling] === retryBilling.On,
          ...(values[field.RateLimitEnabled] === true
            ? {}
            : {
                [field.RateLimitDuration]: 0,
                [field.RateLimitNum]: 0,
                [field.RateLimitMessage]: "",
              }),
          ...(secret.kind === "replace"
            ? { [field.TranslationApiKey]: secret.value.trim() }
            : secret.kind === "clear"
              ? { [field.TranslationApiKey]: "" }
              : {}),
        },
      }
    },
  }
}
