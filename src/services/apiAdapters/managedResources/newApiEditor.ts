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

type NewApiFamilyEditorFieldIds = {
  readonly Id: string
  readonly Name: string
  readonly Type: string
  readonly Status: string
  readonly BaseUrl: string
  readonly Key: string
  readonly Models: string
  readonly ModelCount: string
  readonly Groups: string
  readonly Priority: string
  readonly Weight: string
}

type NewApiFamilyEditorPolicy = {
  fields: NewApiFamilyEditorFieldIds
  typeNames: Readonly<Record<number, string>>
  typeOptions: readonly { value: number; label: string }[]
  unsupportedCreateTypes: ReadonlySet<number>
  baseUrlRequiredTypes: ReadonlySet<number>
}

const newApiEditorPolicy: NewApiFamilyEditorPolicy = {
  fields,
  typeNames: ChannelTypeNames,
  typeOptions: ChannelTypeOptions,
  unsupportedCreateTypes: new Set<number>([
    ChannelType.VertexAi,
    ChannelType.AdvancedCustom,
  ]),
  baseUrlRequiredTypes: new Set<number>([
    ChannelType.VolcEngine,
    ChannelType.SunoAPI,
    ChannelType.NewAPI,
  ]),
}
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
  editorFields: NewApiFamilyEditorFieldIds = fields,
): SecretEditIntent => {
  const value = values[editorFields.Key]
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

// New API validates type-specific `other`/`settings` payloads during create.
// Until the native editor owns those fields, do not offer incomplete drafts:
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
const supportsCommonEditorCreate = (
  type: number,
  policy: NewApiFamilyEditorPolicy,
) => !policy.unsupportedCreateTypes.has(type)

// Upstream keeps Type editable for sensitive administrators and audits changes.
// Preserve that native capability for targets represented by this editor while
// retaining an existing unknown/unsupported Type as an unchanged option:
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/web/src/features/channels/components/drawers/channel-mutate-drawer.tsx#L1976-L2030
// https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go#L1082-L1116
const typeOptions = (
  policy: NewApiFamilyEditorPolicy,
  detail?: ManagedSiteChannel,
) => {
  const options = policy.typeOptions
    .filter(({ value }) => supportsCommonEditorCreate(value, policy))
    .map(({ value, label }) => ({
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
      displayLabel: policy.typeNames[currentType] ?? String(currentType),
    })
  }
  return options
}

const fieldDescriptors = (
  policy: NewApiFamilyEditorPolicy,
  detail?: ManagedSiteChannel,
  groupSuggestions: readonly string[] = [],
  canLoadSecret = false,
): readonly ResourceFieldDescriptor[] => {
  const editorFields = policy.fields
  return [
    {
      fieldId: editorFields.Name,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: editorFields.Type,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: typeOptions(policy, detail),
    },
    {
      fieldId: editorFields.Status,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: statusOptions(detail),
    },
    { fieldId: editorFields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
    {
      fieldId: editorFields.Key,
      type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
      required: detail === undefined,
      secretState:
        detail === undefined
          ? MANAGED_RESOURCE_SECRET_STATES.Unavailable
          : editorSecretStates.get(detail) ??
            getInventorySecretState(detail.key),
      canLoadSecret: detail !== undefined && canLoadSecret,
      canReplace: true,
      allowClear: false,
    },
    {
      fieldId: editorFields.Models,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      required: true,
      options: parseNewApiResourceList(detail?.models).map((value) => ({
        value,
      })),
      optionLoader: {
        dependsOn: [editorFields.Type, editorFields.BaseUrl, editorFields.Key],
        trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      },
    },
    {
      fieldId: editorFields.Groups,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: normalizeList([
        ...parseNewApiResourceList(detail?.group),
        ...groupSuggestions,
      ]).map((value) => ({ value })),
    },
    {
      fieldId: editorFields.Priority,
      type: MANAGED_RESOURCE_FIELD_TYPES.Number,
      min: 0,
    },
    {
      fieldId: editorFields.Weight,
      type: MANAGED_RESOURCE_FIELD_TYPES.Number,
      min: 0,
    },
  ]
}

const validateValues = (
  values: EditableResourceProjection,
  existing?: ManagedSiteChannel,
  policy: NewApiFamilyEditorPolicy = newApiEditorPolicy,
): ResourceValidationResult => {
  const editorFields = policy.fields
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, editorFields.Name)) {
    issues.push({
      fieldId: editorFields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const type = Number(readString(values, editorFields.Type))
  if (
    !Number.isInteger(type) ||
    (!(type in policy.typeNames) && type !== Number(existing?.type)) ||
    (!supportsCommonEditorCreate(type, policy) &&
      type !== Number(existing?.type))
  ) {
    issues.push({
      fieldId: editorFields.Type,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  // New API requires an explicit upstream address for New API channels; the
  // legacy editor also requires it for VolcEngine and SunoAPI integrations:
  // https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
  if (
    policy.baseUrlRequiredTypes.has(type) &&
    !readString(values, editorFields.BaseUrl)
  ) {
    issues.push({
      fieldId: editorFields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const status = Number(readString(values, editorFields.Status))
  if (
    !Object.values(CHANNEL_STATUS).includes(status as never) &&
    status !== Number(existing?.status)
  ) {
    issues.push({
      fieldId: editorFields.Status,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const keyIntent = readSecretIntent(values, editorFields)
  if (
    !existing &&
    (keyIntent.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
      !keyIntent.value.trim())
  ) {
    issues.push({
      fieldId: editorFields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (readList(values, editorFields.Models).length === 0) {
    issues.push({
      fieldId: editorFields.Models,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  for (const fieldId of [editorFields.Priority, editorFields.Weight]) {
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

const createInitialValues = (
  editorFields: NewApiFamilyEditorFieldIds = fields,
): EditableResourceProjection => ({
  [editorFields.Name]: "",
  [editorFields.Type]: String(DEFAULT_CHANNEL_FIELDS.type),
  [editorFields.Status]: String(DEFAULT_CHANNEL_FIELDS.status),
  [editorFields.BaseUrl]: "",
  [editorFields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
  [editorFields.Models]: [],
  [editorFields.Groups]: [...DEFAULT_CHANNEL_FIELDS.groups],
  [editorFields.Priority]: DEFAULT_CHANNEL_FIELDS.priority,
  [editorFields.Weight]: DEFAULT_CHANNEL_FIELDS.weight,
})

const editInitialValues = (
  detail: ManagedSiteChannel,
  editorFields: NewApiFamilyEditorFieldIds = fields,
): EditableResourceProjection => ({
  [editorFields.Name]: detail.name,
  [editorFields.Type]: String(detail.type),
  [editorFields.Status]: String(detail.status),
  [editorFields.BaseUrl]: detail.base_url ?? "",
  [editorFields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [editorFields.Models]: parseNewApiResourceList(detail.models),
  [editorFields.Groups]: parseNewApiResourceList(detail.group),
  [editorFields.Priority]: detail.priority,
  [editorFields.Weight]: detail.weight,
})

const toDraft = (
  values: EditableResourceProjection,
  editorFields: NewApiFamilyEditorFieldIds = fields,
): ChannelFormData => ({
  name: readString(values, editorFields.Name),
  type: Number(readString(values, editorFields.Type)),
  key: (() => {
    const intent = readSecretIntent(values, editorFields)
    return intent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
      ? intent.value.trim()
      : ""
  })(),
  base_url: readString(values, editorFields.BaseUrl),
  models: readList(values, editorFields.Models),
  groups: readList(values, editorFields.Groups),
  priority: readNumber(values, editorFields.Priority),
  weight: readNumber(values, editorFields.Weight),
  status: Number(
    readString(values, editorFields.Status),
  ) as ChannelFormData["status"],
})

export const projectNewApiImportSeed = (
  seed: ManagedChannelImportCreateSeed,
  editorFields: NewApiFamilyEditorFieldIds = fields,
): EditableResourceProjection => ({
  [editorFields.Name]: seed.name,
  [editorFields.Type]: seed.channelType,
  [editorFields.Status]: String(
    seed.enabled ? CHANNEL_STATUS.Enable : CHANNEL_STATUS.ManuallyDisabled,
  ),
  [editorFields.BaseUrl]: seed.baseUrl,
  [editorFields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  [editorFields.Models]: normalizeList(seed.models),
  [editorFields.Groups]: [...DEFAULT_CHANNEL_FIELDS.groups],
  [editorFields.Priority]: seed.priority,
  [editorFields.Weight]: seed.orderingWeight,
})

const invalidModelProbe = (editorFields: NewApiFamilyEditorFieldIds = fields) =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    fieldIssues: [
      {
        fieldId: editorFields.Key,
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
  editorFields: NewApiFamilyEditorFieldIds = fields,
) => {
  throwIfNewApiResourceOperationAborted(options)
  const type = Number(readString(values, editorFields.Type))
  const baseUrl = readString(values, editorFields.BaseUrl)
  const keyIntent = readSecretIntent(values, editorFields)

  if (keyIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    const key = keyIntent.value.trim()
    if (!key) throw invalidModelProbe(editorFields)
    return normalizeList(
      await operations.fetchDraftModels(
        { channelType: type, baseUrl, credential: key },
        options,
      ),
    ).map((value) => ({ value }))
  }
  if (!existing) throw invalidModelProbe(editorFields)

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
    editorFields: NewApiFamilyEditorFieldIds = fields,
  ): NonNullable<
    NativeResourceEditorDefinition<ChannelFormData>["loadOptions"]
  > =>
  async (fieldId, values, options) => {
    if (fieldId !== editorFields.Models) throw invalidOptionField()
    return await loadModelOptions(
      operations,
      values,
      existing,
      options,
      editorFields,
    )
  }

export const createNewApiCreateEditor = async (
  operations: NewApiEditorOperations,
  options?: ResourceOperationOptions,
  policy: NewApiFamilyEditorPolicy = newApiEditorPolicy,
): Promise<NativeResourceEditorDefinition<ChannelFormData>> => ({
  fields: fieldDescriptors(
    policy,
    undefined,
    await operations.loadEditorGroups(options),
  ),
  initialValues: createInitialValues(policy.fields),
  validate: (values) => validateValues(values, undefined, policy),
  buildCommand: (values) => toDraft(values, policy.fields),
  loadOptions: createModelOptionLoader(operations, undefined, policy.fields),
})

export const createNewApiEditEditor = async (
  operations: NewApiEditorOperations,
  detail: ManagedSiteChannel,
  options?: ResourceOperationOptions,
  policy: NewApiFamilyEditorPolicy = newApiEditorPolicy,
): Promise<NativeResourceEditorDefinition<ChannelFormData>> => ({
  fields: fieldDescriptors(
    policy,
    detail,
    await operations.loadEditorGroups(options),
    operations.canLoadSecret,
  ),
  initialValues: editInitialValues(detail, policy.fields),
  // Preserve an unchanged future upstream enum while still rejecting a newly
  // entered unsupported value. This keeps edits forward-compatible.
  validate: (values) => validateValues(values, detail, policy),
  buildCommand: (values) => toDraft(values, policy.fields),
  loadOptions: createModelOptionLoader(operations, detail, policy.fields),
  loadSecret: async (fieldId, loadOptions) => {
    throwIfNewApiResourceOperationAborted(loadOptions)
    if (fieldId !== policy.fields.Key || !operations.canLoadSecret) {
      throw invalidOptionField()
    }
    return await operations.loadSecret(detail.id, loadOptions)
  },
})

/** Binds the shared New API-family editor mechanics to provider-owned fields and types. */
export const createNewApiFamilyEditorBindings = (
  policy: NewApiFamilyEditorPolicy,
) => ({
  projectImportSeed: (seed: ManagedChannelImportCreateSeed) =>
    projectNewApiImportSeed(seed, policy.fields),
  createEditor: (
    operations: NewApiEditorOperations,
    options?: ResourceOperationOptions,
  ) => createNewApiCreateEditor(operations, options, policy),
  editEditor: (
    operations: NewApiEditorOperations,
    detail: ManagedSiteChannel,
    options?: ResourceOperationOptions,
  ) => createNewApiEditEditor(operations, detail, options, policy),
  sanitizeEditDetail: sanitizeNewApiEditorDetail,
})
