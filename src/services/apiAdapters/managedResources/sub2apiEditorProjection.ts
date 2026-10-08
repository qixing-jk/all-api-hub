import {
  isSub2ApiManagedResourcePlatform,
  isSub2ApiManagedResourceStatus,
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  SUB2API_DEFAULT_ACCOUNT_PLATFORM,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import {
  getBaseUrl,
  getModelMapping,
  getModelWhitelist,
  hasSavedKey,
  normalizeList,
} from "~/services/apiAdapters/managedResources/sub2apiDisplayFacts"
import {
  type Sub2ApiCreateCommand,
  type Sub2ApiNativeConfig,
} from "~/services/apiAdapters/managedResources/sub2apiNativeContracts"
import { isHttpUrl } from "~/services/apiAdapters/managedResources/sub2apiNativeRuntime"
import {
  revealSub2ApiApiKey,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type {
  Sub2ApiAdminApiKeyAccount,
  Sub2ApiApiKeyAccountPlatform,
} from "~/types/sub2apiManagedSite"

// Upstream accepts explicit zero values for both fields:
// https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/service/admin_account.go
const SUB2API_ACCOUNT_ROUTING_VALUE_MIN = 0

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
  const value = values[SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("kind" in value)
  ) {
    return { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
  }
  if (
    value.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
    typeof value.value === "string"
  ) {
    return {
      kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
      value: value.value,
    }
  }
  return value.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear
    ? { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear }
    : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
}

const toIdentityModelMapping = (models: readonly string[]) =>
  Object.fromEntries(normalizeList(models).map((model) => [model, model]))

const statusOptions = (detail?: Sub2ApiAdminApiKeyAccount) => [
  { value: SUB2API_MANAGED_RESOURCE_STATUS.Active },
  { value: SUB2API_MANAGED_RESOURCE_STATUS.Inactive },
  ...(detail?.status === SUB2API_MANAGED_RESOURCE_STATUS.Error
    ? [{ value: SUB2API_MANAGED_RESOURCE_STATUS.Error }]
    : []),
  ...(detail?.status && !isSub2ApiManagedResourceStatus(detail.status)
    ? [{ value: detail.status }]
    : []),
]

// Source: https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/handler/admin/account_handler.go
// Model behavior: https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/frontend/src/components/account/CreateAccountModal.vue
// API-key create and update accept notes, credentials, concurrency and priority;
// credentials.model_mapping is optional, and an omitted/empty mapping permits
// every upstream model. Update omits platform, so it stays read-only on edit.
const fieldDescriptors = (
  detail?: Sub2ApiAdminApiKeyAccount,
): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    readOnly: detail !== undefined,
    options: SUB2API_API_KEY_ACCOUNT_PLATFORMS.map((value) => ({
      value,
      displayLabel: SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[value],
    })),
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    options: statusOptions(detail),
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: detail === undefined,
    secretState:
      detail === undefined
        ? MANAGED_RESOURCE_SECRET_STATES.Unavailable
        : hasSavedKey(detail)
          ? MANAGED_RESOURCE_SECRET_STATES.Available
          : MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canReplace: true,
    allowClear: false,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    required: false,
    options: (detail ? getModelWhitelist(detail) : []).map((value) => ({
      value,
    })),
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    required: true,
    min: SUB2API_ACCOUNT_ROUTING_VALUE_MIN,
    step: 1,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    required: true,
    min: SUB2API_ACCOUNT_ROUTING_VALUE_MIN,
    step: 1,
  },
  {
    fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
    type: MANAGED_RESOURCE_FIELD_TYPES.Textarea,
    readOnly: false,
  },
]

const createInitialValues = (): EditableResourceProjection => ({
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name]: "",
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]:
    SUB2API_DEFAULT_ACCOUNT_PLATFORM,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status]:
    SUB2API_MANAGED_RESOURCE_STATUS.Active,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: "",
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models]: [],
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency]: 1,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority]: 1,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes]: "",
})

const editInitialValues = (
  detail: Sub2ApiAdminApiKeyAccount,
): EditableResourceProjection => ({
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name]: detail.name,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]: detail.platform,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status]: detail.status ?? "",
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: getBaseUrl(detail),
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged,
  },
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models]: getModelWhitelist(detail),
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency]: detail.concurrency ?? 1,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority]: detail.priority ?? 1,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes]: detail.notes ?? "",
})

