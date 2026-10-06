import {
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS as fields,
  OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS,
  OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  OMNIROUTE_PRIORITY_RANGE,
} from "~/constants/omniroute"
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
import {
  defineNativeResourceKind,
  type NativeResourceEditorDefinition,
} from "~/services/apiAdapters/managedResources/factory"
import {
  omniRouteChannelEffect,
  runOmniRouteMutation,
} from "~/services/apiAdapters/managedSites/omnirouteMutation"
import {
  createOmniRouteConnection,
  createOmniRouteProviderNode,
  deleteOmniRouteConnection,
  deleteOmniRouteProviderNode,
  getOmniRouteConnection,
  listAllOmniRouteConnections,
  listOmniRouteModelProviderIds,
  OmniRouteApiError,
  updateOmniRouteConnection,
  type OmniRouteConnectionUpdatePayload,
} from "~/services/apiService/omniroute"
import {
  OMNIROUTE_SECRET_STATES,
  toOmniRouteSanitizedConnection,
  type OmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"
import {
  MANAGED_SITE_MUTATION_OUTCOMES,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import {
  fetchOmniRouteChannelSecretKey,
  toOmniRouteDisclosureError,
} from "~/services/managedSites/providers/omniroute"
import { resolveManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeManagedUpstreamResourceScopeKey } from "~/types/managedUpstreamResource"
import {
  normalizeOmniRouteBaseUrl,
  type OmniRouteConfig,
} from "~/types/omnirouteConfig"
import { normalizeList } from "~/utils/core/string"

/**
 * Native OmniRoute channel workspace backing one provider connection.
 *
 * Deliberate non-features, recorded next to the code they constrain (upstream
 * contract verified against the `release/v3.8.51` line on 2026-09-29):
 * - No per-channel model list. Models come from the gateway's provider
 *   catalogue plus gateway-level aliases and a disabled list; a connection only
 *   stores `defaultModel`. There is no write target for AAH's channel model
 *   sync, so this adapter registers no `models` capability.
 * - No gateway API-key workspace. AAH's only managed resource kind is
 *   `Channel`; keys stay reachable through the console route instead.
 * - Import never uses `/api/providers/bulk` or `/api/providers/import`: both
 *   validate every key against the source from the gateway, which would make
 *   the gateway's outbound reachability part of import success. Single
 *   `POST /api/providers` performs no reachability check, so AAH's own
 *   credential verification stays authoritative.
 * - The create editor exposes no status. The create route does not accept
 *   `isActive` and always persists `false`, then fire-and-forgets its own
 *   connection test; status is only editable afterwards.
 * - The import draft's `enabled` flag is not carried: the gateway owns the
 *   initial state for the reason above.
 *
 * Live-validation status: reading the connection inventory, a single-step
 * create with a connection-level `baseUrl`, reading one connection back, the
 * credential-visibility matrix, and delete were exercised against a real
 * deployment while the contract was researched (see
 * `.scratch/router-gateway-sites/research.md`). The partial-update path, the
 * node-backed create, the secret read, and every extension UI flow have only
 * been exercised against mocks, so treat those as unverified on a live
 * deployment.
 */

type OmniRouteNativeConfig = {
  config: OmniRouteConfig
  scopeKey: string
}

export class OmniRouteNativeError extends Error {
  constructor(
    readonly failure: ResourceFailure,
    override readonly cause?: unknown,
  ) {
    super(failure.message ?? failure.code)
    this.name = "OmniRouteNativeError"
  }
}

const throwIfAborted = (options?: ResourceOperationOptions) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

const mapOmniRouteFailureCode = (
  error: OmniRouteApiError,
): ResourceFailure["code"] => {
  if (
    error.code === "ABORT_ERR" ||
    (error.raw instanceof Error && error.raw.name === "AbortError")
  ) {
    return MANAGED_RESOURCE_FAILURE_CODES.Aborted
  }
  if (error.status === 401) {
    return MANAGED_RESOURCE_FAILURE_CODES.AuthenticationFailed
  }
  if (error.status === 403) {
    return MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied
  }
  if (error.status === 404) return MANAGED_RESOURCE_FAILURE_CODES.NotFound
  if (error.status === undefined || error.status >= 500) {
    return MANAGED_RESOURCE_FAILURE_CODES.Unavailable
  }
  return MANAGED_RESOURCE_FAILURE_CODES.UpstreamRejected
}

const toNativeError = (
  error: unknown,
  config: OmniRouteConfig,
): OmniRouteNativeError => {
  if (error instanceof OmniRouteNativeError) return error
  if (error instanceof OmniRouteApiError) {
    return new OmniRouteNativeError(
      {
        code: mapOmniRouteFailureCode(error),
        // The gateway's own message is what tells a user about a name conflict
        // or a rejected base URL; keep it while redacting the token.
        message: toOmniRouteDisclosureError(error, config).message,
        ...(error.code === undefined
          ? {}
          : { upstreamCode: String(error.code) }),
      },
      error,
    )
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new OmniRouteNativeError(
      { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted },
      error,
    )
  }
  return new OmniRouteNativeError(
    { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected },
    error,
  )
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof OmniRouteNativeError) return error.failure
  if (error instanceof Error && error.name === "AbortError") {
    return { code: MANAGED_RESOURCE_FAILURE_CODES.Aborted }
  }
  return { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }
}

const runRead = async <T>(
  nativeConfig: OmniRouteNativeConfig,
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
): Promise<OmniRouteNativeConfig> => {
  throwIfAborted(options)
  const preferences = await userPreferences.getPreferences()
  throwIfAborted(options)
  const resolved = resolveManagedSiteRuntimeConfigForType(
    preferences,
    SITE_TYPES.OMNIROUTE,
  )
  if (!resolved) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
    })
  }

  try {
    const url = new URL(normalizeOmniRouteBaseUrl(resolved.config.baseUrl))
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
  state: OmniRouteSanitizedConnection["secretState"],
): (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES] => {
  switch (state) {
    case OMNIROUTE_SECRET_STATES.Available:
      return MANAGED_RESOURCE_SECRET_STATES.Available
    case OMNIROUTE_SECRET_STATES.Masked:
      return MANAGED_RESOURCE_SECRET_STATES.Masked
    default:
      return MANAGED_RESOURCE_SECRET_STATES.Unavailable
  }
}

