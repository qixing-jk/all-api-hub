import {
  ChannelType,
  ChannelTypeNames,
  ChannelTypeOptions,
  DEFAULT_CHANNEL_FIELDS,
  NEW_API_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/newApi"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
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
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
  type ResourceSecretState,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannelModelProbe } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import {
  getNewApiResourceSearchData,
  parseNewApiResourceList,
  throwIfNewApiResourceOperationAborted,
} from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/newApi"
import { normalizeList } from "~/utils/core/string"

type NewApiEditorOperations = {
  canLoadSecret: boolean
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  fetchModels(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string[]>
  fetchDraftModels(
    probe: ManagedSiteChannelModelProbe,
    options?: ResourceOperationOptions,
  ): Promise<string[]>
  loadEditorGroups(
    options?: ResourceOperationOptions,
  ): Promise<readonly string[]>
}

const fields = NEW_API_MANAGED_RESOURCE_FIELD_IDS
const editorSecretStates = new WeakMap<
  ManagedSiteChannel,
  ResourceSecretState
>()

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId].trim() : ""

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
  return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

const statusToDisplay = (
  status: ManagedSiteChannel["status"],
): ResourceDisplayFacts["status"] => {
  if (status === CHANNEL_STATUS.Enable) return MANAGED_RESOURCE_STATUSES.Enabled
  if (status === CHANNEL_STATUS.ManuallyDisabled)
    return MANAGED_RESOURCE_STATUSES.ManuallyDisabled
  if (status === CHANNEL_STATUS.AutoDisabled)
    return MANAGED_RESOURCE_STATUSES.AutoDisabled
  return MANAGED_RESOURCE_STATUSES.Unknown
}

const getInventorySecretState = (
  key: ManagedSiteChannel["key"],
): ResourceSecretState => {
  if (hasUsableManagedSiteChannelKey(key))
    return MANAGED_RESOURCE_SECRET_STATES.Available
  return key?.trim()
    ? MANAGED_RESOURCE_SECRET_STATES.Masked
    : MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

export const sanitizeNewApiEditorDetail = (
  detail: ManagedSiteChannel,
): ManagedSiteChannel => {
  const sanitized = { ...detail, key: "" }
  editorSecretStates.set(sanitized, getInventorySecretState(detail.key))
  return sanitized
}

export const toNewApiResourceFacts = (
  channel: ManagedSiteChannel,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const { models, groups, channelType, searchValues } =
    getNewApiResourceSearchData(channel)
  const projectedFields: ResourceDisplayFact[] = [
    {
      fieldId: fields.Id,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: channel.id,
    },
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: channel.name,
    },
    {
      fieldId: fields.Type,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: channelType,
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: statusToDisplay(channel.status),
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: channel.base_url ?? "",
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: getInventorySecretState(channel.key),
    },
    {
      fieldId: fields.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: models,
    },
    {
      fieldId: fields.ModelCount,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: models.length,
    },
    {
      fieldId: fields.Groups,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: groups,
    },
    {
      fieldId: fields.Priority,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: channel.priority,
    },
    {
      fieldId: fields.Weight,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: channel.weight,
    },
  ]

  return {
    ref,
    displayName: channel.name || `Channel ${channel.id}`,
    status: statusToDisplay(channel.status),
    fields: projectedFields,
    searchValues,
    actions: {
      canUpdate: true,
      canDelete: true,
      channel: {
        channelId: channel.id,
        channelType: channel.type,
        canSyncModels: true,
        canOpenModelSync: true,
        canConfigureModelFilters: true,
      },
    },
  }
}

const statusOptions = (detail?: ManagedSiteChannel) => [
  { value: String(CHANNEL_STATUS.Enable) },
  { value: String(CHANNEL_STATUS.ManuallyDisabled) },
  ...(detail?.status === CHANNEL_STATUS.AutoDisabled
    ? [{ value: String(CHANNEL_STATUS.AutoDisabled) }]
    : []),
  ...(detail?.status === CHANNEL_STATUS.Unknown
    ? [{ value: String(CHANNEL_STATUS.Unknown) }]
    : []),
]

const commonEditorUnsupportedCreateTypes = new Set<number>([
  ChannelType.VertexAi,
  ChannelType.AdvancedCustom,
])

const baseUrlRequiredChannelTypes = new Set<number>([
  ChannelType.VolcEngine,
  ChannelType.SunoAPI,
  ChannelType.NewAPI,
])