export const validateValues = (
  values: EditableResourceProjection,
  context: { create: boolean; detail?: Sub2ApiAdminApiKeyAccount },
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  const name = readString(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
  ).trim()
  const platform = readString(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
  )
  const status = readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status)
  const baseUrl = readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl)
  const secret = readSecretIntent(values)
  const concurrency = readNumber(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
  )
  const priority = readNumber(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
  )

  if (!name) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (
    !isSub2ApiManagedResourcePlatform(platform) ||
    (!context.create && platform !== context.detail?.platform)
  ) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const allowedStatus = context.create
    ? status === SUB2API_MANAGED_RESOURCE_STATUS.Active ||
      status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive
    : status === (context.detail?.status ?? "") ||
      status === SUB2API_MANAGED_RESOURCE_STATUS.Active ||
      status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive ||
      (context.detail?.status === SUB2API_MANAGED_RESOURCE_STATUS.Error &&
        status === SUB2API_MANAGED_RESOURCE_STATUS.Error)
  if (!allowedStatus) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (!baseUrl.trim()) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (!isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (
    (context.create &&
      (secret.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
        !hasUsableManagedSiteChannelKey(secret.value))) ||
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value))
  ) {
    issues.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
      code: context.create
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  for (const [fieldId, value] of [
    [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency, concurrency],
    [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority, priority],
  ] as const) {
    if (!Number.isInteger(value)) {
      issues.push({
        fieldId,
        code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
      })
    } else if (value < SUB2API_ACCOUNT_ROUTING_VALUE_MIN) {
      issues.push({
        fieldId,
        code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
      })
    }
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): Sub2ApiCreateCommand => {
  const secret = readSecretIntent(values)
  const models = readList(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models)
  return {
    desiredStatus:
      readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status) ===
      SUB2API_MANAGED_RESOURCE_STATUS.Inactive
        ? "inactive"
        : "active",
    input: {
      name: readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name).trim(),
      platform: readString(
        values,
        SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      ) as Sub2ApiApiKeyAccountPlatform,
      baseUrl: readString(
        values,
        SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      ).trim(),
      apiKey:
        secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
          ? secret.value.trim()
          : "",
      ...(models.length
        ? {
            modelMapping: toIdentityModelMapping(models),
          }
        : {}),
      concurrency: readNumber(
        values,
        SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      ),
      priority: readNumber(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority),
      notes: readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes),
    },
  }
}

const buildUpdateCommand = (
  detail: Sub2ApiAdminApiKeyAccount,
  values: EditableResourceProjection,
): Sub2ApiApiKeyAccountUpdateInput => {
  const input: Sub2ApiApiKeyAccountUpdateInput = {}
  const name = readString(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
  ).trim()
  const baseUrl = readString(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
  ).trim()
  const concurrency = readNumber(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
  )
  const priority = readNumber(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
  )
  const status = readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status)
  const secret = readSecretIntent(values)
  const notes = readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes)
  const models = readList(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models)
  const existingModelMapping = getModelMapping(detail)
  const existingModels = Object.keys(existingModelMapping)

  if (name !== detail.name.trim()) input.name = name
  if (baseUrl !== getBaseUrl(detail).trim()) input.baseUrl = baseUrl
  if (concurrency !== (detail.concurrency ?? 1)) input.concurrency = concurrency
  if (priority !== (detail.priority ?? 1)) input.priority = priority
  if (status !== detail.status && isSub2ApiManagedResourceStatus(status)) {
    input.status = status
  }
  if (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace)
    input.apiKey = secret.value.trim()
  if ([...models].sort().join("\0") !== [...existingModels].sort().join("\0")) {
    input.modelMapping = Object.fromEntries(
      models.map((model) => [model, existingModelMapping[model] ?? model]),
    )
  }
  if (notes !== (detail.notes ?? "")) input.notes = notes
  return input
}

export const createEditor =
  (): NativeResourceEditorDefinition<Sub2ApiCreateCommand> => ({
    fields: fieldDescriptors(),
    initialValues: createInitialValues(),
    validate: (values) => validateValues(values, { create: true }),
    buildCommand: buildCreateCommand,
  })

export const createSub2ApiChannelImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name]: seed.name,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]: seed.channelType,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status]: seed.enabled
    ? SUB2API_MANAGED_RESOURCE_STATUS.Active
    : SUB2API_MANAGED_RESOURCE_STATUS.Inactive,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: seed.baseUrl,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: hasUsableManagedSiteChannelKey(
    seed.credential,
  )
    ? {
        kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
        value: seed.credential.trim(),
      }
    : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models]: normalizeList(seed.models),
  // Routing settings are initialized by the native account editor.
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes]: seed.notes,
})

export const editEditor = (
  config: Sub2ApiNativeConfig,
  detail: Sub2ApiAdminApiKeyAccount,
): NativeResourceEditorDefinition<Sub2ApiApiKeyAccountUpdateInput> => ({
  fields: fieldDescriptors(detail),
  initialValues: editInitialValues(detail),
  validate: (values) => validateValues(values, { create: false, detail }),
  buildCommand: (values) => buildUpdateCommand(detail, values),
  ...(hasSavedKey(detail)
    ? {
        loadSecret: async (
          fieldId: string,
          options?: ResourceOperationOptions,
        ) => {
          if (fieldId !== SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key) {
            throw new ManagedResourceError({
              code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
            })
          }
          return await revealSub2ApiApiKey(config.config, detail.id, options)
        },
      }
    : {}),
})
