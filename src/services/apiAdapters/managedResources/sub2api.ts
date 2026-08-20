import { SITE_TYPES } from "~/constants/siteType"
import {
  isSub2ApiManagedResourcePlatform,
  isSub2ApiManagedResourceStatus,
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  SUB2API_DEFAULT_ACCOUNT_PLATFORM,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
  sub2ApiChannelTypeToPlatform,
} from "~/constants/sub2api"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
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
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
} from "~/services/apiAdapters/managedResources/factory"
import {
  createSub2ApiManagedAccountMutation,
  deleteSub2ApiManagedAccountMutation,
  updateSub2ApiManagedAccountMutation,
} from "~/services/apiAdapters/managedSites/sub2api"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import {
  getSub2ApiApiKeyAccount,
  InvalidSub2ApiResourceIdError,
  listSub2ApiApiKeyAccounts,
  parseSub2ApiResourceId,
  revealSub2ApiApiKey,
  searchSub2ApiApiKeyAccounts,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
  type Sub2ApiApiKeyAccountCreateInput,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type {
  Sub2ApiAdminApiKeyAccount,
  Sub2ApiApiKeyAccountPlatform,
} from "~/types/sub2apiManagedSite"
import type { Sub2ApiManagedSiteConfig } from "~/types/sub2apiManagedSiteConfig"

type Sub2ApiNativeConfig = {
  config: Sub2ApiManagedSiteConfig
  scopeKey: string
}

type Sub2ApiCreateCommand = {
  input: Sub2ApiApiKeyAccountCreateInput
  desiredStatus: "active" | "inactive"
}

// Upstream accepts explicit zero values for both fields:
// https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/service/admin_account.go
const SUB2API_ACCOUNT_ROUTING_VALUE_MIN = 0

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

const normalizeList = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

const readList = (values: EditableResourceProjection, fieldId: string) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? normalizeList(
        value.filter((item): item is string => typeof item === "string"),
      )
    : []
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value))

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

const statusToDisplay = (
  status: Sub2ApiAdminApiKeyAccount["status"],
): ResourceDisplayFacts["status"] => {
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Active)
    return MANAGED_RESOURCE_STATUSES.Enabled
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive)
    return MANAGED_RESOURCE_STATUSES.Disabled
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Error)
    return MANAGED_RESOURCE_STATUSES.AutoDisabled
  return MANAGED_RESOURCE_STATUSES.Unknown
}

const getBaseUrl = (account: Sub2ApiAdminApiKeyAccount) =>
  typeof account.credentials?.base_url === "string"
    ? account.credentials.base_url
    : ""

const getModelMapping = (account: Sub2ApiAdminApiKeyAccount) => {
  const mapping = account.credentials?.model_mapping
  if (!isRecord(mapping)) return {}
  return Object.fromEntries(
    Object.entries(mapping).flatMap(([model, target]) => {
      const normalizedModel = model.trim()
      return normalizedModel && typeof target === "string" && target.trim()
        ? [[normalizedModel, target.trim()]]
        : []
    }),
  )
}

const getModelWhitelist = (account: Sub2ApiAdminApiKeyAccount) =>
  Object.keys(getModelMapping(account))

const toIdentityModelMapping = (models: readonly string[]) =>
  Object.fromEntries(normalizeList(models).map((model) => [model, model]))

const hasSavedKey = (account: Sub2ApiAdminApiKeyAccount) =>
  account.credentials_status?.has_api_key === true

const baseFacts = (
  account: Sub2ApiAdminApiKeyAccount,
  normalizedStatus: ResourceDisplayFacts["status"],
): ResourceDisplayFact[] => {
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: account.name,
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: normalizedStatus,
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: hasSavedKey(account)
        ? MANAGED_RESOURCE_SECRET_STATES.Available
        : MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    },
  ]
  const baseUrl = getBaseUrl(account)
  if (baseUrl) {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: baseUrl,
    })
  }
  if (typeof account.concurrency === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: account.concurrency,
    })
  }
  if (typeof account.priority === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: account.priority,
    })
  }
  const models = getModelWhitelist(account)
  if (models.length > 0) {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: models,
    })
  }
  return facts
}

