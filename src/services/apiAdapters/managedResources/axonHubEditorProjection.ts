import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  isAxonHubModelAutoSyncSupported,
  type AxonHubChannelFieldId,
  type AxonHubChannelStatus,
} from "~/constants/axonHub"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import type { ResourceOperationOptions } from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS,
  MANAGED_RESOURCE_SECRET_STATES,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceSecretReplacementBlockReason,
  type ResourceSecretState,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import type {
  AxonHubChannel,
  AxonHubCreateChannelInput,
  AxonHubUpdateChannelInput,
} from "~/types/axonHub"

import {
  withCredentialListEditor,
  type CredentialListPatch,
} from "./credentialListEditor"

export type AxonHubCreateCommand = {
  credentialPatch?: CredentialListPatch
  input: AxonHubCreateChannelInput
  desiredStatus: AxonHubChannelStatus
}

// Keep the product-facing edit contract narrower than AxonHub's generated
// UpdateChannelInput. Aggregate replacements such as settings, policies, and
// endpoints are intentionally absent because an older client cannot preserve
// members added by a newer server.
export type AxonHubNativeChannelPatch = {
  credentialPatch?: CredentialListPatch
} & Pick<
  AxonHubUpdateChannelInput,
  | "type"
  | "baseURL"
  | "name"
  | "status"
  | "credentials"
  | "supportedModels"
  | "manualModels"
  | "autoSyncSupportedModels"
  | "autoSyncModelPattern"
  | "clearAutoSyncModelPattern"
  | "tags"
  | "defaultTestModel"
  | "orderingWeight"
  | "remark"
  | "clearRemark"
>

// beta5 requires apiKeys for these audited regular-key types; structured
// AWS/GCP/OAuth and unknown future types stay excluded by default.
// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/data/schema.ts
const REGULAR_AXON_HUB_CHANNEL_TYPES = [
  AXON_HUB_CHANNEL_TYPE.OPENAI,
  AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
  AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI,
  AXON_HUB_CHANNEL_TYPE.GEMINI,
  AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK,
  AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC,
  AXON_HUB_CHANNEL_TYPE.OPENROUTER,
  AXON_HUB_CHANNEL_TYPE.XAI,
  AXON_HUB_CHANNEL_TYPE.SILICONFLOW,
  AXON_HUB_CHANNEL_TYPE.VOLCENGINE,
  AXON_HUB_CHANNEL_TYPE.NANOGPT,
  AXON_HUB_CHANNEL_TYPE.OLLAMA,
] as const

const REGULAR_AXON_HUB_CHANNEL_TYPE_SET = new Set<string>(
  REGULAR_AXON_HUB_CHANNEL_TYPES,
)

const editorCredentialStates = new WeakMap<
  AxonHubChannel,
  ResourceSecretState
>()
const editorCredentialReplacementBlockReasons = new WeakMap<
  AxonHubChannel,
  ResourceSecretReplacementBlockReason
>()

/** Returns whether AxonHub represents this channel with regular API-key credentials. */
export const isRegularAxonHubChannelType = (type: string): boolean =>
  REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)

export const getAxonHubCredentialCandidates = (
  channel: AxonHubChannel,
): string[] =>
  [...(channel.credentials?.apiKeys ?? []), channel.credentials?.apiKey]
    .filter((key): key is string => typeof key === "string")
    .map((key) => key.trim())
    .filter(Boolean)

const getCredentialReplacementBlockReason = (
  channel: AxonHubChannel,
): ResourceSecretReplacementBlockReason | undefined =>
  editorCredentialReplacementBlockReasons.get(channel) ??
  (getAxonHubCredentialCandidates(channel).length > 1
    ? MANAGED_RESOURCE_SECRET_REPLACEMENT_BLOCK_REASONS.MultipleCredentials
    : undefined)

