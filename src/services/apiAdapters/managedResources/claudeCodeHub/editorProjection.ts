import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeOptions,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
  isClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  nonExactAllowedModels,
  normalizeClaudeCodeHubAllowedModels,
  providerType,
  secretState,
  toExactAllowedModels,
} from "~/services/apiAdapters/managedResources/claudeCodeHub/displayFacts"
import {
  type ClaudeCodeHubNativeResourceOperations,
  type ClaudeCodeHubNativeUpdateCommand,
} from "~/services/apiAdapters/managedResources/claudeCodeHub/nativeContracts"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type {
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
} from "~/types/claudeCodeHub"
import { normalizeList } from "~/utils/core/string"

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

const readList = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? normalizeList(
        value.filter((item): item is string => typeof item === "string"),
      )
    : []
}

const readSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values[fields.Key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
  }
  const candidate = value as { kind?: unknown; value?: unknown }
  if (
    candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
    typeof candidate.value === "string"
  ) {
    return {
      kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
      value: candidate.value,
    }
  }
  if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear) {
    return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }
  }
  return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value.trim())
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

const typeOptions = (detail?: ClaudeCodeHubProviderDisplay) => {
  const options = ClaudeCodeHubProviderTypeOptions.map(({ value }) => ({
    value,
  }))
  const currentType = detail && providerType(detail)
  return currentType && !isClaudeCodeHubProviderType(currentType)
    ? [...options, { value: currentType }]
    : options
}

const fieldDescriptors = (
  detail?: ClaudeCodeHubProviderDisplay,
): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: fields.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: fields.Type,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    options: typeOptions(detail),
  },
  {
    fieldId: fields.Status,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    options: [
      { value: MANAGED_RESOURCE_STATUSES.Enabled },
      { value: MANAGED_RESOURCE_STATUSES.Disabled },
    ],
  },
  {
    fieldId: fields.BaseUrl,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: detail === undefined,
    secretState:
      detail === undefined
        ? MANAGED_RESOURCE_SECRET_STATES.Unavailable
        : secretState(detail),
    canLoadSecret: detail !== undefined,
    canReplace: true,
    allowClear: false,
  },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: normalizeClaudeCodeHubAllowedModels(detail?.allowedModels).map(
      (value) => ({ value }),
    ),
  },
  { fieldId: fields.GroupTag, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 0,
    step: 1,
  },
  {
    fieldId: fields.Weight,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 1,
    max: 100,
    step: 1,
  },
]

const initialValues = (
  detail?: ClaudeCodeHubProviderDisplay,
): EditableResourceProjection => ({
  [fields.Name]: detail?.name ?? "",
  [fields.Type]: detail
    ? providerType(detail)
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [fields.Status]:
    detail?.isEnabled === false
      ? MANAGED_RESOURCE_STATUSES.Disabled
      : MANAGED_RESOURCE_STATUSES.Enabled,
  [fields.BaseUrl]: detail?.url ?? "",
  [fields.Key]: detail
    ? { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
    : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace, value: "" },
  [fields.Models]: normalizeClaudeCodeHubAllowedModels(detail?.allowedModels),
  [fields.GroupTag]: detail ? detail.groupTag?.trim() || "" : "default",
  [fields.Priority]: detail?.priority ?? 0,
  [fields.Weight]:
    typeof detail?.weight === "number" && Number.isFinite(detail.weight)
      ? Math.max(1, detail.weight)
      : 1,
})

