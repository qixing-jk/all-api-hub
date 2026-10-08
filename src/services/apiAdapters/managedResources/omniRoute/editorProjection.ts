import {
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS as fields,
  OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS,
  OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  OMNIROUTE_PRIORITY_RANGE,
} from "~/constants/omniroute"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceFieldOption,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import {
  editablePriority,
  toSecretState,
} from "~/services/apiAdapters/managedResources/omniRoute/displayFacts"
import {
  type OmniRouteNativeCreateCommand,
  type OmniRouteNativeResourceOperations,
  type OmniRouteNativeUpdateCommand,
} from "~/services/apiAdapters/managedResources/omniRoute/nativeContracts"
import { type OmniRouteSanitizedConnection } from "~/services/apiService/omniroute/redaction"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { normalizeList } from "~/utils/core/string"

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

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

/** A node prefix becomes a `prefix/model` address, so it must be a URL-safe token. */
const isModelPrefix = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)

/**
 * The gateway exposes no provider-catalogue route, so the select starts from the
 * providers this integration knows by endpoint and can be refreshed from the
 * deployment's own model catalogue.
 *
 * Provider ids are slugs with no display name of their own, so the label is the
 * id: a generated "unknown" label would hide what is actually being written.
 */
export const providerOption = (value: string): ResourceFieldOption => ({
  value,
  displayLabel: value,
})

const providerOptions = (): readonly ResourceFieldOption[] =>
  Object.keys(OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS)
    .sort((left, right) => left.localeCompare(right))
    .map(providerOption)

const createFieldDescriptors = (): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: fields.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: fields.Provider,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    options: providerOptions(),
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: true,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canReplace: true,
    allowClear: false,
  },
  { fieldId: fields.DefaultModel, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  { fieldId: fields.Prefix, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
]

const editFieldDescriptors = (
  sanitized: OmniRouteSanitizedConnection,
): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: fields.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
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
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    secretState: toSecretState(sanitized.secretState),
    canLoadSecret: true,
    canReplace: true,
    allowClear: false,
  },
  { fieldId: fields.DefaultModel, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    // Only the update route takes a rank: the create route auto-assigns
    // `MAX(priority) + 1` when it is omitted, so a new channel is ordered by the
    // gateway and only ever reordered afterwards.
    fieldId: fields.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: OMNIROUTE_PRIORITY_RANGE.min,
    max: OMNIROUTE_PRIORITY_RANGE.max,
    step: 1,
  },
]

const createInitialValues = (): EditableResourceProjection => ({
  [fields.Name]: "",
  [fields.Provider]: OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  [fields.BaseUrl]: "",
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
  [fields.DefaultModel]: "",
  [fields.Prefix]: "",
})

const editInitialValues = (
  sanitized: OmniRouteSanitizedConnection,
): EditableResourceProjection => ({
  [fields.Name]: sanitized.name,
  [fields.Status]: sanitized.isActive
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.BaseUrl]: sanitized.baseUrl,
  [fields.Key]: { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
  [fields.DefaultModel]: sanitized.defaultModel,
  [fields.Priority]: editablePriority(sanitized),
})

export const validateCreateValues = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (!readString(values, fields.Provider).trim()) {
    issues.push({
      fieldId: fields.Provider,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && !isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const prefix = readString(values, fields.Prefix).trim()
  if (prefix && !isModelPrefix(prefix)) {
    issues.push({
      fieldId: fields.Prefix,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  // A provider node carries its own base URL, so the prefix path cannot fall
  // back to the built-in provider's static endpoint.
  if (prefix && !baseUrl) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const secret = readSecretIntent(values)
  if (
    secret.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
    !hasUsableManagedSiteChannelKey(secret.value)
  ) {
    issues.push({
      fieldId: fields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const validateEditValues = (
  sanitized: OmniRouteSanitizedConnection,
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
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
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && !isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  // A stored override cannot be removed: the gateway rejects an empty or null
  // `providerSpecificData.baseUrl` with a 400 and deletes no other key from the
  // merged object. Clearing the field would therefore always fail, so it is
  // refused here with the field help explaining why.
  if (!baseUrl && sanitized.baseUrl) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const secret = readSecretIntent(values)
  if (
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value))
  ) {
    issues.push({
      fieldId: fields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const priority = readNumber(values, fields.Priority)
  if (
    !Number.isInteger(priority) ||
    priority < OMNIROUTE_PRIORITY_RANGE.min ||
    priority > OMNIROUTE_PRIORITY_RANGE.max
  ) {
    issues.push({
      fieldId: fields.Priority,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): OmniRouteNativeCreateCommand => {
  const secret = readSecretIntent(values)
  return {
    provider: readString(values, fields.Provider).trim(),
    name: readString(values, fields.Name).trim(),
    apiKey:
      secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? secret.value.trim()
        : "",
    baseUrl: readString(values, fields.BaseUrl).trim(),
    defaultModel: readString(values, fields.DefaultModel).trim(),
    prefix: readString(values, fields.Prefix).trim(),
  }
}

const buildUpdateCommand = (
  sanitized: OmniRouteSanitizedConnection,
  values: EditableResourceProjection,
): OmniRouteNativeUpdateCommand => {
  const payload: OmniRouteNativeUpdateCommand = {}
  const name = readString(values, fields.Name).trim()
  if (name !== sanitized.name) payload.name = name
  const isActive =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  if (isActive !== sanitized.isActive) payload.isActive = isActive
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && baseUrl !== sanitized.baseUrl) {
    payload.providerSpecificData = { baseUrl }
  }
  const defaultModel = readString(values, fields.DefaultModel).trim()
  if (defaultModel !== sanitized.defaultModel) {
    payload.defaultModel = defaultModel || null
  }
  const priority = readNumber(values, fields.Priority)
  if (Number.isInteger(priority) && priority !== editablePriority(sanitized)) {
    payload.priority = priority
  }
  const secret = readSecretIntent(values)
  if (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    payload.apiKey = secret.value.trim()
  }
  return payload
}

export const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [fields.Name]: seed.name,
  [fields.Provider]:
    seed.channelType.trim() || OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  // A connection stores one default model rather than a list, so the first
  // advertised model is the only honest prefill.
  [fields.DefaultModel]: normalizeList([...seed.models])[0] ?? "",
})

export const createEditor = (
  operations: OmniRouteNativeResourceOperations,
): NativeResourceEditorDefinition<OmniRouteNativeCreateCommand> => ({
  fields: createFieldDescriptors(),
  initialValues: createInitialValues(),
  validate: validateCreateValues,
  buildCommand: buildCreateCommand,
  loadOptions: async (fieldId, _values, options) => {
    if (fieldId !== fields.Provider) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadProviderOptions(options)
  },
})

export const editEditor = (
  operations: OmniRouteNativeResourceOperations,
  sanitized: OmniRouteSanitizedConnection,
): NativeResourceEditorDefinition<OmniRouteNativeUpdateCommand> => ({
  fields: editFieldDescriptors(sanitized),
  initialValues: editInitialValues(sanitized),
  validate: (values) => validateEditValues(sanitized, values),
  buildCommand: (values) => buildUpdateCommand(sanitized, values),
  loadSecret: async (fieldId, options) => {
    if (fieldId !== fields.Key) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadSecret(sanitized.id, options)
  },
})