// New API validates type-specific `other`/`settings` payloads during create.
// Until the native editor owns those fields, do not offer incomplete drafts:
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
const supportsCommonEditorCreate = (type: number) =>
  !commonEditorUnsupportedCreateTypes.has(type)

// Upstream keeps Type editable for sensitive administrators and audits changes.
// Preserve that native capability for targets represented by this editor while
// retaining an existing unknown/unsupported Type as an unchanged option:
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/components/drawers/channel-mutate-drawer.tsx#L1976-L2030
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L1082-L1116
const typeOptions = (detail?: ManagedSiteChannel) => {
  const options = ChannelTypeOptions.filter(({ value }) =>
    supportsCommonEditorCreate(value),
  ).map(({ value, label }) => ({
    value: String(value),
    displayLabel: label,
  }))
  const currentType = detail ? Number(detail.type) : undefined
  if (
    currentType !== undefined &&
    !options.some(({ value }) => value === String(currentType))
  ) {
    options.push({
      value: String(currentType),
      displayLabel:
        ChannelTypeNames[currentType as keyof typeof ChannelTypeNames] ??
        String(currentType),
    })
  }
  return options
}

const fieldDescriptors = (
  detail?: ManagedSiteChannel,
  groupSuggestions: readonly string[] = [],
  canLoadSecret = false,
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
    options: statusOptions(detail),
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: detail === undefined,
    secretState:
      detail === undefined
        ? MANAGED_RESOURCE_SECRET_STATES.Unavailable
        : editorSecretStates.get(detail) ?? getInventorySecretState(detail.key),
    canLoadSecret: detail !== undefined && canLoadSecret,
    canReplace: true,
    allowClear: false,
  },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    required: true,
    options: parseNewApiResourceList(detail?.models).map((value) => ({
      value,
    })),
    optionLoader: {
      dependsOn: [fields.Type, fields.BaseUrl, fields.Key],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  {
    fieldId: fields.Groups,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: normalizeList([
      ...parseNewApiResourceList(detail?.group),
      ...groupSuggestions,
    ]).map((value) => ({ value })),
  },
  {
    fieldId: fields.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 0,
  },
  {
    fieldId: fields.Weight,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 0,
  },
]

