import {
  GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS as fields,
  GPT_LOAD_DEFAULT_CHANNEL_ID,
} from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
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
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceFieldOption,
  type ResourceListQuery,
  type ResourceOperationOptions,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ResourceSecretListEntry } from "~/services/apiAdapters/contracts/resourceNative"
import {
  credentialFingerprint,
  withCredentialListEditor,
} from "~/services/apiAdapters/managedResources/credentialListEditor"
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
} from "~/services/apiAdapters/managedResources/factory"
import {
  gptLoadChannelEffect,
  runGptLoadMutation,
} from "~/services/apiAdapters/managedSites/gptLoadMutation"
import {
  createGptLoadGroup,
  deleteGptLoadGroup,
  deleteGptLoadGroupCredential,
  getGptLoadGroupModels,
  getGptLoadGroupSettings,
  GptLoadApiError,
  importGptLoadGroupCredentials,
  listAllGptLoadGroups,
  listGptLoadChannelCatalog,
  listGptLoadGroupCredentials,
  listGptLoadModelIds,
  revealGptLoadGroupCredential,
  updateGptLoadGroupModels,
  updateGptLoadGroupSettings,
} from "~/services/apiService/gptLoad"
import {
  GPT_LOAD_SECRET_STATES,
  readGptLoadGroupBaseUrl,
  toGptLoadSanitizedGroup,
  type GptLoadSanitizedGroup,
} from "~/services/apiService/gptLoad/redaction"
import { type ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { toGptLoadDisclosureError } from "~/services/managedSites/providers/gptLoad"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { GptLoadCredential } from "~/types/gptLoad"
import {
  normalizeGptLoadBaseUrl,
  type GptLoadConfig,
} from "~/types/gptLoadConfig"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"

/** Editor credential row (id + masked/plaintext value + per-row fields). */
type CredentialRecord = {
  id: string
  key: string
  fields: Record<string, string>
}

/**
 * Native gpt-load channel workspace backing one group.
 *
 * Deliberate non-features, recorded next to the code they constrain (contract
 * verified against a live v2 control plane on 2026-10-03):
 * - A group owns a credential *pool*, so the editor's key field is a secret
 *   list: rows are added through the gateway's import route and removed through
 *   per-credential DELETE. Plaintext is per-row reveal only; the list is always
 *   masked.
 * - Editing replaces a saved row by importing its new value and deleting the
 *   old row, because the gateway's single-row credential PUT expects the
 *   channel-specific credential object whose field key is descriptor-driven.
 * - The `channel_id` is read-only while editing: repointing a group at another
 *   channel type (`PUT /api/groups/:id/channel`) clears the credential pool
 *   the gateway bound to the previous driver, so the editor does not offer it.
 * - No batch model auto-sync capability is registered; per-group model lists
 *   are edited in place through the workspace (models are written with
 *   `PUT /api/groups/:id/models`).
 * - Import uses `POST /api/groups` (single-step, no gateway reachability check
 *   of the source) exactly like the gateway's own UI, so import success does
 *   not depend on the gateway reaching the source.
 */

type GptLoadNativeConfig = {
  config: GptLoadConfig
  scopeKey: string
}

/** A group with the read state the native workspace renders. */
export interface GptLoadGroupDetail {
  group: GptLoadSanitizedGroup
  models: readonly string[]
  credentials: readonly GptLoadCredential[]
}

export class GptLoadNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "GptLoadNativeError"
  }
}

const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapGptLoadFailureCode = (
  error: GptLoadApiError,
): ResourceFailure["code"] => {
  if (
    error.code === "ABORT_ERR" ||
    (error.raw instanceof Error && error.raw.name === "AbortError")
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401 || error.status === 423) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  if (error.status === 409) {
    return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
  }
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: GptLoadConfig,
): GptLoadNativeError => {
  if (error instanceof GptLoadNativeError) return error
  if (error instanceof GptLoadApiError) {
    return new GptLoadNativeError(
      {
        code: mapGptLoadFailureCode(error),
        message: toGptLoadDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new GptLoadNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new GptLoadNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof GptLoadNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const runRead = async <T>(
  nativeConfig: GptLoadNativeConfig,
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
): Promise<GptLoadNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.GPT_LOAD,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  try {
    const url = new URL(normalizeGptLoadBaseUrl(resolved.config.baseUrl))
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid origin")
    }
    return {
      config: resolved.config,
      scopeKey: normalizeManagedUpstreamResourceScopeKey(url.origin),
    }
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.InvalidConfiguration,
    })
  }
}