export const getCredentialState = (
  channel: AxonHubChannel,
): ResourceSecretState => {
  const editorState = editorCredentialStates.get(channel)
  if (editorState) return editorState
  if (channel.credentials === null)
    return MANAGED_RESOURCE_SECRET_STATES.PermissionHidden
  const keys = getAxonHubCredentialCandidates(channel)
  if (keys.some(hasUsableApiTokenKey))
    return MANAGED_RESOURCE_SECRET_STATES.Available
  if (keys.length) return MANAGED_RESOURCE_SECRET_STATES.Masked
  return MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

export const sanitizeAxonHubEditorDetail = (
  detail: AxonHubChannel,
): AxonHubChannel => {
  if (
    isRegularAxonHubChannelType(String(detail.type)) &&
    detail.credentials != null &&
    getAxonHubCredentialCandidates(detail).every(hasUsableApiTokenKey)
  )
    return detail
  const credentialState = getCredentialState(detail)
  const credentialReplacementBlockReason =
    getCredentialReplacementBlockReason(detail)
  const sanitized: AxonHubChannel = {
    id: detail.id,
    name: detail.name,
    type: detail.type,
    status: detail.status,
    baseURL: detail.baseURL,
    credentials: undefined,
    supportedModels: detail.supportedModels,
    manualModels: detail.manualModels,
    autoSyncSupportedModels: detail.autoSyncSupportedModels,
    autoSyncModelPattern: detail.autoSyncModelPattern,
    tags: detail.tags,
    defaultTestModel: detail.defaultTestModel,
    orderingWeight: detail.orderingWeight,
    remark: detail.remark,
    settings: detail.settings
      ? { extraModelPrefix: detail.settings.extraModelPrefix }
      : undefined,
  }
  editorCredentialStates.set(sanitized, credentialState)
  if (credentialReplacementBlockReason) {
    editorCredentialReplacementBlockReasons.set(
      sanitized,
      credentialReplacementBlockReason,
    )
  }
  return sanitized
}

export const getAxonHubCredentialKey = (channel: AxonHubChannel) => {
  if (
    getCredentialState(channel) !== MANAGED_RESOURCE_SECRET_STATES.Available ||
    getCredentialReplacementBlockReason(channel)
  ) {
    return undefined
  }
  return getAxonHubCredentialCandidates(channel).find(hasUsableApiTokenKey)
}

const canReplaceCredential = (channel: AxonHubChannel) =>
  isRegularAxonHubChannelType(String(channel.type)) &&
  getCredentialState(channel) !==
    MANAGED_RESOURCE_SECRET_STATES.PermissionHidden &&
  getCredentialReplacementBlockReason(channel) === undefined

const readString = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return typeof value === "string" ? value.trim() : ""
}

const readBoolean = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => values[fieldId] === true

const readNumber = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  if (typeof value === "number" && Number.isFinite(value)) return value
  return value === "" ? Number.NaN : 0
}

const readList = (
  values: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

const readSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values[AXON_HUB_CHANNEL_FIELD_IDS.KEY]
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "kind")
  ) {
    const candidate = value as Record<PropertyKey, unknown>
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
    if (candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear)
      return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }
    if (
      candidate.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      Object.prototype.hasOwnProperty.call(candidate, "value") &&
      typeof candidate.value === "string"
    ) {
      return {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: candidate.value,
      }
    }
  }
  return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

const normalizeList = (values: readonly string[]) =>
  values.map((value) => value.trim()).filter(Boolean)

