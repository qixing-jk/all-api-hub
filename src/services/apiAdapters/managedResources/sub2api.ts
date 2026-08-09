import { SITE_TYPES } from "~/constants/siteType"
import {
  isSub2ApiManagedResourcePlatform,
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES,
  MANAGED_RESOURCE_FIELD_TYPES,
  ManagedResourceError,
  type EditableResourceProjection,
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
  listSub2ApiApiKeyAccounts,
  revealSub2ApiApiKey,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
  type Sub2ApiApiKeyAccountCreateInput,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import type {
  Sub2ApiAdminApiKeyAccount,
  Sub2ApiApiKeyAccountPlatform,
  Sub2ApiApiKeyAccountStatus,
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
    return { kind: "unchanged" }
  }
  if (value.kind === "replace" && typeof value.value === "string") {
    return { kind: "replace", value: value.value }
  }
  return value.kind === "clear" ? { kind: "clear" } : { kind: "unchanged" }
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
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Active) return "enabled"
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive) return "disabled"
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Error) return "auto-disabled"
  return "unknown"
}

const getBaseUrl = (account: Sub2ApiAdminApiKeyAccount) =>
  typeof account.credentials?.base_url === "string"
    ? account.credentials.base_url
    : ""

const hasSavedKey = (account: Sub2ApiAdminApiKeyAccount) =>
  account.credentials_status?.has_api_key === true

const matchesSearch = (account: Sub2ApiAdminApiKeyAccount, search: string) => {
  const needle = search.toLocaleLowerCase()
  return [
    account.name,
    account.platform,
    SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
    getBaseUrl(account),
  ].some((value) => value.toLocaleLowerCase().includes(needle))
}

const baseFacts = (
  account: Sub2ApiAdminApiKeyAccount,
): ResourceDisplayFact[] => {
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
      kind: "text",
      value: account.name,
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      kind: "text",
      value: SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
      kind: "text",
      value: statusToDisplay(account.status),
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
      kind: "secret",
      state: hasSavedKey(account) ? "available" : "unavailable",
    },
  ]
  const baseUrl = getBaseUrl(account)
  if (baseUrl) {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      kind: "text",
      value: baseUrl,
    })
  }
  if (typeof account.concurrency === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      kind: "number",
      value: account.concurrency,
    })
  }
  if (typeof account.priority === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
      kind: "number",
      value: account.priority,
    })
  }
  return facts
}

const toFacts = (
  account: Sub2ApiAdminApiKeyAccount,
  ref: ManagedResourceRef,
  includeNotes: boolean,
): ResourceDisplayFacts => {
  const fields = baseFacts(account)
  if (includeNotes && typeof account.notes === "string" && account.notes) {
    fields.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
      kind: "text",
      value: account.notes,
    })
  }
  return {
    ref,
    displayName: account.name || `Sub2API account ${account.id}`,
    status: statusToDisplay(account.status),
    fields,
    searchValues: [
      account.platform,
      SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
      getBaseUrl(account),
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
]

// Source: https://github.com/Wei-Shaw/sub2api/blob/48eb3766d2da817b171b45bb3036d42575e42b8f/backend/internal/handler/admin/account_handler.go
// API-key create and update accept notes, credentials, concurrency and priority;
// update omits platform, so only platform stays read-only during edit.
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
    options: Object.entries(SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS).map(
      ([value, displayLabel]) => ({ value, displayLabel }),
    ),
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
        ? "unavailable"
        : hasSavedKey(detail)
          ? "available"
          : "unavailable",
    canReplace: true,
    allowClear: false,
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
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]: "openai",
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status]:
    SUB2API_MANAGED_RESOURCE_STATUS.Active,
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: "",
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: { kind: "unchanged" },
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
  [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: { kind: "unchanged" },
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
  const allowedStatus =
    status === SUB2API_MANAGED_RESOURCE_STATUS.Active ||
    status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive ||
    (!context.create &&
      context.detail?.status === SUB2API_MANAGED_RESOURCE_STATUS.Error &&
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
    (context.create && (secret.kind !== "replace" || !secret.value.trim())) ||
    secret.kind === "clear" ||
    (secret.kind === "replace" && !secret.value.trim())
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
      apiKey: secret.kind === "replace" ? secret.value.trim() : "",
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
  const status = readString(
    values,
    SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
  ) as Sub2ApiApiKeyAccountStatus
  const secret = readSecretIntent(values)
  const notes = readString(values, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes)

  if (name !== detail.name.trim()) input.name = name
  if (baseUrl !== getBaseUrl(detail).trim()) input.baseUrl = baseUrl
  if (concurrency !== (detail.concurrency ?? 1)) input.concurrency = concurrency
  if (priority !== (detail.priority ?? 1)) input.priority = priority
  if (status !== detail.status) input.status = status
  if (secret.kind === "replace") input.apiKey = secret.value.trim()
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
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
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
    const locator = Number(resourceId)
    if (!Number.isSafeInteger(locator) || locator <= 0) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return locator
  },
  locatorFromListItem: (item: Sub2ApiAdminApiKeyAccount) => item.id,
  locatorFromDetail: (detail: Sub2ApiAdminApiKeyAccount) => detail.id,
  list: async (
    nativeConfig: Sub2ApiNativeConfig,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    const search = query?.search?.trim()
    const page = await listSub2ApiApiKeyAccounts(nativeConfig.config, {
      signal: options?.signal,
    })
    const items = search
      ? page.items.filter((item) => matchesSearch(item, search))
      : page.items
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
  create: (nativeConfig: Sub2ApiNativeConfig, command: Sub2ApiCreateCommand) =>
    createSub2ApiManagedAccountMutation(
      nativeConfig.config,
      command.input,
      command.desiredStatus,
    ),
  update: async (
    nativeConfig: Sub2ApiNativeConfig,
    detail: Sub2ApiAdminApiKeyAccount,
    command: Sub2ApiApiKeyAccountUpdateInput,
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
        ),
  delete: (nativeConfig: Sub2ApiNativeConfig, locator: number) =>
    deleteSub2ApiManagedAccountMutation(nativeConfig.config, locator),
  mapFailure,
}

export const sub2ApiManagedResourceRegistration = defineNativeResourceKind(
  sub2ApiNativeDefinition,
)
