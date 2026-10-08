import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
} from "~/constants/axonHub"
import {
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  canReplaceCredential,
  getCredentialReplacementBlockReason,
  getCredentialState,
  REGULAR_AXON_HUB_CHANNEL_TYPE_SET,
  REGULAR_AXON_HUB_CHANNEL_TYPES,
} from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import { normalizeList } from "~/services/apiAdapters/managedResources/axonHubEditorValues"
import type { AxonHubChannel } from "~/types/axonHub"

export const createFieldDescriptors = (
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

export const createInitialValues = (): EditableResourceProjection => ({
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

export const editInitialValues = (
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
