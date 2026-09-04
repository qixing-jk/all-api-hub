import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeNames,
  ClaudeCodeHubProviderTypeOptions,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
  isClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
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
  claudeCodeHubChannelEffect,
  runClaudeCodeHubMutation,
} from "~/services/apiAdapters/managedSites/claudeCodeHubMutation"
import {
  ClaudeCodeHubApiError,
  createProviderV1,
  deleteProviderV1,
  getProvider as getProviderV1,
  getUnmaskedProviderKey,
  listProviders,
  searchProviders,
  updateProviderV1,
} from "~/services/apiService/claudeCodeHub"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import { toClaudeCodeHubDisclosureError } from "~/services/managedSites/providers/claudeCodeHub"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { userPreferences } from "~/services/preferences/userPreferences"
import type {
  ClaudeCodeHubAllowedModel,
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
  ClaudeCodeHubProviderUpdatePayload,
} from "~/types/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import { normalizeList } from "~/utils/core/string"

type ClaudeCodeHubNativeConfig = {
  config: ClaudeCodeHubConfig
  scopeKey: string
}

type ClaudeCodeHubNativeUpdateCommand = Omit<
  ClaudeCodeHubProviderUpdatePayload,
  "providerId"
>

export class ClaudeCodeHubNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "ClaudeCodeHubNativeError"
  }
}

