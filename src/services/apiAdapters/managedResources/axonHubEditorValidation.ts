import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  isAxonHubModelAutoSyncSupported,
} from "~/constants/axonHub"
import {
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  type EditableResourceProjection,
  type ResourceFieldIssue,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  canReplaceCredential,
  REGULAR_AXON_HUB_CHANNEL_TYPE_SET,
} from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import {
  fieldChanged,
  hasInvalidListValues,
  isHttpUrl,
  isValidAxonHubModelPattern,
  normalizeList,
  readBoolean,
  readList,
  readSecretIntent,
  readString,
} from "~/services/apiAdapters/managedResources/axonHubEditorValues"
import type { AxonHubChannel } from "~/types/axonHub"

export const validateValues = (
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