const toFacts = (
  account: Sub2ApiAdminApiKeyAccount,
  ref: ManagedResourceRef,
  includeNotes: boolean,
): ResourceDisplayFacts => {
  const normalizedStatus = statusToDisplay(account.status)
  const fields = baseFacts(account, normalizedStatus)
  if (includeNotes && typeof account.notes === "string" && account.notes) {
    fields.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: account.notes,
    })
  }
  return {
    ref,
    displayName: account.name || `Sub2API account ${account.id}`,
    status: normalizedStatus,
    fields,
    searchValues: [
      account.platform,
      SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
      getBaseUrl(account),
      ...getModelWhitelist(account),
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

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

const validateValues = (
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

const createEditor =
  (): NativeResourceEditorDefinition<Sub2ApiCreateCommand> => ({
    fields: fieldDescriptors(),
    initialValues: createInitialValues(),
    validate: (values) => validateValues(values, { create: true }),
    buildCommand: buildCreateCommand,
  })

const createSub2ApiChannelImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name]: seed.name,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]: sub2ApiChannelTypeToPlatform(
    seed.channelType,
  ),
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
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency]: 1,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority]: seed.priority,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes]: seed.notes,
})

const editEditor = (
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

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Sub2ApiAdminApiError) {
    const upstreamCode =
      error.code === undefined ? undefined : String(error.code)
    const code =
      error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE ||
      error.status === 403
        ? MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
        : error.status === 401
          ? MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
          : error.status === 404
            ? MANAGED_RESOURCE_FAILURE_CODES.NotFound
            : error.status === undefined
              ? MANAGED_RESOURCE_FAILURE_CODES.Unavailable
              : MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
    return {
      code,
      message: error.message,
      ...(upstreamCode ? { upstreamCode } : {}),
    }
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Unavailable }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const openConfig = async (): Promise<Sub2ApiNativeConfig> => {
  const preferences = await userPreferences.getPreferences()
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.SUB2API,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }
  if (!isHttpUrl(resolved.config.baseUrl)) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
  return {
    config: {
      baseUrl: resolved.config.baseUrl.trim(),
      adminToken: resolved.config.adminToken.trim(),
    },
    scopeKey: normalizeManagedUpstreamResourceScopeKey(resolved.config.baseUrl),
  }
}

const sub2ApiNativeDefinition = {
  siteType: SITE_TYPES.SUB2API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createSub2ApiChannelImportProjection,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig,
  scopeKey: (config: Sub2ApiNativeConfig) => config.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    try {
      return parseSub2ApiResourceId(resourceId)
    } catch (error) {
      if (!(error instanceof InvalidSub2ApiResourceIdError)) throw error
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
  },
  locatorFromListItem: (item: Sub2ApiAdminApiKeyAccount) => item.id,
  locatorFromDetail: (detail: Sub2ApiAdminApiKeyAccount) => detail.id,
  list: async (
    nativeConfig: Sub2ApiNativeConfig,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    const search = query?.search?.trim()
    const page = search
      ? await searchSub2ApiApiKeyAccounts(nativeConfig.config, search, {
          signal: options?.signal,
        })
      : await listSub2ApiApiKeyAccounts(nativeConfig.config, {
          signal: options?.signal,
        })
    const items = page.items.filter(
      (item) =>
        item.type === "apikey" &&
        isSub2ApiManagedResourcePlatform(item.platform),
    )
    return { items, total: items.length }
  },
  get: (
    nativeConfig: Sub2ApiNativeConfig,
    locator: number,
    options?: ResourceOperationOptions,
  ) =>
    getSub2ApiApiKeyAccount(nativeConfig.config, locator, {
      signal: options?.signal,
    }),
  toListFacts: (item: Sub2ApiAdminApiKeyAccount, ref: ManagedResourceRef) =>
    toFacts(item, ref, false),
  toDetailFacts: (detail: Sub2ApiAdminApiKeyAccount, ref: ManagedResourceRef) =>
    toFacts(detail, ref, true),
  createEditor: async () => createEditor(),
  editEditor,
  create: (
    nativeConfig: Sub2ApiNativeConfig,
    command: Sub2ApiCreateCommand,
    options?: ResourceOperationOptions,
  ) =>
    createSub2ApiManagedAccountMutation(
      nativeConfig.config,
      command.input,
      command.desiredStatus,
      { signal: options?.signal },
    ),
  update: async (
    nativeConfig: Sub2ApiNativeConfig,
    detail: Sub2ApiAdminApiKeyAccount,
    command: Sub2ApiApiKeyAccountUpdateInput,
    options?: ResourceOperationOptions,
  ) =>
    Object.keys(command).length === 0
      ? {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: detail,
          confirmedEffects: [],
        }
      : await updateSub2ApiManagedAccountMutation(
          nativeConfig.config,
          detail.id,
          command,
          { signal: options?.signal },
        ),
  delete: (
    nativeConfig: Sub2ApiNativeConfig,
    locator: number,
    options?: ResourceOperationOptions,
  ) =>
    deleteSub2ApiManagedAccountMutation(nativeConfig.config, locator, {
      signal: options?.signal,
    }),
  mapFailure,
}

export const sub2ApiManagedResourceRegistration = defineNativeResourceKind(
  sub2ApiNativeDefinition,
)