const toSecretState = (
  state:
    | (typeof GPT_LOAD_SECRET_STATES)[keyof typeof GPT_LOAD_SECRET_STATES]
    | (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES],
): (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES] => {
  switch (state) {
    case GPT_LOAD_SECRET_STATES.Available:
    case MANAGED_RESOURCE_SECRET_STATES.Available:
      return MANAGED_RESOURCE_SECRET_STATES.Available
    case GPT_LOAD_SECRET_STATES.Masked:
    case MANAGED_RESOURCE_SECRET_STATES.Masked:
      return MANAGED_RESOURCE_SECRET_STATES.Masked
    default:
      return MANAGED_RESOURCE_SECRET_STATES.Unavailable
  }
}

const toFacts = (
  detail: GptLoadGroupDetail,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const sanitized = detail.group
  const status = sanitized.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.name,
    },
    {
      fieldId: fields.Provider,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.channelName || sanitized.channelId,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.baseUrl,
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: [...detail.models],
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: toSecretState(sanitized.secretState),
    },
    {
      fieldId: fields.PriceMultiplier,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.priceMultiplier,
    },
    ...(sanitized.weight === null
      ? []
      : [
          {
            fieldId: fields.Weight,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
            value: sanitized.weight,
          } satisfies ResourceDisplayFact,
        ]),
  ]

  return {
    ref,
    displayName: sanitized.name,
    status,
    fields: facts,
    searchValues: [
      sanitized.channelId,
      sanitized.channelName,
      sanitized.baseUrl,
      ...sanitized.models,
    ].filter(Boolean),
    actions: { canUpdate: true, canDelete: true },
  }
}

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

const readStringList = (
  values: EditableResourceProjection,
  fieldId: string,
): string[] => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
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

const channelOption = (id: string, name: string): ResourceFieldOption => ({
  value: id,
  displayLabel: name || id,
})

const createFieldDescriptors = (): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: fields.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
  },
  {
    fieldId: fields.Provider,
    type: MANAGED_RESOURCE_FIELD_TYPES.Select,
    required: true,
    options: [{ value: GPT_LOAD_DEFAULT_CHANNEL_ID }],
    // `/api/channels` is a cheap authoritative catalogue, so the driver list
    // loads with the editor instead of sitting behind a manual button.
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Automatic,
    },
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: [],
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.PriceMultiplier, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: true,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canReplace: true,
    allowClear: false,
  },
]

const editFieldDescriptors = (): readonly ResourceFieldDescriptor[] => [
  {
    fieldId: fields.Name,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    required: true,
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
    // Repointing a group at another channel clears the gateway-bound credential
    // pool, so the driver is fixed while editing.
    fieldId: fields.Provider,
    type: MANAGED_RESOURCE_FIELD_TYPES.Text,
    readOnly: true,
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Models,
    type: MANAGED_RESOURCE_FIELD_TYPES.MultiSelect,
    options: [],
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.PriceMultiplier, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Weight,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: 1,
    max: 100,
    step: 1,
  },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canLoadSecret: true,
    canReplace: true,
    allowClear: false,
  },
]

const createInitialValues = (): EditableResourceProjection => ({
  [fields.Name]: "",
  [fields.Provider]: GPT_LOAD_DEFAULT_CHANNEL_ID,
  [fields.BaseUrl]: "",
  [fields.Models]: [],
  [fields.PriceMultiplier]: "1",
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
})