const displayedProvider = (sanitized: OmniRouteSanitizedConnection): string =>
  sanitized.nodePrefix
    ? `${sanitized.provider} (${sanitized.nodePrefix})`
    : sanitized.provider

/**
 * The gateway's routing rank, or null when the row reports none. The update
 * route only accepts `1..100_000`, so a row outside that range is treated as
 * "no rank to show" instead of being echoed back as a value the user could
 * never save.
 */
const connectionPriority = (
  sanitized: OmniRouteSanitizedConnection,
): number | null =>
  sanitized.priority !== null &&
  sanitized.priority >= OMNIROUTE_PRIORITY_RANGE.min &&
  sanitized.priority <= OMNIROUTE_PRIORITY_RANGE.max
    ? sanitized.priority
    : null

/** The rank the editor starts from; the number control has no empty state. */
const editablePriority = (sanitized: OmniRouteSanitizedConnection): number =>
  connectionPriority(sanitized) ?? OMNIROUTE_PRIORITY_RANGE.min

const toFacts = (
  sanitized: OmniRouteSanitizedConnection,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const status = sanitized.isActive
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled
  const rank = connectionPriority(sanitized)
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.name,
    },
    {
      fieldId: fields.Provider,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: displayedProvider(sanitized),
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.baseUrl,
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: toSecretState(sanitized.secretState),
    },
    {
      fieldId: fields.DefaultModel,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.defaultModel,
    },
    // A prefix only exists once a dedicated provider node backs the connection,
    // so a connection without one has no row to show rather than an empty one.
    ...(sanitized.nodePrefix
      ? [
          {
            fieldId: fields.Prefix,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.nodePrefix,
          } satisfies ResourceDisplayFact,
        ]
      : []),
    ...(rank === null
      ? []
      : [
          {
            fieldId: fields.Priority,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
            value: rank,
          } satisfies ResourceDisplayFact,
        ]),
    // Before the gateway's first test there is no state to report.
    ...(sanitized.testStatus
      ? [
          {
            fieldId: fields.TestStatus,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.testStatus,
          } satisfies ResourceDisplayFact,
        ]
      : []),
    ...(sanitized.lastError
      ? [
          {
            fieldId: fields.LastError,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.lastError,
          } satisfies ResourceDisplayFact,
        ]
      : []),
  ]

  return {
    keyCleanupBaseUrls: [sanitized.baseUrl],
    ref,
    displayName: sanitized.name,
    status,
    fields: facts,
    searchValues: [
      sanitized.provider,
      sanitized.nodePrefix,
      sanitized.nodeName,
      sanitized.baseUrl,
      sanitized.defaultModel,
    ].filter(Boolean),
    actions: { canUpdate: true, canDelete: true },
  }
}