const hasInvalidListValues = (values: readonly string[]) => {
  const normalized = values.map((value) => value.trim())
  return (
    normalized.some((value) => !value) ||
    new Set(normalized).size !== normalized.length
  )
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const AXON_HUB_MODEL_PATTERN_REGEX_CHARS = /[*?+[\]{}()^$.|\\]/
const AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER = /^\(\?([a-z]+)\)/

// Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/utils/pattern.ts
const isValidAxonHubModelPattern = (pattern: string) => {
  if (!pattern || pattern === "*") return true

  const inlineModifier = pattern.match(AXON_HUB_INLINE_MODEL_PATTERN_MODIFIER)
  const modifiers = new Set(inlineModifier?.[1] ?? [])
  if ([...modifiers].some((modifier) => modifier !== "i")) return false

  const caseInsensitive = modifiers.has("i")
  const body = inlineModifier
    ? pattern.slice(inlineModifier[0].length)
    : pattern
  if (!AXON_HUB_MODEL_PATTERN_REGEX_CHARS.test(body)) return true

  const normalizedBody = body.replace(/^\^/, "").replace(/\$$/, "")
  try {
    new RegExp(`^(?:${normalizedBody})$`, caseInsensitive ? "i" : "")
    return true
  } catch {
    return false
  }
}

const validateValues = (
  values: EditableResourceProjection,
  context: {
    create: boolean
    detail?: AxonHubChannel
    baseline?: EditableResourceProjection
  },
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  const name = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME)
  const type = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)
  const baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  const supportedModels = readList(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
  )
  const manualModels = readList(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
  )
  const defaultTestModel = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
  )
  const autoSyncSupportedModels = readBoolean(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
  )
  const autoSyncModelPattern = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
  ).trim()
  const secretIntent = readSecretIntent(values)
  const status = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)
  const specialCredentialType = context.detail
    ? !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(String(context.detail.type))
    : false
  const credentialMutationForbidden = context.detail
    ? !canReplaceCredential(context.detail)
    : false
  // beta5 disables model auto-sync for provider-managed credential types.
  // Source: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/components/channels-action-dialog.tsx
  const autoSyncSupported = isAxonHubModelAutoSyncSupported(type)
  const baseline = context.baseline
  const modelListInputsChanged = baseline
    ? [
        AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
        AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      ].some((fieldId) => fieldChanged(values, baseline, fieldId))
    : true
  const modelInputsChanged =
    modelListInputsChanged ||
    !baseline ||
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    )

  if (!name) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (!type) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    (!specialCredentialType && !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(type)) ||
    (specialCredentialType && type !== context.detail?.type)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (baseURL && !isHttpUrl(baseURL)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (
    (context.create &&
      (secretIntent.kind !==
        MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
        !secretIntent.value.trim())) ||
    secretIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secretIntent.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !secretIntent.value.trim()) ||
    (credentialMutationForbidden &&
      secretIntent.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      code: context.create
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (hasInvalidListValues(supportedModels)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (modelInputsChanged && supportedModels.length === 0) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (hasInvalidListValues(manualModels)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  // AxonHub beta5 keeps manual model provenance as a subset of supportedModels;
  // the native editor mirrors custom additions into both lists. Source:
  // https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/frontend/src/features/channels/components/channels-action-dialog.tsx
  if (
    modelListInputsChanged &&
    normalizeList(manualModels).some(
      (model) => !new Set(normalizeList(supportedModels)).has(model),
    )
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
  }
  if (modelInputsChanged && !defaultTestModel) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (
    modelInputsChanged &&
    defaultTestModel &&
    !new Set(normalizeList(supportedModels)).has(defaultTestModel)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InconsistentValue,
    })
  }
  if (
    !autoSyncSupported &&
    baseline &&
    (fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    ) ||
      fieldChanged(
        values,
        baseline,
        AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      ))
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (
    autoSyncSupported &&
    autoSyncSupportedModels &&
    !isValidAxonHubModelPattern(autoSyncModelPattern)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const supportedStatuses = context.create
    ? [AXON_HUB_CHANNEL_STATUS.ENABLED, AXON_HUB_CHANNEL_STATUS.DISABLED]
    : [
        AXON_HUB_CHANNEL_STATUS.ENABLED,
        AXON_HUB_CHANNEL_STATUS.DISABLED,
        AXON_HUB_CHANNEL_STATUS.ARCHIVED,
        ...(context.detail ? [String(context.detail.status)] : []),
      ]
  if (!supportedStatuses.includes(status)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const orderingWeight = values[AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]
  if (!Number.isInteger(orderingWeight)) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  } else if (
    typeof orderingWeight === "number" &&
    (orderingWeight < 0 || orderingWeight > 100)
  ) {
    issues.push({
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }

  return issues.length ? { valid: false, issues } : { valid: true }
}

const createFieldDescriptors = (
  detail?: AxonHubChannel,
): readonly ResourceFieldDescriptor[] => {
  const specialCredentialType = detail
    ? !REGULAR_AXON_HUB_CHANNEL_TYPE_SET.has(String(detail.type))
    : false
  const typeOptions =
    specialCredentialType && detail
      ? [{ value: String(detail.type) }]
      : REGULAR_AXON_HUB_CHANNEL_TYPES.map((value) => ({ value }))
  const currentStatus = detail ? String(detail.status) : undefined
  const secretState = detail
    ? getCredentialState(detail)
    : MANAGED_RESOURCE_SECRET_STATES.Unavailable
  const replacementBlockReason = detail
    ? getCredentialReplacementBlockReason(detail)
    : undefined
  const statusValues = detail
    ? [
        AXON_HUB_CHANNEL_STATUS.ENABLED,
        AXON_HUB_CHANNEL_STATUS.DISABLED,
        AXON_HUB_CHANNEL_STATUS.ARCHIVED,
        ...(currentStatus &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.ENABLED &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.DISABLED &&
        currentStatus !== AXON_HUB_CHANNEL_STATUS.ARCHIVED
          ? [currentStatus]
          : []),
      ]
    : [AXON_HUB_CHANNEL_STATUS.ENABLED, AXON_HUB_CHANNEL_STATUS.DISABLED]
  return [
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: typeOptions,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: statusValues.map((value) => ({ value })),
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
      type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
      required: detail === undefined,
      secretState,
      canReplace: detail ? canReplaceCredential(detail) : true,
      ...(replacementBlockReason ? { replacementBlockReason } : {}),
      allowClear: false,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      type: MANAGED_RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      type: MANAGED_RESOURCE_FIELD_TYPES.Boolean,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
      type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
      options: [],
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      type: MANAGED_RESOURCE_FIELD_TYPES.Number,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
      type: MANAGED_RESOURCE_FIELD_TYPES.Textarea,
    },
    {
      fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
      type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    },
  ].filter(
    ({ fieldId }) =>
      detail === undefined ||
      fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
  )
}

const createInitialValues = (): EditableResourceProjection => ({
  [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.OPENAI,
  [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: AXON_HUB_CHANNEL_STATUS.DISABLED,
  [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: false,
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: [],
  [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: 0,
  [AXON_HUB_CHANNEL_FIELD_IDS.REMARK]: "",
  [AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX]: "",
})

export const createAxonHubChannelImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => {
  const models = normalizeList(seed.models)

  return {
    ...createInitialValues(),
    [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: seed.name,
    [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: seed.channelType,
    [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: seed.baseUrl,
    [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: seed.enabled
      ? AXON_HUB_CHANNEL_STATUS.ENABLED
      : AXON_HUB_CHANNEL_STATUS.DISABLED,
    [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
      kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
      value: seed.credential,
    },
    [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: models,
    [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: models,
    [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: models[0] ?? "",
    [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: 0,
  }
}

const editInitialValues = (
  detail: AxonHubChannel,
): EditableResourceProjection => ({
  [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: detail.name,
  [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: String(detail.type),
  [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: detail.baseURL ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: String(detail.status),
  [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: [
    ...(detail.supportedModels ?? []),
  ],
  [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: [...(detail.manualModels ?? [])],
  [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]:
    detail.defaultTestModel ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]:
    detail.autoSyncSupportedModels ?? false,
  [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN]:
    detail.autoSyncModelPattern ?? "",
  [AXON_HUB_CHANNEL_FIELD_IDS.TAGS]: [...(detail.tags ?? [])],
  [AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT]: detail.orderingWeight ?? 0,
  [AXON_HUB_CHANNEL_FIELD_IDS.REMARK]: detail.remark ?? "",
})

const buildCreateCommand = (
  values: EditableResourceProjection,
): AxonHubCreateCommand => {
  const baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  const secret = readSecretIntent(values)
  const credential =
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
      ? secret.value.trim()
      : ""
  const extraModelPrefix = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
  )
  return {
    desiredStatus:
      readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS) ===
      AXON_HUB_CHANNEL_STATUS.ENABLED
        ? AXON_HUB_CHANNEL_STATUS.ENABLED
        : AXON_HUB_CHANNEL_STATUS.DISABLED,
    input: {
      type: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE),
      name: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME),
      ...(baseURL ? { baseURL } : {}),
      credentials: { apiKeys: [credential] },
      supportedModels: normalizeList(
        readList(values, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
      ),
      manualModels: normalizeList(
        readList(values, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS),
      ),
      autoSyncSupportedModels: readBoolean(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
      ),
      autoSyncModelPattern:
        readString(
          values,
          AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
        ) || null,
      tags: normalizeList(readList(values, AXON_HUB_CHANNEL_FIELD_IDS.TAGS)),
      defaultTestModel: readString(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
      ),
      settings: { extraModelPrefix },
      orderingWeight: readNumber(
        values,
        AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
      ),
      remark: readString(values, AXON_HUB_CHANNEL_FIELD_IDS.REMARK) || null,
    },
  }
}

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index])

const fieldChanged = (
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId: AxonHubChannelFieldId,
) => {
  const value = values[fieldId]
  const initialValue = baseline[fieldId]
  if (Array.isArray(value) && Array.isArray(initialValue)) {
    return !arraysEqual(value, initialValue)
  }
  return value !== initialValue
}

const addNullableTextDiff = (
  input: AxonHubNativeChannelPatch,
  values: EditableResourceProjection,
  baseline: EditableResourceProjection,
  fieldId:
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN
    | typeof AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
  clearField: "clearAutoSyncModelPattern" | "clearRemark",
) => {
  if (!fieldChanged(values, baseline, fieldId)) return
  const next = readString(values, fieldId)
  if (next) input[fieldId] = next
  else input[clearField] = true
}

const buildUpdateCommand = (
  detail: AxonHubChannel,
  baseline: EditableResourceProjection,
  values: EditableResourceProjection,
): AxonHubNativeChannelPatch => {
  const input: AxonHubNativeChannelPatch = {}
  const name = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.NAME)
  const type = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)
  const status = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.NAME)) {
    input.name = name
  }
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.TYPE)) {
    input.type = type
  }
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.STATUS)) {
    input.status = status
  }

  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)) {
    // AxonHub beta8/beta9's custom updater ignores generated clearBaseURL but
    // applies a non-nil empty baseURL. Source: https://github.com/looplj/axonhub/blob/v1.0.0-beta9/internal/server/biz/channel.go
    input.baseURL = readString(values, AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL)
  }
  addNullableTextDiff(
    input,
    values,
    baseline,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    "clearAutoSyncModelPattern",
  )
  addNullableTextDiff(
    input,
    values,
    baseline,
    AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    "clearRemark",
  )

  const secret = readSecretIntent(values)
  if (
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
    canReplaceCredential(detail)
  ) {
    input.credentials = { apiKeys: [secret.value.trim()] }
  }

  const supportedModels = normalizeList(
    readList(values, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS),
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS)
  ) {
    input.supportedModels = supportedModels
  }
  const manualModels = normalizeList(
    readList(values, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS),
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS)
  ) {
    // The same updater accepts [] but ignores generated clearManualModels.
    input.manualModels = manualModels
  }
  const tags = normalizeList(readList(values, AXON_HUB_CHANNEL_FIELD_IDS.TAGS))
  if (fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.TAGS)) {
    // AxonHub's custom update service applies non-nil tags (including []) but
    // ignores generated clearTags: https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/biz/channel.go#L680-L692
    input.tags = tags
  }

  const defaultTestModel = readString(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
  )
  if (
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    )
  ) {
    input.defaultTestModel = defaultTestModel
  }
  const autoSyncSupportedModels = readBoolean(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
  )
  if (
    fieldChanged(
      values,
      baseline,
      AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    )
  ) {
    input.autoSyncSupportedModels = autoSyncSupportedModels
  }
  const orderingWeight = readNumber(
    values,
    AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
  )
  if (
    fieldChanged(values, baseline, AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT)
  ) {
    input.orderingWeight = orderingWeight
  }

  return input
}