const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapClaudeCodeHubFailureCode = (
  error: ClaudeCodeHubApiError,
): ResourceFailure["code"] => {
  const rawName =
    error.raw && typeof error.raw === "object" && "name" in error.raw
      ? error.raw.name
      : undefined
  const rawCode =
    error.raw && typeof error.raw === "object" && "code" in error.raw
      ? error.raw.code
      : undefined
  if (
    rawName === "AbortError" ||
    error.code === "ABORT_ERR" ||
    rawCode === "ABORT_ERR"
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) {
    return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  }
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: ClaudeCodeHubConfig,
): ClaudeCodeHubNativeError => {
  if (error instanceof ClaudeCodeHubNativeError) return error
  if (error instanceof ClaudeCodeHubApiError) {
    return new ClaudeCodeHubNativeError(
      {
        code: mapClaudeCodeHubFailureCode(error),
        message: toClaudeCodeHubDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ClaudeCodeHubNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new ClaudeCodeHubNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof ClaudeCodeHubNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const runRead = async <T>(
  nativeConfig: ClaudeCodeHubNativeConfig,
  options: ResourceOperationOptions | undefined,
  operation: () => Promise<T>,
): Promise<T> => {
  throwIfAborted(options)
  try {
    const result = await operation()
    throwIfAborted(options)
    return result
  } catch (error) {
    throw toNativeError(error, nativeConfig.config)
  }
}

const openConfig = async (
  options?: ResourceOperationOptions,
): Promise<ClaudeCodeHubNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.CLAUDE_CODE_HUB,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  let scopeKey: string
  try {
    const url = new URL(resolved.config.baseUrl.trim())
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid origin")
    }
    scopeKey = normalizeManagedUpstreamResourceScopeKey(url.origin)
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }

  return { config: resolved.config, scopeKey }
}

export const normalizeClaudeCodeHubAllowedModels = (
  allowedModels?: ClaudeCodeHubAllowedModel[] | null,
): string[] =>
  normalizeList(
    (allowedModels ?? []).flatMap((item) => {
      if (typeof item === "string") return [item]
      if (item?.matchType && item.matchType !== "exact") return []
      return item?.pattern ? [item.pattern] : []
    }),
  )

const nonExactAllowedModels = (
  allowedModels?: ClaudeCodeHubAllowedModel[] | null,
): ClaudeCodeHubAllowedModel[] =>
  (allowedModels ?? []).filter(
    (item) =>
      typeof item !== "string" && item?.matchType && item.matchType !== "exact",
  )

const toExactAllowedModels = (
  models: readonly string[],
): ClaudeCodeHubAllowedModel[] =>
  normalizeList(models).map((pattern) => ({ matchType: "exact", pattern }))

const providerType = (detail: ClaudeCodeHubProviderDisplay) =>
  detail.providerType?.trim() || CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE

const providerTypeLabel = (detail: ClaudeCodeHubProviderDisplay) =>
  ClaudeCodeHubProviderTypeNames[
    providerType(detail) as keyof typeof ClaudeCodeHubProviderTypeNames
  ] ?? providerType(detail)

const resourceStatus = (
  detail: ClaudeCodeHubProviderDisplay,
): ResourceDisplayFacts["status"] =>
  detail.isEnabled === false
    ? MANAGED_RESOURCE_STATUSES.Disabled
    : MANAGED_RESOURCE_STATUSES.Enabled

const secretState = (detail: ClaudeCodeHubProviderDisplay) => {
  if (hasUsableManagedSiteChannelKey(detail.key)) {
    return MANAGED_RESOURCE_SECRET_STATES.Available
  }
  return detail.maskedKey?.trim() || detail.key?.trim()
    ? MANAGED_RESOURCE_SECRET_STATES.Masked
    : MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

const toFacts = (
  detail: ClaudeCodeHubProviderDisplay,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const models = normalizeClaudeCodeHubAllowedModels(detail.allowedModels)
  const status = resourceStatus(detail)
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.name || `Provider ${detail.id}`,
    },
    {
      fieldId: fields.Type,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: providerType(detail),
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.url ?? "",
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: secretState(detail),
    },
    {
      fieldId: fields.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: models,
    },
    {
      fieldId: fields.GroupTag,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.groupTag?.trim() || "default",
    },
    {
      fieldId: fields.Priority,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: detail.priority ?? 0,
    },
    {
      fieldId: fields.Weight,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: Number.isFinite(detail.weight) ? Math.max(1, detail.weight!) : 1,
    },
  ]

  return {
    ref,
    displayName: detail.name || `Provider ${detail.id}`,
    status,
    fields: facts,
    searchValues: [
      providerType(detail),
      providerTypeLabel(detail),
      detail.url ?? "",
      detail.groupTag ?? "",
      ...models,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

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

const typeOptions = (detail?: ClaudeCodeHubProviderDisplay) => {
  const options = ClaudeCodeHubProviderTypeOptions.map(({ value }) => ({
    value,
  }))
  const currentType = detail && providerType(detail)
  return currentType && !isClaudeCodeHubProviderType(currentType)
    ? [...options, { value: currentType }]
    : options
}

const fieldDescriptors = (
  detail?: ClaudeCodeHubProviderDisplay,
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
    options: [
      { value: MANAGED_RESOURCE_STATUSES.Enabled },
      { value: MANAGED_RESOURCE_STATUSES.Disabled },
    ],
  },
  {
    fieldId: fields.BaseUrl,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: detail === undefined,
    secretState:
      detail === undefined
        ? MANAGED_RESOURCE_SECRET_STATES.Unavailable
        : secretState(detail),
    canLoadSecret: detail !== undefined,
    canReplace: true,
    allowClear: false,
  },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: normalizeClaudeCodeHubAllowedModels(detail?.allowedModels).map(
      (value) => ({ value }),
    ),
  },
  { fieldId: fields.GroupTag, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 0,
    step: 1,
  },
  {
    fieldId: fields.Weight,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 1,
    max: 100,
    step: 1,
  },
]

const initialValues = (
  detail?: ClaudeCodeHubProviderDisplay,
): EditableResourceProjection => ({
  [fields.Name]: detail?.name ?? "",
  [fields.Type]: detail
    ? providerType(detail)
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [fields.Status]:
    detail?.isEnabled === false
      ? MANAGED_RESOURCE_STATUSES.Disabled
      : MANAGED_RESOURCE_STATUSES.Enabled,
  [fields.BaseUrl]: detail?.url ?? "",
  [fields.Key]: detail
    ? { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged }
    : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace, value: "" },
  [fields.Models]: normalizeClaudeCodeHubAllowedModels(detail?.allowedModels),
  [fields.GroupTag]: detail ? detail.groupTag?.trim() || "" : "default",
  [fields.Priority]: detail?.priority ?? 0,
  [fields.Weight]:
    typeof detail?.weight === "number" && Number.isFinite(detail.weight)
      ? Math.max(1, detail.weight)
      : 1,
})

const validateValues = (
  values: EditableResourceProjection,
  detail?: ClaudeCodeHubProviderDisplay,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const type = readString(values, fields.Type).trim()
  const existingType = detail ? providerType(detail) : null
  if (!isClaudeCodeHubProviderType(type) && type !== existingType) {
    issues.push({
      fieldId: fields.Type,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
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
  const baseUrl = readString(values, fields.BaseUrl)
  if (!baseUrl.trim()) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  } else if (!isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const secret = readSecretIntent(values)
  if (
    (!detail &&
      (secret.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
        !hasUsableManagedSiteChannelKey(secret.value))) ||
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value))
  ) {
    issues.push({
      fieldId: fields.Key,
      code: detail
        ? MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue
        : MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const priority = readNumber(values, fields.Priority)
  if (!Number.isInteger(priority) || priority < 0) {
    issues.push({
      fieldId: fields.Priority,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  const weight = readNumber(values, fields.Weight)
  if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
    issues.push({
      fieldId: fields.Weight,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): ClaudeCodeHubProviderCreatePayload => {
  const secret = readSecretIntent(values)
  return {
    name: readString(values, fields.Name).trim(),
    url: readString(values, fields.BaseUrl).trim(),
    key:
      secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? secret.value.trim()
        : "",
    provider_type: readString(values, fields.Type).trim(),
    allowed_models: toExactAllowedModels(readList(values, fields.Models)),
    is_enabled:
      readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled,
    weight: Math.max(1, Math.trunc(readNumber(values, fields.Weight))),
    priority: readNumber(values, fields.Priority),
    group_tag: readString(values, fields.GroupTag).trim() || "default",
  }
}

const buildUpdateCommand = (
  detail: ClaudeCodeHubProviderDisplay,
  values: EditableResourceProjection,
): ClaudeCodeHubNativeUpdateCommand => {
  const models = readList(values, fields.Models)
  const secret = readSecretIntent(values)
  // The v0.9.5 PATCH schema is strict. Send only the editable snake_case
  // projection; provider summaries contain read-only camelCase fields.
  // Source: https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/lib/api/v1/schemas/providers.ts
  const payload: ClaudeCodeHubNativeUpdateCommand = {}
  const name = readString(values, fields.Name).trim()
  if (name !== detail.name.trim()) payload.name = name
  const url = readString(values, fields.BaseUrl).trim()
  if (url !== detail.url.trim()) payload.url = url
  const type = readString(values, fields.Type).trim()
  if (type !== providerType(detail)) payload.provider_type = type
  const initialModels = normalizeClaudeCodeHubAllowedModels(
    detail.allowedModels,
  )
  if (
    models.length !== initialModels.length ||
    models.some((model, index) => model !== initialModels[index])
  ) {
    payload.allowed_models = [
      ...nonExactAllowedModels(detail.allowedModels),
      ...toExactAllowedModels(models),
    ]
  }
  const isEnabled =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  if (isEnabled !== (detail.isEnabled !== false)) {
    payload.is_enabled = isEnabled
  }
  const weight = Math.max(1, Math.trunc(readNumber(values, fields.Weight)))
  const initialWeight =
    typeof detail.weight === "number" && Number.isFinite(detail.weight)
      ? Math.max(1, detail.weight)
      : 1
  if (weight !== initialWeight) payload.weight = weight
  const priority = readNumber(values, fields.Priority)
  if (priority !== (detail.priority ?? 0)) payload.priority = priority
  const groupTag = readString(values, fields.GroupTag).trim() || null
  if (groupTag !== (detail.groupTag?.trim() || null)) {
    payload.group_tag = groupTag
  }
  if (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    payload.key = secret.value.trim()
  }
  return payload
}

const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...initialValues(),
  [fields.Name]: seed.name,
  [fields.Type]: isClaudeCodeHubProviderType(seed.channelType)
    ? seed.channelType
    : CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
  [fields.Status]: seed.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  [fields.Models]: normalizeList(seed.models),
  [fields.Priority]: seed.priority,
  [fields.Weight]: Math.max(1, Math.trunc(seed.orderingWeight || 1)),
})

const createEditor =
  (): NativeResourceEditorDefinition<ClaudeCodeHubProviderCreatePayload> => ({
    fields: fieldDescriptors(),
    initialValues: initialValues(),
    validate: (values) => validateValues(values),
    buildCommand: buildCreateCommand,
  })

const editEditor = (
  operations: ClaudeCodeHubNativeResourceOperations,
  detail: ClaudeCodeHubProviderDisplay,
): NativeResourceEditorDefinition<ClaudeCodeHubNativeUpdateCommand> => ({
  fields: fieldDescriptors(detail),
  initialValues: initialValues(detail),
  validate: (values) => validateValues(values, detail),
  buildCommand: (values) => buildUpdateCommand(detail, values),
  loadSecret: async (fieldId, options) => {
    if (fieldId !== fields.Key) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadSecret(detail.id, options)
  },
})

const isProviderDetail = (
  value: unknown,
): value is ClaudeCodeHubProviderDisplay =>
  Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { id?: unknown }).id === "number" &&
      typeof (value as { name?: unknown }).name === "string",
  )

const stripUnknownMutationData = (
  result: ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>,
): ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay> => {
  if (result.outcome !== MANAGED_SITE_MUTATION_OUTCOMES.Succeeded) {
    return result
  }
  if (isProviderDetail(result.data)) return result
  return {
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
    diagnostic: {
      code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      message: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    },
  }
}

const getProvider = async (
  nativeConfig: ClaudeCodeHubNativeConfig,
  locator: number,
  options?: ResourceOperationOptions,
) =>
  await runRead(
    nativeConfig,
    options,
    async () =>
      await getProviderV1(nativeConfig.config, locator, {
        signal: options?.signal,
      }),
  )

const runMutation = async <T>(
  nativeConfig: ClaudeCodeHubNativeConfig,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toNativeError(error, nativeConfig.config)
  }
}

type ClaudeCodeHubNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: ClaudeCodeHubProviderDisplay[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ClaudeCodeHubProviderDisplay>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<string>
  create(
    command: ClaudeCodeHubProviderCreatePayload,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>>
  update(
    detail: ClaudeCodeHubProviderDisplay,
    command: ClaudeCodeHubNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<ClaudeCodeHubProviderDisplay>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

/** Opens the scope-bound Claude Code Hub operations shared by UI and migration. */
export async function openClaudeCodeHubNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<ClaudeCodeHubNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const create = async (
    command: ClaudeCodeHubProviderCreatePayload,
    operationOptions?: ResourceOperationOptions,
  ) => {
    throwIfAborted(operationOptions)
    return stripUnknownMutationData(
      await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-created"),
            execute: async () =>
              await createProviderV1(nativeConfig.config, command, {
                signal: operationOptions?.signal,
              }),
          }),
      ),
    )
  }
  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim()
      const items = await runRead(nativeConfig, operationOptions, async () =>
        search
          ? await searchProviders(nativeConfig.config, search, {
              signal: operationOptions?.signal,
            })
          : await listProviders(nativeConfig.config, {
              signal: operationOptions?.signal,
            }),
      )
      return { items, total: items.length }
    },
    get: (locator, operationOptions) =>
      getProvider(nativeConfig, locator, operationOptions),
    loadSecret: (locator, operationOptions) =>
      runRead(
        nativeConfig,
        operationOptions,
        async () =>
          await getUnmaskedProviderKey(nativeConfig.config, locator, {
            signal: operationOptions?.signal,
          }),
      ),
    create,
    update: async (detail, command, operationOptions) => {
      throwIfAborted(operationOptions)
      const result = await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-updated", detail.id),
            execute: async () =>
              await updateProviderV1(nativeConfig.config, detail.id, command, {
                signal: operationOptions?.signal,
              }),
          }),
      )
      if (
        result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded &&
        !isProviderDetail(result.data)
      ) {
        try {
          return {
            ...result,
            data: await getProvider(nativeConfig, detail.id, operationOptions),
          }
        } catch {
          return stripUnknownMutationData(result)
        }
      }
      return stripUnknownMutationData(result)
    },
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      return await runMutation(
        nativeConfig,
        async () =>
          await runClaudeCodeHubMutation({
            effect: claudeCodeHubChannelEffect("resource-deleted", locator),
            execute: async () =>
              await deleteProviderV1(nativeConfig.config, locator, {
                signal: operationOptions?.signal,
              }),
            successData: () => undefined,
          }),
      )
    },
  }
}

const definition = {
  siteType: SITE_TYPES.CLAUDE_CODE_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createImportProjection,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openClaudeCodeHubNativeResourceOperations,
  scopeKey: (operations: ClaudeCodeHubNativeResourceOperations) =>
    operations.scopeKey,
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
  locatorFromListItem: (item: ClaudeCodeHubProviderDisplay) => item.id,
  locatorFromDetail: (detail: ClaudeCodeHubProviderDisplay) => detail.id,
  list: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    return await operations.list(query, options)
  },
  get: (
    operations: ClaudeCodeHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: async () => createEditor(),
  editEditor,
  create: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    command: ClaudeCodeHubProviderCreatePayload,
    options?: ResourceOperationOptions,
  ) => operations.create(command, options),
  update: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    detail: ClaudeCodeHubProviderDisplay,
    command: ClaudeCodeHubNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, command, options),
  delete: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  mapFailure,
}

export const claudeCodeHubManagedResourceRegistration =
  defineNativeResourceKind(definition)