export const validateValues = (
  values: EditableResourceProjection,
  detail?: ClaudeCodeHubProviderDisplay,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const type = readString(values, fields.Type).trim()
  const existingType = detail ? providerType(detail) : null
  if (!isClaudeCodeHubProviderType(type) && type !== existingType) {
    issues.push({
      fieldId: fields.Type,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const status = readString(values, fields.Status)
  if (
    status !== MANAGED_RESOURCE_STATUSES.Enabled &&
    status !== MANAGED_RESOURCE_STATUSES.Disabled
  ) {
    issues.push({
      fieldId: fields.Status,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const baseUrl = readString(values, fields.BaseUrl)
  if (!baseUrl.trim()) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (!isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const secret = readSecretIntent(values)
  if (
    (!detail &&
      (secret.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
        !hasUsableManagedSiteChannelKey(secret.value))) ||
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value))
  ) {
    issues.push({
      fieldId: fields.Key,
      code: detail
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const priority = readNumber(values, fields.Priority)
  if (!Number.isInteger(priority) || priority < 0) {
    issues.push({
      fieldId: fields.Priority,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  const weight = readNumber(values, fields.Weight)
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
    issues.push({
      fieldId: fields.Weight,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): ClaudeCodeHubProviderCreatePayload => {
  const secret = readSecretIntent(values)
  return {
    name: readString(values, fields.Name).trim(),
    url: readString(values, fields.BaseUrl).trim(),
    key:
      secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? secret.value.trim()
        : "",
    provider_type: readString(values, fields.Type).trim(),
    allowed_models: toExactAllowedModels(readList(values, fields.Models)),
    is_enabled:
      readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled,
    weight: Math.max(1, Math.trunc(readNumber(values, fields.Weight))),
    priority: readNumber(values, fields.Priority),
    group_tag: readString(values, fields.GroupTag).trim() || "default",
  }
}

const buildUpdateCommand = (
  detail: ClaudeCodeHubProviderDisplay,
  values: EditableResourceProjection,
): ClaudeCodeHubNativeUpdateCommand => {
  const models = readList(values, fields.Models)
  const secret = readSecretIntent(values)
  // The v0.9.5 PATCH schema is strict. Send only the editable snake_case
  // projection; provider summaries contain read-only camelCase fields.
  // Source: https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/lib/api/v1/schemas/providers.ts
  const payload: ClaudeCodeHubNativeUpdateCommand = {}
  const name = readString(values, fields.Name).trim()
  if (name !== detail.name.trim()) payload.name = name
  const url = readString(values, fields.BaseUrl).trim()
  if (url !== detail.url.trim()) payload.url = url
  const type = readString(values, fields.Type).trim()
  if (type !== providerType(detail)) payload.provider_type = type
  const initialModels = normalizeClaudeCodeHubAllowedModels(
    detail.allowedModels,
  )
  if (
    models.length !== initialModels.length ||
    models.some((model, index) => model !== initialModels[index])
  ) {
    payload.allowed_models = [
      ...nonExactAllowedModels(detail.allowedModels),
      ...toExactAllowedModels(models),
    ]
  }
  const isEnabled =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  if (isEnabled !== (detail.isEnabled !== false)) {
    payload.is_enabled = isEnabled
  }
  const weight = Math.max(1, Math.trunc(readNumber(values, fields.Weight)))
  const initialWeight =
    typeof detail.weight === "number" && Number.isFinite(detail.weight)
      ? Math.max(1, detail.weight)
      : 1
  if (weight !== initialWeight) payload.weight = weight
  const priority = readNumber(values, fields.Priority)
  if (priority !== (detail.priority ?? 0)) payload.priority = priority
  const groupTag = readString(values, fields.GroupTag).trim() || null
  if (groupTag !== (detail.groupTag?.trim() || null)) {
    payload.group_tag = groupTag
  }
  if (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    payload.key = secret.value.trim()
  }
  return payload
}

export const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...initialValues(),
  [fields.Name]: seed.name,
  [fields.Type]: isClaudeCodeHubProviderType(seed.channelType)
    ? seed.channelType
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [fields.Status]: seed.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  [fields.Models]: normalizeList(seed.models),
  [fields.Priority]: 0,
  [fields.Weight]: 1,
})

export const createEditor =
  (): NativeResourceEditorDefinition<ClaudeCodeHubProviderCreatePayload> => ({
    fields: fieldDescriptors(),
    initialValues: initialValues(),
    validate: (values) => validateValues(values),
    buildCommand: buildCreateCommand,
  })

export const editEditor = (
  operations: ClaudeCodeHubNativeResourceOperations,
  detail: ClaudeCodeHubProviderDisplay,
): NativeResourceEditorDefinition<ClaudeCodeHubNativeUpdateCommand> => ({
  fields: fieldDescriptors(detail),
  initialValues: initialValues(detail),
  validate: (values) => validateValues(values, detail),
  buildCommand: (values) => buildUpdateCommand(detail, values),
  loadSecret: async (fieldId, options) => {
    if (fieldId !== fields.Key) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadSecret(detail.id, options)
  },
})