const createEditor =
  (): NativeResourceEditorDefinition<AxonHubCreateCommand> => ({
    fields: createFieldDescriptors(),
    initialValues: createInitialValues(),
    validate: (values) => validateValues(values, { create: true }),
    buildCommand: buildCreateCommand,
  })

const editEditor = (
  detail: AxonHubChannel,
  loadSecret?: NativeResourceEditorDefinition<AxonHubNativeChannelPatch>["loadSecret"],
): NativeResourceEditorDefinition<AxonHubNativeChannelPatch> => {
  const initialValues = editInitialValues(detail)
  return {
    fields: createFieldDescriptors(detail),
    initialValues,
    validate: (values) =>
      validateValues(values, {
        create: false,
        detail,
        baseline: initialValues,
      }),
    buildCommand: (values) => buildUpdateCommand(detail, initialValues, values),
    ...(loadSecret ? { loadSecret } : {}),
  }
}

/** Preserve credential order, including duplicate native entries. */
export function axonCredentialRecords(detail: AxonHubChannel) {
  return getAxonHubCredentialCandidates(detail).map((key, index) => ({
    id: String(index),
    key,
    fields: {},
  }))
}

/** Builds the complete regular-key create editor, including credential-list behavior. */
export const createAxonHubCreateProjection = () =>
  withCredentialListEditor(
    createEditor(),
    AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    [],
    false,
  )
/** Validates a managed import against the same create projection rules. */
export const validateAxonHubCreateProjection = (
  values: EditableResourceProjection,
) => validateValues(values, { create: true })
/** Builds editing and secret loading around the same sanitized detail and baseline. */
export function createAxonHubEditProjection(
  detail: AxonHubChannel,
  callbacks: {
    loadSecret(
      fieldId: string,
      options?: ResourceOperationOptions,
    ): Promise<string>
    reloadDetail(options?: ResourceOperationOptions): Promise<AxonHubChannel>
  },
) {
  const loadSecret =
    getCredentialState(detail) === MANAGED_RESOURCE_SECRET_STATES.Available &&
    canReplaceCredential(detail)
      ? callbacks.loadSecret
      : undefined
  const base = editEditor(detail, loadSecret)
  if (
    !isRegularAxonHubChannelType(String(detail.type)) ||
    detail.credentials == null
  )
    return base
  return withCredentialListEditor(
    base,
    AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    axonCredentialRecords(detail),
    true,
    async (options) =>
      axonCredentialRecords(await callbacks.reloadDetail(options)),
  )
}
