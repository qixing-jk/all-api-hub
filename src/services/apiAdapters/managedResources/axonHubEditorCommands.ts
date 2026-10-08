import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
} from "~/constants/axonHub"
import {
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { canReplaceCredential } from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import {
  type AxonHubCreateCommand,
  type AxonHubNativeChannelPatch,
} from "~/services/apiAdapters/managedResources/axonHubEditorContracts"
import {
  addNullableTextDiff,
  fieldChanged,
  normalizeList,
  readBoolean,
  readList,
  readNumber,
  readSecretIntent,
  readString,
} from "~/services/apiAdapters/managedResources/axonHubEditorValues"
import type { AxonHubChannel } from "~/types/axonHub"

export const buildCreateCommand = (
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

export const buildUpdateCommand = (
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