const readString = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "string" ? values[fieldId] : ""

const readNumber = (values: EditableResourceProjection, fieldId: string) =>
  typeof values[fieldId] === "number" ? values[fieldId] : Number.NaN

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

/** A node prefix becomes a `prefix/model` address, so it must be a URL-safe token. */
const isModelPrefix = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)

/**
 * The gateway exposes no provider-catalogue route, so the select starts from the
 * providers this integration knows by endpoint and can be refreshed from the
 * deployment's own model catalogue.
 *
 * Provider ids are slugs with no display name of their own, so the label is the
 * id: a generated "unknown" label would hide what is actually being written.
 */
const providerOption = (value: string): ResourceFieldOption => ({
  value,
  displayLabel: value,
})

const providerOptions = (): readonly ResourceFieldOption[] =>
  Object.keys(OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS)
    .sort((left, right) => left.localeCompare(right))
    .map(providerOption)

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
    options: providerOptions(),
    optionLoader: {
      dependsOn: [],
      trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
    },
  },
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    required: true,
    secretState: MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    canReplace: true,
    allowClear: false,
  },
  { fieldId: fields.DefaultModel, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  { fieldId: fields.Prefix, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
]

const editFieldDescriptors = (
  sanitized: OmniRouteSanitizedConnection,
): readonly ResourceFieldDescriptor[] => [
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
  { fieldId: fields.BaseUrl, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    fieldId: fields.Key,
    type: MANAGED_RESOURCE_FIELD_TYPES.Secret,
    secretState: toSecretState(sanitized.secretState),
    canLoadSecret: true,
    canReplace: true,
    allowClear: false,
  },
  { fieldId: fields.DefaultModel, type: MANAGED_RESOURCE_FIELD_TYPES.Text },
  {
    // Only the update route takes a rank: the create route auto-assigns
    // `MAX(priority) + 1` when it is omitted, so a new channel is ordered by the
    // gateway and only ever reordered afterwards.
    fieldId: fields.Priority,
    type: MANAGED_RESOURCE_FIELD_TYPES.Number,
    min: OMNIROUTE_PRIORITY_RANGE.min,
    max: OMNIROUTE_PRIORITY_RANGE.max,
    step: 1,
  },
]

const createInitialValues = (): EditableResourceProjection => ({
  [fields.Name]: "",
  [fields.Provider]: OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  [fields.BaseUrl]: "",
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: "",
  },
  [fields.DefaultModel]: "",
  [fields.Prefix]: "",
})

