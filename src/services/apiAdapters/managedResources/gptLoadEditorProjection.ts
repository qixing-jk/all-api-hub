import {
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS as fields,
  GPT_LOAD_DEFAULT_CHANNEL_ID,
} from "~/constants/gptLoad"
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
  type ResourceOperationOptions,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  credentialFingerprint,
  withCredentialListEditor,
} from "~/services/apiAdapters/managedResources/credentialListEditor"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import {
  type CredentialRecord,
  type GptLoadGroupCommand,
  type GptLoadGroupDetail,
  type GptLoadGroupEditorCommand,
  type GptLoadNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/gptLoadNativeContracts"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type { GptLoadCredential } from "~/types/gptLoad"

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

const readStringList = (
  values: EditableResourceProjection,
  fieldId: string,
): string[] => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
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

export const channelOption = (
  id: string,
  name: string,
): ResourceFieldOption => ({
  value: id,
  displayLabel: name || id,
})

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
    options: [{ value: GPT_LOAD_DEFAULT_CHANNEL_ID }],
    // `/api/channels` is a cheap authoritative catalogue, so the driver list
    // loads with the editor instead of sitting behind a manual button.
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Automatic,
    },
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: [],
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.PriceMultiplier, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: true,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canReplace: true,
    allowClear: false,
  },
]

const editFieldDescriptors = (): readonly ResourceFieldDescriptor[] => [
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
  {
    // Repointing a group at another channel clears the gateway-bound credential
    // pool, so the driver is fixed while editing.
    fieldId: fields.Provider,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    readOnly: true,
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: [],
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.PriceMultiplier, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Weight,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canLoadSecret: true,
    canReplace: true,
    allowClear: false,
  },
]

const createInitialValues = (): EditableResourceProjection => ({
  [fields.Name]: "",
  [fields.Provider]: GPT_LOAD_DEFAULT_CHANNEL_ID,
  [fields.BaseUrl]: "",
  [fields.Models]: [],
  [fields.PriceMultiplier]: "1",
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
})

const editInitialValues = (
  detail: GptLoadGroupDetail,
): EditableResourceProjection => ({
  [fields.Name]: detail.group.name,
  [fields.Status]: detail.group.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.Provider]: detail.group.channelName || detail.group.channelId,
  [fields.BaseUrl]: detail.group.baseUrl,
  [fields.Models]: [...detail.models],
  [fields.PriceMultiplier]: detail.group.priceMultiplier || "1",
  ...(detail.group.weight === null
    ? {}
    : { [fields.Weight]: detail.group.weight }),
  [fields.Key]: { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
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
  return issues.length ? { valid: false, issues } : { valid: true }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): GptLoadGroupCommand => ({
  name: readString(values, fields.Name).trim(),
  channelId: readString(values, fields.Provider).trim(),
  baseUrl: readString(values, fields.BaseUrl).trim(),
  models: readStringList(values, fields.Models),
  priceMultiplier: readString(values, fields.PriceMultiplier).trim() || "1",
})

const buildUpdateCommand = (
  detail: GptLoadGroupDetail,
  values: EditableResourceProjection,
): GptLoadGroupCommand => {
  const enabled =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  const weightValue = readNumber(values, fields.Weight)
  const weight =
    Number.isInteger(weightValue) &&
    Number.isFinite(weightValue) &&
    weightValue >= 1 &&
    weightValue <= 100
      ? weightValue
      : null
  const baseUrl = readString(values, fields.BaseUrl).trim()
  return {
    name: readString(values, fields.Name).trim(),
    channelId: detail.group.channelId,
    baseUrl,
    models: readStringList(values, fields.Models),
    priceMultiplier: readString(values, fields.PriceMultiplier).trim() || "1",
    enabled,
    weight,
  }
}

export const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [fields.Name]: seed.name,
  [fields.Provider]: seed.channelType.trim() || GPT_LOAD_DEFAULT_CHANNEL_ID,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Models]: [...seed.models],
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
})

/** Masked metadata rows for the editor's saved credential pool. */
const gptLoadKeyMetadata = (
  credentials: readonly GptLoadCredential[],
): CredentialRecord[] =>
  credentials.map((credential) => ({
    id: String(credential.credential_id),
    key: "********",
    fields: {},
  }))

const gptLoadKeyMetadataFingerprint = async (
  records: readonly CredentialRecord[],
): Promise<string> =>
  await credentialFingerprint(records.map((record) => ({ ...record, key: "" })))

/** The newly-typed keys from an editor command's credential-pool shot. */
export const gptLoadReplacementKeys = (
  command: GptLoadGroupEditorCommand,
): string[] =>
  (command.credentialPatch?.entries ?? [])
    .map((entry) =>
      entry.secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? entry.secret.value.trim()
        : "",
    )
    .filter(Boolean)

const createBaseEditor = (
  operations: GptLoadNativeResourceOperations,
): NativeResourceEditorDefinition<GptLoadGroupCommand> => ({
  fields: createFieldDescriptors(),
  initialValues: createInitialValues(),
  validate: validateCreateValues,
  buildCommand: (values: EditableResourceProjection) =>
    buildCreateCommand(values),
  loadOptions: async (
    fieldId: string,
    _values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => {
    if (fieldId === fields.Provider) {
      return await operations.loadChannelOptions(options)
    }
    if (fieldId === fields.Models) {
      return await operations.loadModelOptions(options)
    }
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  },
})

export const createEditor = async (
  operations: GptLoadNativeResourceOperations,
  options?: ResourceOperationOptions,
) => {
  void options
  const base = createBaseEditor(operations)
  // Every create row is a brand-new key; the shared list editor turns the
  // single secret into additive rows.
  const records: CredentialRecord[] = []
  return await withCredentialListEditor(
    base,
    fields.Key,
    records,
    false,
    undefined,
    [],
    gptLoadKeyMetadataFingerprint,
  )
}

export const editEditor = async (
  operations: GptLoadNativeResourceOperations,
  detail: GptLoadGroupDetail,
  options?: ResourceOperationOptions,
) => {
  void options
  const base: NativeResourceEditorDefinition<GptLoadGroupCommand> = {
    fields: editFieldDescriptors(),
    initialValues: editInitialValues(detail),
    validate: (values: EditableResourceProjection) =>
      validateEditValues(values),
    buildCommand: (values: EditableResourceProjection) =>
      buildUpdateCommand(detail, values),
    loadOptions: async (
      fieldId: string,
      _values: EditableResourceProjection,
      loadOptions?: ResourceOperationOptions,
    ) => {
      if (fieldId === fields.Models) {
        return await operations.loadModelOptions(loadOptions)
      }
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    },
  }
  const records = gptLoadKeyMetadata(detail.credentials)
  return await withCredentialListEditor(
    base,
    fields.Key,
    records,
    true,
    async (loadOptions?: ResourceOperationOptions) =>
      await operations.loadSecret(detail.group.id, loadOptions),
    [],
    gptLoadKeyMetadataFingerprint,
  )
}