const editInitialValues = (
  detail: GptLoadGroupDetail,
): EditableResourceProjection => ({
  [fields.Name]: detail.group.name,
  [fields.Status]: detail.group.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.Provider]: detail.group.channelName || detail.group.channelId,
  [fields.BaseUrl]: detail.group.baseUrl,
  [fields.Models]: [...detail.models],
  [fields.PriceMultiplier]: detail.group.priceMultiplier || "1",
  ...(detail.group.weight === null
    ? {}
    : { [fields.Weight]: detail.group.weight }),
  [fields.Key]: { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
})

const validateCreateValues = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (!readString(values, fields.Provider).trim()) {
    issues.push({
      fieldId: fields.Provider,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && !isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const secret = readSecretIntent(values)
  if (
    secret.kind !== MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace ||
    !hasUsableManagedSiteChannelKey(secret.value)
  ) {
    issues.push({
      fieldId: fields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

const validateEditValues = (
  values: EditableResourceProjection,
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  if (!readString(values, fields.Name).trim()) {
    issues.push({
      fieldId: fields.Name,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
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
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && !isHttpUrl(baseUrl)) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

interface GptLoadGroupCommand {
  name: string
  channelId: string
  baseUrl: string
  models: readonly string[]
  priceMultiplier: string
  enabled?: boolean
  weight?: number | null
}

/**
 * The composed editor's command: the base scalars plus the credential-pool
 * shot. `credentialPatch.entries` is the authoritative full list (the base
 * buildCommand only ever sees the first row's scalar secret).
 */
export type GptLoadGroupEditorCommand = GptLoadGroupCommand & {
  credentialPatch?: {
    baseline: string
    entries: readonly ResourceSecretListEntry[]
  }
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): GptLoadGroupCommand => ({
  name: readString(values, fields.Name).trim(),
  channelId: readString(values, fields.Provider).trim(),
  baseUrl: readString(values, fields.BaseUrl).trim(),
  models: readStringList(values, fields.Models),
  priceMultiplier: readString(values, fields.PriceMultiplier).trim() || "1",
})

const buildUpdateCommand = (
  detail: GptLoadGroupDetail,
  values: EditableResourceProjection,
): GptLoadGroupCommand => {
  const enabled =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  const weightValue = readNumber(values, fields.Weight)
  const weight =
    Number.isInteger(weightValue) &&
    Number.isFinite(weightValue) &&
    weightValue >= 1 &&
    weightValue <= 100
      ? weightValue
      : null
  const baseUrl = readString(values, fields.BaseUrl).trim()
  return {
    name: readString(values, fields.Name).trim(),
    channelId: detail.group.channelId,
    baseUrl,
    models: readStringList(values, fields.Models),
    priceMultiplier: readString(values, fields.PriceMultiplier).trim() || "1",
    enabled,
    weight,
  }
}

const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [fields.Name]: seed.name,
  [fields.Provider]: seed.channelType.trim() || GPT_LOAD_DEFAULT_CHANNEL_ID,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Models]: [...seed.models],
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
})

/** Masked metadata rows for the editor's saved credential pool. */
const gptLoadKeyMetadata = (
  credentials: readonly GptLoadCredential[],
): CredentialRecord[] =>
  credentials.map((credential) => ({
    id: String(credential.credential_id),
    key: "********",
    fields: {},
  }))

const gptLoadKeyMetadataFingerprint = async (
  records: readonly CredentialRecord[],
): Promise<string> =>
  await credentialFingerprint(records.map((record) => ({ ...record, key: "" })))

/** The newly-typed keys from an editor command's credential-pool shot. */
const gptLoadReplacementKeys = (command: GptLoadGroupEditorCommand): string[] =>
  (command.credentialPatch?.entries ?? [])
    .map((entry) =>
      entry.secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? entry.secret.value.trim()
        : "",
    )
    .filter(Boolean)

export type GptLoadNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: GptLoadGroupDetail[]; total: number }>
  get(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<GptLoadGroupDetail>
  loadChannelOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  loadModelOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  loadSecret(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<CredentialRecord[]>
  create(
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<GptLoadGroupDetail>>
  update(
    detail: GptLoadGroupDetail,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<GptLoadGroupDetail>>
  delete(
    locator: number,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

/** Opens the scope-bound gpt-load operations shared by UI and matching. */
export async function openGptLoadNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<GptLoadNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const { config } = nativeConfig

  const readDetail = async (
    locator: number,
    readOptions?: ResourceOperationOptions,
  ): Promise<GptLoadGroupDetail> =>
    await runRead(nativeConfig, readOptions, async () => {
      const settings = await getGptLoadGroupSettings(config, locator, {
        signal: readOptions?.signal,
      })
      const modelRows = await getGptLoadGroupModels(config, locator, {
        signal: readOptions?.signal,
      })
      const credentials = await listGptLoadGroupCredentials(config, locator, {
        signal: readOptions?.signal,
      })
      const modelIds = modelRows.map((model) => model.id)
      const group: Parameters<typeof toGptLoadSanitizedGroup>[0] = {
        id: locator,
        name: settings?.name ?? "",
        channel_id: settings?.channel_id ?? "",
        channel_name: settings?.channel_id,
        params: settings?.params,
        enabled: settings?.enabled ?? true,
        price_multiplier: settings?.price_multiplier,
        weight: settings?.weight_manual,
        model_names: modelIds,
        model_count: modelIds.length,
        credential_counts: {
          total: credentials.length,
          available: credentials.length,
        },
      }
      const maskedSample = credentials[0]?.mask ?? ""
      return {
        group: toGptLoadSanitizedGroup(group, maskedSample),
        models: modelIds,
        credentials,
      }
    })

  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim().toLowerCase() ?? ""
      const groups = await runRead(nativeConfig, operationOptions, async () =>
        listAllGptLoadGroups(config, { signal: operationOptions?.signal }),
      )
      const items = groups
        .filter((group) =>
          search
            ? [
                group.name,
                group.channel_id,
                group.channel_name,
                readGptLoadGroupBaseUrl(group),
                group.endpoint ?? "",
                ...(Array.isArray(group.model_names) ? group.model_names : []),
              ]
                .join(" ")
                .toLowerCase()
                .includes(search)
            : true,
        )
        .map((group) => {
          const sanitized = toGptLoadSanitizedGroup(group)
          return {
            group: sanitized,
            models: sanitized.models,
            credentials: [],
          } as GptLoadGroupDetail
        })
      return { items, total: items.length }
    },
    get: readDetail,
    loadChannelOptions: async (operationOptions) => {
      const catalog = await runRead(nativeConfig, operationOptions, async () =>
        listGptLoadChannelCatalog(config, {
          signal: operationOptions?.signal,
        }),
      )
      return catalog.map((entry) =>
        channelOption(entry.channel_id, entry.name ?? ""),
      )
    },
    loadModelOptions: async (operationOptions) => {
      // The gateway's own catalogue, not a union of other groups' model lists.
      const ids = await runRead(nativeConfig, operationOptions, async () =>
        listGptLoadModelIds(config, { signal: operationOptions?.signal }),
      )
      return ids.map((id) => channelOption(id, id))
    },
    loadSecret: async (locator, operationOptions) => {
      const credentials = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listGptLoadGroupCredentials(config, locator, {
            signal: operationOptions?.signal,
          }),
      )
      const records: CredentialRecord[] = []
      for (const credential of credentials) {
        const key = await revealGptLoadGroupCredential(
          config,
          locator,
          credential.credential_id,
          { signal: operationOptions?.signal },
        ).catch(() => "")
        records.push({
          id: String(credential.credential_id),
          key,
          fields: {},
        })
      }
      return records
    },
    create: async (command, operationOptions) => {
      throwIfAborted(operationOptions)
      const keys = gptLoadReplacementKeys(command)
      if (keys.length === 0) {
        throw new GptLoadNativeError({
          code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
          message: "At least one channel credential is required",
        })
      }
      return await runGptLoadMutation<GptLoadGroupDetail>({
        effect: gptLoadChannelEffect("resource-created"),
        execute: async () => {
          const created = await createGptLoadGroup(
            config,
            {
              name: command.name,
              channelId: command.channelId,
              connectionType: "api_key",
              params: command.baseUrl ? { base_url: command.baseUrl } : {},
              models: command.models,
              credentials: keys,
              priceMultiplier: command.priceMultiplier,
            },
            { signal: operationOptions?.signal },
          )
          return {
            group: toGptLoadSanitizedGroup(created),
            models: command.models,
            credentials: [],
          }
        },
      })
    },
    update: async (detail, command, operationOptions) => {
      throwIfAborted(operationOptions)
      const groupId = detail.group.id

      const dirty: Promise<void>[] = []
      const patch: {
        name?: string
        params?: Record<string, unknown>
        enabled?: boolean
        priceMultiplier?: string
        weightManual?: number | null
      } = {}
      if (command.name !== detail.group.name) patch.name = command.name
      if (command.baseUrl !== detail.group.baseUrl) {
        patch.params = command.baseUrl ? { base_url: command.baseUrl } : {}
      }
      const enabledChanged =
        command.enabled !== undefined &&
        command.enabled !== detail.group.enabled
      if (enabledChanged) patch.enabled = command.enabled
      if (command.priceMultiplier !== detail.group.priceMultiplier) {
        patch.priceMultiplier = command.priceMultiplier
      }
      if (command.weight !== null && command.weight !== detail.group.weight) {
        patch.weightManual = command.weight
      }
      if (Object.keys(patch).length > 0) {
        dirty.push(
          updateGptLoadGroupSettings(config, groupId, patch, {
            signal: operationOptions?.signal,
          }).then(() => {}),
        )
      }

      const existingIds = new Set(
        detail.credentials.map((credential) => credential.credential_id),
      )
      // The editor's secret-list carries one entry per row. A row whose secret
      // is "unchanged" keeps its gateway credential; a "replace" row is a new
      // key (typed over a saved row or added fresh) and must be imported; a
      // saved row absent from the entries was removed and must be deleted.
      const entries = command.credentialPatch?.entries ?? []
      const entryIds = new Set(
        entries.map((entry) => entry.id).filter((id) => id && id !== "new"),
      )
      const importKeys = entries
        .map((entry) =>
          entry.secret.kind ===
          MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
            ? entry.secret.value.trim()
            : "",
        )
        .filter(Boolean)
      const deleteIds = [...existingIds].filter(
        (id) =>
          !entryIds.has(String(id)) ||
          entries.some(
            (entry) =>
              entry.id === String(id) &&
              entry.secret.kind ===
                MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
          ),
      )

      if (importKeys.length > 0) {
        dirty.push(
          importGptLoadGroupCredentials(config, groupId, importKeys, {
            signal: operationOptions?.signal,
          }).then(() => {}),
        )
      }
      for (const credentialId of deleteIds) {
        dirty.push(
          deleteGptLoadGroupCredential(config, groupId, credentialId, {
            signal: operationOptions?.signal,
          }).then(() => {}),
        )
      }

      const oldModelSet = new Set(detail.models)
      const newModelSet = new Set(command.models)
      const modelChanged =
        oldModelSet.size !== newModelSet.size ||
        [...oldModelSet].some((model) => !newModelSet.has(model))
      if (modelChanged) {
        dirty.push(
          updateGptLoadGroupModels(config, groupId, command.models, {
            signal: operationOptions?.signal,
          }).then(() => {}),
        )
      }

      await Promise.all(dirty)

      return await runGptLoadMutation<GptLoadGroupDetail>({
        effect: gptLoadChannelEffect("resource-updated", groupId),
        execute: async () => {
          const updated = await readDetail(groupId, operationOptions)
          return updated
        },
        successData: () => {
          return {
            group: detail.group,
            models: command.models,
            credentials: detail.credentials,
          }
        },
      })
    },
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      return await runGptLoadMutation<void, void>({
        effect: gptLoadChannelEffect("resource-deleted", locator),
        execute: async () =>
          await deleteGptLoadGroup(config, locator, {
            signal: operationOptions?.signal,
          }),
        successData: () => undefined,
      })
    },
  }
}

/** Newly typed keys on an update are the union of the list editor's replaces. */
export type { GptLoadGroupCommand }

const createBaseEditor = (
  operations: GptLoadNativeResourceOperations,
): NativeResourceEditorDefinition<GptLoadGroupCommand> => ({
  fields: createFieldDescriptors(),
  initialValues: createInitialValues(),
  validate: validateCreateValues,
  buildCommand: (values: EditableResourceProjection) =>
    buildCreateCommand(values),
  loadOptions: async (
    fieldId: string,
    _values: EditableResourceProjection,
    options?: ResourceOperationOptions,
  ) => {
    if (fieldId === fields.Provider) {
      return await operations.loadChannelOptions(options)
    }
    if (fieldId === fields.Models) {
      return await operations.loadModelOptions(options)
    }
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  },
})

const createEditor = async (
  operations: GptLoadNativeResourceOperations,
  options?: ResourceOperationOptions,
) => {
  void options
  const base = createBaseEditor(operations)
  // Every create row is a brand-new key; the shared list editor turns the
  // single secret into additive rows.
  const records: CredentialRecord[] = []
  return await withCredentialListEditor(
    base,
    fields.Key,
    records,
    false,
    undefined,
    [],
    gptLoadKeyMetadataFingerprint,
  )
}

const editEditor = async (
  operations: GptLoadNativeResourceOperations,
  detail: GptLoadGroupDetail,
  options?: ResourceOperationOptions,
) => {
  void options
  const base: NativeResourceEditorDefinition<GptLoadGroupCommand> = {
    fields: editFieldDescriptors(),
    initialValues: editInitialValues(detail),
    validate: (values: EditableResourceProjection) =>
      validateEditValues(values),
    buildCommand: (values: EditableResourceProjection) =>
      buildUpdateCommand(detail, values),
    loadOptions: async (
      fieldId: string,
      _values: EditableResourceProjection,
      loadOptions?: ResourceOperationOptions,
    ) => {
      if (fieldId === fields.Models) {
        return await operations.loadModelOptions(loadOptions)
      }
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    },
  }
  const records = gptLoadKeyMetadata(detail.credentials)
  return await withCredentialListEditor(
    base,
    fields.Key,
    records,
    true,
    async (loadOptions?: ResourceOperationOptions) =>
      await operations.loadSecret(detail.group.id, loadOptions),
    [],
    gptLoadKeyMetadataFingerprint,
  )
}

const definition = {
  siteType: SITE_TYPES.GPT_LOAD,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createImportProjection,
      validate: validateCreateValues,
      sourceFieldIds: {
        [fields.Name]: "name",
        [fields.Provider]: "channelType",
        [fields.BaseUrl]: "baseUrl",
        [fields.Key]: "credential",
        [fields.Models]: "models",
      } as const,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openGptLoadNativeResourceOperations,
  scopeKey: (operations: GptLoadNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    const parsed = Number(resourceId)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return parsed
  },
  locatorFromListItem: (item: GptLoadGroupDetail) => item.group.id,
  locatorFromDetail: (detail: GptLoadGroupDetail) => detail.group.id,
  list: async (
    operations: GptLoadNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => await operations.list(query, options),
  get: (
    operations: GptLoadNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: (
    operations: GptLoadNativeResourceOperations,
    options?: ResourceOperationOptions,
  ) => createEditor(operations, options),
  editEditor: (
    operations: GptLoadNativeResourceOperations,
    detail: GptLoadGroupDetail,
    options?: ResourceOperationOptions,
  ) => editEditor(operations, detail, options),
  create: async (
    operations: GptLoadNativeResourceOperations,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ) => await operations.create(command, options),
  update: async (
    operations: GptLoadNativeResourceOperations,
    detail: GptLoadGroupDetail,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ) => await operations.update(detail, command, options),
  delete: async (
    operations: GptLoadNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => await operations.delete(locator, options),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}

export const gptLoadManagedResourceRegistration =
  defineNativeResourceKind(definition)