const editInitialValues = (
  sanitized: OmniRouteSanitizedConnection,
): EditableResourceProjection => ({
  [fields.Name]: sanitized.name,
  [fields.Status]: sanitized.isActive
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled,
  [fields.BaseUrl]: sanitized.baseUrl,
  [fields.Key]: { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
  [fields.DefaultModel]: sanitized.defaultModel,
  [fields.Priority]: editablePriority(sanitized),
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
  const prefix = readString(values, fields.Prefix).trim()
  if (prefix && !isModelPrefix(prefix)) {
    issues.push({
      fieldId: fields.Prefix,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  // A provider node carries its own base URL, so the prefix path cannot fall
  // back to the built-in provider's static endpoint.
  if (prefix && !baseUrl) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.Required,
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
  sanitized: OmniRouteSanitizedConnection,
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
  // A stored override cannot be removed: the gateway rejects an empty or null
  // `providerSpecificData.baseUrl` with a 400 and deletes no other key from the
  // merged object. Clearing the field would therefore always fail, so it is
  // refused here with the field help explaining why.
  if (!baseUrl && sanitized.baseUrl) {
    issues.push({
      fieldId: fields.BaseUrl,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const secret = readSecretIntent(values)
  if (
    secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Clear ||
    (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value))
  ) {
    issues.push({
      fieldId: fields.Key,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  const priority = readNumber(values, fields.Priority)
  if (
    !Number.isInteger(priority) ||
    priority < OMNIROUTE_PRIORITY_RANGE.min ||
    priority > OMNIROUTE_PRIORITY_RANGE.max
  ) {
    issues.push({
      fieldId: fields.Priority,
      code: MANAGED_RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
    })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

type OmniRouteNativeCreateCommand = {
  provider: string
  name: string
  apiKey: string
  baseUrl: string
  defaultModel: string
  prefix: string
}

const buildCreateCommand = (
  values: EditableResourceProjection,
): OmniRouteNativeCreateCommand => {
  const secret = readSecretIntent(values)
  return {
    provider: readString(values, fields.Provider).trim(),
    name: readString(values, fields.Name).trim(),
    apiKey:
      secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace
        ? secret.value.trim()
        : "",
    baseUrl: readString(values, fields.BaseUrl).trim(),
    defaultModel: readString(values, fields.DefaultModel).trim(),
    prefix: readString(values, fields.Prefix).trim(),
  }
}

type OmniRouteNativeUpdateCommand = OmniRouteConnectionUpdatePayload

const buildUpdateCommand = (
  sanitized: OmniRouteSanitizedConnection,
  values: EditableResourceProjection,
): OmniRouteNativeUpdateCommand => {
  const payload: OmniRouteNativeUpdateCommand = {}
  const name = readString(values, fields.Name).trim()
  if (name !== sanitized.name) payload.name = name
  const isActive =
    readString(values, fields.Status) === MANAGED_RESOURCE_STATUSES.Enabled
  if (isActive !== sanitized.isActive) payload.isActive = isActive
  const baseUrl = readString(values, fields.BaseUrl).trim()
  if (baseUrl && baseUrl !== sanitized.baseUrl) {
    payload.providerSpecificData = { baseUrl }
  }
  const defaultModel = readString(values, fields.DefaultModel).trim()
  if (defaultModel !== sanitized.defaultModel) {
    payload.defaultModel = defaultModel || null
  }
  const priority = readNumber(values, fields.Priority)
  if (Number.isInteger(priority) && priority !== editablePriority(sanitized)) {
    payload.priority = priority
  }
  const secret = readSecretIntent(values)
  if (secret.kind === MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace) {
    payload.apiKey = secret.value.trim()
  }
  return payload
}

const createImportProjection = (
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection => ({
  ...createInitialValues(),
  [fields.Name]: seed.name,
  [fields.Provider]:
    seed.channelType.trim() || OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  [fields.BaseUrl]: seed.baseUrl,
  [fields.Key]: {
    kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
    value: seed.credential,
  },
  // A connection stores one default model rather than a list, so the first
  // advertised model is the only honest prefill.
  [fields.DefaultModel]: normalizeList([...seed.models])[0] ?? "",
})

export type OmniRouteNativeResourceOperations = {
  scopeKey: string
  list(
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ): Promise<{ items: OmniRouteSanitizedConnection[]; total: number }>
  get(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<OmniRouteSanitizedConnection>
  loadSecret(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<string>
  loadProviderOptions(
    options?: ResourceOperationOptions,
  ): Promise<readonly ResourceFieldOption[]>
  create(
    command: OmniRouteNativeCreateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>>
  update(
    sanitized: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>>
  delete(
    locator: string,
    options?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<void>>
}

/** Opens the scope-bound OmniRoute operations shared by UI and migration. */
export async function openOmniRouteNativeResourceOperations(
  options?: ResourceOperationOptions,
): Promise<OmniRouteNativeResourceOperations> {
  const nativeConfig = await openConfig(options)
  const { config } = nativeConfig

  const readDetail = async (
    locator: string,
    readOptions?: ResourceOperationOptions,
  ) =>
    toOmniRouteSanitizedConnection(
      await runRead(nativeConfig, readOptions, async () =>
        getOmniRouteConnection(config, locator, {
          signal: readOptions?.signal,
        }),
      ),
    )

  /**
   * Reads one stored credential in plaintext.
   *
   * The shared helper owns the client-route semantics; a deployment that
   * tightens that route turns this into a failure the match resolver degrades
   * from, not an import blocker.
   */
  const readSecret = async (
    locator: string,
    readOptions?: ResourceOperationOptions,
  ) =>
    await runRead(nativeConfig, readOptions, async () =>
      fetchOmniRouteChannelSecretKey(config, locator, {
        signal: readOptions?.signal,
      }),
    )

  const create = async (
    command: OmniRouteNativeCreateCommand,
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>> => {
    throwIfAborted(operationOptions)
    let createdNodeId: string | null = null

    const result = await runOmniRouteMutation<OmniRouteSanitizedConnection>({
      effect: omniRouteChannelEffect("resource-created"),
      execute: async () => {
        let provider = command.provider
        if (command.prefix) {
          // A dedicated model prefix needs its own provider node, because the
          // connection snapshots the node's prefix/baseUrl at creation.
          createdNodeId = await createOmniRouteProviderNode(
            config,
            {
              name: command.name,
              prefix: command.prefix,
              apiType: "chat",
              baseUrl: command.baseUrl,
              type: "openai-compatible",
            },
            { signal: operationOptions?.signal },
          )
          provider = createdNodeId
        }

        const created = await createOmniRouteConnection(
          config,
          {
            provider,
            name: command.name,
            apiKey: command.apiKey,
            ...(command.defaultModel
              ? { defaultModel: command.defaultModel }
              : {}),
            // The connection-level override wins over the provider's static
            // endpoint, which is what makes a one-step import of an arbitrary
            // relay possible. A node-backed connection inherits the node's URL.
            ...(command.baseUrl && !command.prefix
              ? { providerSpecificData: { baseUrl: command.baseUrl } }
              : {}),
          },
          { signal: operationOptions?.signal },
        )
        return toOmniRouteSanitizedConnection(created)
      },
    })

    if (
      result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Rejected &&
      createdNodeId
    ) {
      // Only a confirmed rejection proves the connection was not stored. A 5xx
      // or a transport failure may have committed it, and deleting the node
      // would then break a live connection.
      await deleteOmniRouteProviderNode(config, createdNodeId, {
        signal: operationOptions?.signal,
      }).catch(() => {
        // Best-effort compensation; the connection failure is what the user sees.
      })
    }
    return result
  }

  const update = async (
    sanitized: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    operationOptions?: ResourceOperationOptions,
  ): Promise<ManagedSiteMutationResult<OmniRouteSanitizedConnection>> => {
    throwIfAborted(operationOptions)
    if (Object.keys(command).length === 0) {
      throw new OmniRouteNativeError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await runOmniRouteMutation<OmniRouteSanitizedConnection>({
      effect: omniRouteChannelEffect("resource-updated", sanitized.id),
      execute: async () =>
        toOmniRouteSanitizedConnection(
          await updateOmniRouteConnection(config, sanitized.id, command, {
            signal: operationOptions?.signal,
          }),
        ),
    })
  }

  return {
    scopeKey: nativeConfig.scopeKey,
    list: async (query, operationOptions) => {
      const search = query?.search?.trim().toLowerCase() ?? ""
      const connections = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listAllOmniRouteConnections(config, {
            signal: operationOptions?.signal,
          }),
      )
      const items = connections
        .map(toOmniRouteSanitizedConnection)
        .filter((sanitized) =>
          search
            ? [
                sanitized.name,
                sanitized.provider,
                sanitized.nodePrefix,
                sanitized.baseUrl,
                sanitized.defaultModel,
              ]
                .join(" ")
                .toLowerCase()
                .includes(search)
            : true,
        )
      return { items, total: items.length }
    },
    get: readDetail,
    loadSecret: readSecret,
    loadProviderOptions: async (operationOptions) => {
      const providerIds = await runRead(
        nativeConfig,
        operationOptions,
        async () =>
          listOmniRouteModelProviderIds(config, {
            signal: operationOptions?.signal,
          }),
      )
      const values = new Set<string>([
        ...providerIds,
        ...Object.keys(OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS),
      ])
      return [...values]
        .sort((left, right) => left.localeCompare(right))
        .map(providerOption)
    },
    create,
    update,
    delete: async (locator, operationOptions) => {
      throwIfAborted(operationOptions)
      // A prefix identifies a node, not its owner. The upstream node DELETE
      // cascades to all its connections and aliases; even an inventory read
      // cannot prevent a sibling being created between that read and deletion.
      // Delete only the requested connection. In-flight create compensation
      // separately retains the authoritative id returned by node creation.
      // OmniRoute release/v3.8.51: src/app/api/provider-nodes/[id]/route.ts
      return await runOmniRouteMutation<void, void>({
        effect: omniRouteChannelEffect("resource-deleted", locator),
        execute: async () =>
          await deleteOmniRouteConnection(config, locator, {
            signal: operationOptions?.signal,
          }),
        successData: () => undefined,
      })
    },
  }
}

const createEditor = (
  operations: OmniRouteNativeResourceOperations,
): NativeResourceEditorDefinition<OmniRouteNativeCreateCommand> => ({
  fields: createFieldDescriptors(),
  initialValues: createInitialValues(),
  validate: validateCreateValues,
  buildCommand: buildCreateCommand,
  loadOptions: async (fieldId, _values, options) => {
    if (fieldId !== fields.Provider) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadProviderOptions(options)
  },
})

const editEditor = (
  operations: OmniRouteNativeResourceOperations,
  sanitized: OmniRouteSanitizedConnection,
): NativeResourceEditorDefinition<OmniRouteNativeUpdateCommand> => ({
  fields: editFieldDescriptors(sanitized),
  initialValues: editInitialValues(sanitized),
  validate: (values) => validateEditValues(sanitized, values),
  buildCommand: (values) => buildUpdateCommand(sanitized, values),
  loadSecret: async (fieldId, options) => {
    if (fieldId !== fields.Key) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return await operations.loadSecret(sanitized.id, options)
  },
})

const definition = {
  siteType: SITE_TYPES.OMNIROUTE,
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
        [fields.DefaultModel]: "models",
      } as const,
    },
  ],
  capabilities: {
    // The gateway has no text search; the workspace filters its walked
    // inventory locally so the shared search box still narrows the table.
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openOmniRouteNativeResourceOperations,
  scopeKey: (operations: OmniRouteNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: string) => locator,
  decodeLocator: (resourceId: string) => {
    if (!resourceId) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return resourceId
  },
  locatorFromListItem: (item: OmniRouteSanitizedConnection) => item.id,
  locatorFromDetail: (detail: OmniRouteSanitizedConnection) => detail.id,
  list: async (
    operations: OmniRouteNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => await operations.list(query, options),
  get: (
    operations: OmniRouteNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: async (operations: OmniRouteNativeResourceOperations) =>
    createEditor(operations),
  editEditor: (
    operations: OmniRouteNativeResourceOperations,
    detail: OmniRouteSanitizedConnection,
  ) => editEditor(operations, detail),
  create: async (
    operations: OmniRouteNativeResourceOperations,
    command: OmniRouteNativeCreateCommand,
    options?: ResourceOperationOptions,
  ) => await operations.create(command, options),
  update: async (
    operations: OmniRouteNativeResourceOperations,
    detail: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ) => await operations.update(detail, command, options),
  delete: async (
    operations: OmniRouteNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) => await operations.delete(locator, options),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}

export const omniRouteManagedResourceRegistration =
  defineNativeResourceKind(definition)