const validateValues = (
  values: EditableResourceProjection,
  existing?: ManagedSiteChannel,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name)) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const type = Number(readString(values, fields.Type))
  if (
    !Number.isInteger(type) ||
    (!(type in ChannelTypeNames) && type !== Number(existing?.type)) ||
    (!supportsCommonEditorCreate(type) && type !== Number(existing?.type))
  ) {
    issues.push({
      fieldId: fields.Type,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  // New API requires an explicit upstream address for New API channels; the
  // legacy editor also requires it for VolcEngine and SunoAPI integrations:
  // https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
  if (
    baseUrlRequiredChannelTypes.has(type) &&
    !readString(values, fields.BaseUrl)
  ) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const status = Number(readString(values, fields.Status))
  if (
    !Object.values(CHANNEL_STATUS).includes(status as never) &&
    status !== Number(existing?.status)
  ) {
    issues.push({
      fieldId: fields.Status,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const keyIntent = readSecretIntent(values)
  if (
    !existing &&
    (keyIntent.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
      !keyIntent.value.trim())
  ) {
    issues.push({
      fieldId: fields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (readList(values, fields.Models).length === 0) {
    issues.push({
      fieldId: fields.Models,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  for (const fieldId of [fields.Priority, fields.Weight]) {
    const value = readNumber(values, fieldId)
    if (!Number.isFinite(value)) {
      issues.push({
        fieldId,
        code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
      })
    } else if (value < 0) {
      issues.push({
        fieldId,
        code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
      })
    }
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const createInitialValues = (): EditableResourceProjection => ({
  [fields.Name]: "",
  [fields.Type]: String(DEFAULT_CHANNEL_FIELDS.type),
  [fields.Status]: String(DEFAULT_CHANNEL_FIELDS.status),
  [fields.BaseUrl]: "",
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
  [fields.Models]: [],
  [fields.Groups]: [...DEFAULT_CHANNEL_FIELDS.groups],
  [fields.Priority]: DEFAULT_CHANNEL_FIELDS.priority,
  [fields.Weight]: DEFAULT_CHANNEL_FIELDS.weight,
})

const editInitialValues = (
  detail: ManagedSiteChannel,
): EditableResourceProjection => ({
  [fields.Name]: detail.name,
  [fields.Type]: String(detail.type),
  [fields.Status]: String(detail.status),
  [fields.BaseUrl]: detail.base_url ?? "",
  [fields.Key]: { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
  [fields.Models]: parseNewApiResourceList(detail.models),
  [fields.Groups]: parseNewApiResourceList(detail.group),
  [fields.Priority]: detail.priority,
  [fields.Weight]: detail.weight,
})

const toDraft = (values: EditableResourceProjection): ChannelFormData => ({
  name: readString(values, fields.Name),
  type: Number(readString(values, fields.Type)),
  key: (() => {
    const intent = readSecretIntent(values)
    return intent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
      ? intent.value.trim()
      : ""
  })(),
  base_url: readString(values, fields.BaseUrl),
  models: readList(values, fields.Models),
  groups: readList(values, fields.Groups),
  priority: readNumber(values, fields.Priority),
  weight: readNumber(values, fields.Weight),
  status: Number(
    readString(values, fields.Status),
  ) as ChannelFormData["status"],
})

export const projectNewApiImportSeed = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  [fields.Name]: seed.name,
  [fields.Type]: seed.channelType,
  [fields.Status]: String(
    seed.enabled ? CHANNEL_STATUS.Enable : CHANNEL_STATUS.ManuallyDisabled,
  ),
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  [fields.Models]: normalizeList(seed.models),
  [fields.Groups]: [...DEFAULT_CHANNEL_FIELDS.groups],
  [fields.Priority]: seed.priority,
  [fields.Weight]: seed.orderingWeight,
})

const invalidModelProbe = () =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    fieldIssues: [
      {
        fieldId: fields.Key,
        code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
      },
    ],
  })

const invalidOptionField = () =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
  })

const loadModelOptions = async (
  operations: NewApiEditorOperations,
  values: EditableResourceProjection,
  existing?: ManagedSiteChannel,
  options?: ResourceOperationOptions,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const type = Number(readString(values, fields.Type))
  const baseUrl = readString(values, fields.BaseUrl)
  const keyIntent = readSecretIntent(values)

  if (keyIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    const key = keyIntent.value.trim()
    if (!key) throw invalidModelProbe()
    return normalizeList(
      await operations.fetchDraftModels(
        { channelType: type, baseUrl, credential: key },
        options,
      ),
    ).map((value) => ({ value }))
  }
  if (!existing) throw invalidModelProbe()

  const connectionChanged =
    type !== Number(existing.type) ||
    baseUrl !== (existing.base_url ?? "").trim()
  const models = connectionChanged
    ? await operations.fetchDraftModels(
        {
          channelType: type,
          baseUrl,
          credential: await operations.loadSecret(existing.id, options),
        },
        options,
      )
    : await operations.fetchModels(existing.id, options)
  return normalizeList(models).map((value) => ({ value }))
}

const createModelOptionLoader =
  (
    operations: NewApiEditorOperations,
    existing?: ManagedSiteChannel,
  ): NonNullable<
    NativeResourceEditorDefinition<ChannelFormData>["loadOptions"]
  > =>
  async (fieldId, values, options) => {
    if (fieldId !== fields.Models) throw invalidOptionField()
    return await loadModelOptions(operations, values, existing, options)
  }

export const createNewApiCreateEditor = async (
  operations: NewApiEditorOperations,
  options?: ResourceOperationOptions,
): Promise<NativeResourceEditorDefinition<ChannelFormData>> => ({
  fields: fieldDescriptors(
    undefined,
    await operations.loadEditorGroups(options),
  ),
  initialValues: createInitialValues(),
  validate: (values) => validateValues(values),
  buildCommand: toDraft,
  loadOptions: createModelOptionLoader(operations),
})

export const createNewApiEditEditor = async (
  operations: NewApiEditorOperations,
  detail: ManagedSiteChannel,
  options?: ResourceOperationOptions,
): Promise<NativeResourceEditorDefinition<ChannelFormData>> => ({
  fields: fieldDescriptors(
    detail,
    await operations.loadEditorGroups(options),
    operations.canLoadSecret,
  ),
  initialValues: editInitialValues(detail),
  // Preserve an unchanged future upstream enum while still rejecting a newly
  // entered unsupported value. This keeps edits forward-compatible.
  validate: (values) => validateValues(values, detail),
  buildCommand: toDraft,
  loadOptions: createModelOptionLoader(operations, detail),
  loadSecret: async (fieldId, loadOptions) => {
    throwIfNewApiResourceOperationAborted(loadOptions)
    if (fieldId !== fields.Key || !operations.canLoadSecret) {
      throw invalidOptionField()
    }
    return await operations.loadSecret(detail.id, loadOptions)
  },
})
