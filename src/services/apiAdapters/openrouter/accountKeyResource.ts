import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import {
  defineAccountKeyResourceCapability,
  type AccountKeyResourceEditorDefinition,
  type AccountKeyResourcePage,
} from "~/services/apiAdapters/accountKeyResources/factory"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
  type AccountKeyResourceFacts,
  type AccountKeyResourceOpenInput,
  type AccountKeyScope,
  type EditableResourceProjection,
  type ResourceFailure,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import type { NativeResourceMutationResult } from "~/services/apiAdapters/nativeResources/factory"
import {
  createOpenRouterKey,
  deleteOpenRouterKey,
  fetchOpenRouterDefaultWorkspace,
  fetchOpenRouterKey,
  fetchOpenRouterKeys,
  fetchOpenRouterWorkspaceMembers,
  fetchOpenRouterWorkspaces,
  updateOpenRouterKey,
  type OpenRouterCreateKeyInput,
  type OpenRouterKeyInfo,
  type OpenRouterUpdateKeyInput,
  type OpenRouterWorkspace,
  type OpenRouterWorkspaceMember,
} from "~/services/apiService/openrouter"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import {
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"
import { t } from "~/utils/i18n/core"

import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
  type OpenRouterKeyLimitMode,
  type OpenRouterKeyLimitReset,
} from "./keyResourceFields"

const PAGE_SIZE = 100
const MAX_PAGES = 100
const MAX_ACTIVE_CURSORS = 32
const MAX_CURSOR_OFFSET = PAGE_SIZE * MAX_PAGES
const CURSOR_PREFIX = "or-key:"
const INVENTORY_UNAVAILABLE_LABEL = "Workspace inventory unavailable"

// OpenRouter's Management API uses a Management Key for `/keys` and workspace
// inventory. It documents no later key reveal: plaintext is create-response-only,
// so post-dispatch mutations are reconciled once and never replayed.
// https://openrouter.ai/docs/openapi/openapi.yaml

type OpenRouterKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
  readonly managementKey: string
  readonly defaultWorkspace: OpenRouterWorkspace
  readonly workspaceNames: Map<string, string>
  readonly issuedCursors: Map<string, OpenRouterKeyCursorState>
  cursorSequence: number
}

type OpenRouterKeyCursorChain = {
  readonly scopeKey: string
  readonly seenHashes: Set<string>
}

type OpenRouterKeyCursorState = {
  readonly offset: number
  readonly chain: OpenRouterKeyCursorChain
}

type OpenRouterKeyDetail = {
  readonly key: OpenRouterKeyInfo
  readonly workspaceDisplay: string
  readonly creatorDisplay: string
}

type OpenRouterKeyCreateCommand = {
  readonly input: OpenRouterCreateKeyInput
  readonly destinationScope: AccountKeyScope
}

type OpenRouterKeyUpdateCommand = {
  readonly input: OpenRouterUpdateKeyInput
  readonly requested: Readonly<Partial<OpenRouterUpdateKeyInput>>
}

type OpenRouterNativeFailure = {
  readonly error: unknown
  readonly secrets: readonly string[]
}

class OpenRouterNativeResourceError extends Error {
  constructor(readonly failure: OpenRouterNativeFailure) {
    super("openrouter_native_resource_failure")
    this.name = "OpenRouterNativeResourceError"
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const getStructuredStatus = (error: unknown): number | undefined => {
  if (error instanceof ApiError) return error.statusCode
  if (!isRecord(error)) return undefined
  const status = error.statusCode ?? error.status
  return typeof status === "number" && Number.isInteger(status)
    ? status
    : undefined
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const getWorkspaceDisplayName = (workspace: OpenRouterWorkspace): string =>
  workspace.name.trim() || workspace.slug

const toCursor = (sequence: number, offset: number): string =>
  `${CURSOR_PREFIX}${sequence}:${offset}`

const openCursorChain = (
  config: OpenRouterKeyResourceConfig,
  scopeKey: string,
  cursor: string | undefined,
): OpenRouterKeyCursorState => {
  if (!cursor) return { offset: 0, chain: { scopeKey, seenHashes: new Set() } }
  if (!/^or-key:\d+:\d+$/.test(cursor)) throw new Error("invalid_cursor")
  const issued = config.issuedCursors.get(cursor)
  if (!issued) throw new Error("repeated_cursor")
  if (issued.chain.scopeKey !== scopeKey) throw new Error("invalid_cursor")
  config.issuedCursors.delete(cursor)
  if (issued.offset >= MAX_CURSOR_OFFSET) {
    throw new Error("key_pagination_limit")
  }
  return issued
}

const issueCursor = (
  config: OpenRouterKeyResourceConfig,
  offset: number,
  chain: OpenRouterKeyCursorChain,
): string => {
  if (!Number.isInteger(offset) || offset <= 0) {
    throw new Error("non_progress_offset")
  }
  const cursor = toCursor(++config.cursorSequence, offset)
  config.issuedCursors.set(cursor, { offset, chain })
  while (config.issuedCursors.size > MAX_ACTIVE_CURSORS) {
    const oldest = config.issuedCursors.keys().next().value
    if (oldest === undefined) break
    config.issuedCursors.delete(oldest)
  }
  return cursor
}

const workspaceScope = (
  workspace: OpenRouterWorkspace,
  defaultWorkspaceId: string,
  inventoryUnavailable = false,
): AccountKeyScope => ({
  scopeKey: workspace.id,
  routeKey: workspace.slug,
  displayName: getWorkspaceDisplayName(workspace),
  isDefault: workspace.id === defaultWorkspaceId,
  ...(inventoryUnavailable
    ? { secondaryLabel: INVENTORY_UNAVAILABLE_LABEL }
    : workspace.id === defaultWorkspaceId || workspace.slug === workspace.name
      ? {}
      : { secondaryLabel: workspace.slug }),
})

const nativeFailure = (
  error: unknown,
  config: Pick<OpenRouterKeyResourceConfig, "managementKey">,
  extraSecrets: readonly string[] = [],
): OpenRouterNativeResourceError =>
  new OpenRouterNativeResourceError({
    error,
    secrets: [config.managementKey, ...extraSecrets],
  })

const mapNativeFailure = (
  failure: OpenRouterNativeFailure,
): ResourceFailure => {
  const { error } = failure
  const status = getStructuredStatus(error)
  const code =
    isAbortError(error) || status === 499
      ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted
      : status === 401
        ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
        : status === 403
          ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
          : status === 404
            ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound
            : typeof status === "number" && status >= 500
              ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
              : typeof status === "number" && status >= 400
                ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected
                : ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected
  const message = toSanitizedErrorSummary(error, [...failure.secrets]).trim()

  return {
    code,
    message: message || t("account:healthStatus.unknownError"),
    ...(error instanceof ApiError && error.upstreamCode
      ? { upstreamCode: error.upstreamCode }
      : {}),
  }
}

const mapFailure = (error: unknown): ResourceFailure => {
  if (error instanceof OpenRouterNativeResourceError) {
    return mapNativeFailure(error.failure)
  }
  if (isRecord(error) && "error" in error && "secrets" in error) {
    return mapNativeFailure(error as OpenRouterNativeFailure)
  }
  return mapNativeFailure({ error, secrets: [] })
}

const read = async <T>(
  config: OpenRouterKeyResourceConfig,
  operation: () => Promise<T>,
  extraSecrets: readonly string[] = [],
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw nativeFailure(error, config, extraSecrets)
  }
}

const requestWithOptions = (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal
    ? { ...config.request, abortSignal: options.signal }
    : config.request

const isUnreconciledMutationFailure = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    isAbortError(error) || status === 408 || status === 429 || status === 499
  )
}

const isKnownRejection = (error: unknown): boolean => {
  const status = getStructuredStatus(error)
  return (
    !isUnreconciledMutationFailure(error) &&
    typeof status === "number" &&
    status >= 400 &&
    status < 500
  )
}

const mutationFailure = <T>(
  error: unknown,
  config: OpenRouterKeyResourceConfig,
  extraSecrets: readonly string[] = [],
): NativeResourceMutationResult<T, OpenRouterNativeFailure> => {
  const failure = { error, secrets: [config.managementKey, ...extraSecrets] }
  return isKnownRejection(error)
    ? { certainty: "not-applied", failure }
    : { certainty: "possibly-applied" }
}

const normalizeLimitMode = (
  value: unknown,
): OpenRouterKeyLimitMode | undefined =>
  value === OPENROUTER_KEY_LIMIT_MODES.Unlimited ||
  value === OPENROUTER_KEY_LIMIT_MODES.Limited
    ? value
    : undefined

const normalizeLimitReset = (
  value: unknown,
): OpenRouterKeyLimitReset | undefined =>
  Object.values(OPENROUTER_KEY_LIMIT_RESETS).includes(
    value as OpenRouterKeyLimitReset,
  )
    ? (value as OpenRouterKeyLimitReset)
    : undefined

const toApiLimitReset = (
  value: OpenRouterKeyLimitReset,
): OpenRouterCreateKeyInput["limitReset"] =>
  value === OPENROUTER_KEY_LIMIT_RESETS.None ? null : value

const toLimitMode = (limit: number | null): OpenRouterKeyLimitMode =>
  limit === null
    ? OPENROUTER_KEY_LIMIT_MODES.Unlimited
    : OPENROUTER_KEY_LIMIT_MODES.Limited

const toLimitReset = (value: string | null): OpenRouterKeyLimitReset =>
  value === null
    ? OPENROUTER_KEY_LIMIT_RESETS.None
    : normalizeLimitReset(value) ?? OPENROUTER_KEY_LIMIT_RESETS.None

const normalizeUtcDateTime = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString()
}

const createValidation = (
  values: EditableResourceProjection,
  options: { create: boolean; knownWorkspaceIds: ReadonlySet<string> },
): ResourceValidationResult => {
  const issues: ResourceFieldIssue[] = []
  const field = OPENROUTER_KEY_FIELD_IDS
  const name = values[field.Name]
  const workspaceId = values[field.Workspace]
  const creator = values[field.Creator]
  const limitMode = normalizeLimitMode(values[field.LimitMode])
  const limitReset = normalizeLimitReset(values[field.LimitReset])

  if (!isNonBlankString(name)) {
    issues.push({
      fieldId: field.Name,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.Required,
    })
  }
  if (
    options.create &&
    (!isNonBlankString(workspaceId) ||
      !options.knownWorkspaceIds.has(workspaceId))
  ) {
    issues.push({
      fieldId: field.Workspace,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (creator !== null && creator !== undefined && !isNonBlankString(creator)) {
    issues.push({
      fieldId: field.Creator,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (!limitMode) {
    issues.push({
      fieldId: field.LimitMode,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  if (!limitReset) {
    issues.push({
      fieldId: field.LimitReset,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.UnsupportedOption,
    })
  }
  const limit = values[field.Limit]
  if (
    limitMode === OPENROUTER_KEY_LIMIT_MODES.Limited &&
    (!isFiniteNumber(limit) || limit < 0)
  ) {
    issues.push({
      fieldId: field.Limit,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (typeof values[field.IncludeByokInLimit] !== "boolean") {
    issues.push({
      fieldId: field.IncludeByokInLimit,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (!options.create && typeof values[field.Disabled] !== "boolean") {
    issues.push({
      fieldId: field.Disabled,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }
  if (
    options.create &&
    values[field.ExpiresAt] !== null &&
    values[field.ExpiresAt] !== undefined &&
    values[field.ExpiresAt] !== "" &&
    !normalizeUtcDateTime(values[field.ExpiresAt])
  ) {
    issues.push({
      fieldId: field.ExpiresAt,
      code: ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES.InvalidValue,
    })
  }

  return issues.length ? { valid: false, issues } : { valid: true }
}

const toCreatorDisplay = (creatorUserId: string | null): string =>
  creatorUserId ?? "No creator"

const toDetail = (
  config: OpenRouterKeyResourceConfig,
  key: OpenRouterKeyInfo,
  scope?: AccountKeyScope,
): OpenRouterKeyDetail => ({
  key,
  workspaceDisplay:
    config.workspaceNames.get(key.workspace_id) ??
    scope?.displayName ??
    "Workspace",
  creatorDisplay: toCreatorDisplay(key.creator_user_id),
})

const assertKeyScope = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
): OpenRouterKeyInfo => {
  if (key.workspace_id !== scope.scopeKey) throw new Error("key_scope_mismatch")
  return key
}

const assertKeyCorrelation = (
  key: OpenRouterKeyInfo,
  scope: AccountKeyScope,
  hash: string,
): OpenRouterKeyInfo => {
  const scopedKey = assertKeyScope(key, scope)
  if (scopedKey.hash !== hash) throw new Error("key_locator_mismatch")
  return scopedKey
}

const toFacts = (
  detail: OpenRouterKeyDetail,
  ref: AccountKeyResourceFacts["ref"],
): AccountKeyResourceFacts => {
  const key = detail.key
  const expired = key.expires_at
    ? Date.parse(key.expires_at) <= Date.now()
    : false
  const status = expired ? "expired" : key.disabled ? "disabled" : "enabled"
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    ref,
    displayName: key.name,
    maskedLabel: key.label,
    status,
    fields: [
      { fieldId: field.Name, kind: "text", value: key.name },
      {
        fieldId: field.Workspace,
        kind: "text",
        value: detail.workspaceDisplay,
      },
      { fieldId: field.Creator, kind: "text", value: detail.creatorDisplay },
      { fieldId: field.LimitMode, kind: "text", value: toLimitMode(key.limit) },
      ...(key.limit === null
        ? []
        : [
            { fieldId: field.Limit, kind: "number" as const, value: key.limit },
          ]),
      ...(key.limit_remaining === null
        ? []
        : [
            {
              fieldId: field.LimitRemaining,
              kind: "number" as const,
              value: key.limit_remaining,
            },
          ]),
      {
        fieldId: field.LimitReset,
        kind: "text",
        value: toLimitReset(key.limit_reset),
      },
      { fieldId: field.Disabled, kind: "boolean", value: key.disabled },
      {
        fieldId: field.IncludeByokInLimit,
        kind: "boolean",
        value: key.include_byok_in_limit,
      },
      { fieldId: field.Usage, kind: "number", value: key.usage },
      {
        fieldId: field.UsageDaily,
        kind: "number",
        value: key.usage_daily,
      },
      {
        fieldId: field.UsageWeekly,
        kind: "number",
        value: key.usage_weekly,
      },
      {
        fieldId: field.UsageMonthly,
        kind: "number",
        value: key.usage_monthly,
      },
      { fieldId: field.ByokUsage, kind: "number", value: key.byok_usage },
      {
        fieldId: field.ByokUsageDaily,
        kind: "number",
        value: key.byok_usage_daily,
      },
      {
        fieldId: field.ByokUsageWeekly,
        kind: "number",
        value: key.byok_usage_weekly,
      },
      {
        fieldId: field.ByokUsageMonthly,
        kind: "number",
        value: key.byok_usage_monthly,
      },
      { fieldId: field.CreatedAt, kind: "text", value: key.created_at },
      ...(key.updated_at
        ? [
            {
              fieldId: field.UpdatedAt,
              kind: "text" as const,
              value: key.updated_at,
            },
          ]
        : []),
      ...(key.expires_at
        ? [
            {
              fieldId: field.ExpiresAt,
              kind: "text" as const,
              value: key.expires_at,
            },
          ]
        : []),
    ],
    searchValues: [key.name, key.label, status, detail.workspaceDisplay],
    actions: { canUpdate: true, canDelete: true },
  }
}

const drainWorkspaces = async (
  config: OpenRouterKeyResourceConfig,
  options?: ResourceOperationOptions,
): Promise<readonly OpenRouterWorkspace[]> => {
  const workspaces = new Map<string, OpenRouterWorkspace>()
  for (let offset = 0; offset < PAGE_SIZE * MAX_PAGES; offset += PAGE_SIZE) {
    const page = await fetchOpenRouterWorkspaces(
      requestWithOptions(config, options),
      {
        offset,
        limit: PAGE_SIZE,
      },
    )
    for (const workspace of page) workspaces.set(workspace.id, workspace)
    if (page.length < PAGE_SIZE) break
    if (offset + PAGE_SIZE >= PAGE_SIZE * MAX_PAGES) {
      throw new Error("workspace_pagination_limit")
    }
  }
  workspaces.set(config.defaultWorkspace.id, config.defaultWorkspace)
  const all = [...workspaces.values()]
  for (const workspace of all) {
    config.workspaceNames.set(workspace.id, getWorkspaceDisplayName(workspace))
  }
  return all
}

const drainMembers = async (
  config: OpenRouterKeyResourceConfig,
  workspaceId: string,
  options?: ResourceOperationOptions,
): Promise<readonly OpenRouterWorkspaceMember[]> => {
  const members = new Map<string, OpenRouterWorkspaceMember>()
  for (let offset = 0; offset < PAGE_SIZE * MAX_PAGES; offset += PAGE_SIZE) {
    const page = await fetchOpenRouterWorkspaceMembers(
      requestWithOptions(config, options),
      workspaceId,
      {
        offset,
        limit: PAGE_SIZE,
      },
    )
    for (const member of page) {
      if (member.workspace_id !== workspaceId)
        throw new Error("member_workspace_mismatch")
      members.set(member.user_id, member)
    }
    if (page.length < PAGE_SIZE) break
    if (offset + PAGE_SIZE >= PAGE_SIZE * MAX_PAGES) {
      throw new Error("member_pagination_limit")
    }
  }
  return [...members.values()]
}

const createFields = (scopes: readonly AccountKeyScope[]) => {
  const field = OPENROUTER_KEY_FIELD_IDS
  return [
    { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
    {
      fieldId: field.Workspace,
      type: RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: scopes.map((scope) => ({
        value: scope.scopeKey,
        displayLabel: scope.displayName,
        ...(scope.secondaryLabel
          ? { secondaryLabel: scope.secondaryLabel }
          : {}),
      })),
    },
    {
      fieldId: field.Creator,
      type: RESOURCE_FIELD_TYPES.Select,
      nullable: true,
      options: [],
      optionLoader: { dependsOn: [field.Workspace] },
    },
    {
      fieldId: field.LimitMode,
      type: RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_MODES).map((value) => ({
        value,
      })),
    },
    {
      fieldId: field.Limit,
      type: RESOURCE_FIELD_TYPES.Number,
      nullable: true,
      min: 0,
    },
    {
      fieldId: field.LimitReset,
      type: RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_RESETS).map((value) => ({
        value,
      })),
    },
    {
      fieldId: field.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
    },
    { fieldId: field.IncludeByokInLimit, type: RESOURCE_FIELD_TYPES.Boolean },
  ] as const
}

const editFields = (
  detail: OpenRouterKeyDetail,
  scopes: readonly AccountKeyScope[],
) => {
  const field = OPENROUTER_KEY_FIELD_IDS
  return [
    { fieldId: field.Name, type: RESOURCE_FIELD_TYPES.Text, required: true },
    {
      fieldId: field.Workspace,
      type: RESOURCE_FIELD_TYPES.Select,
      readOnly: true,
      options: scopes.map((scope) => ({
        value: scope.scopeKey,
        displayLabel: scope.displayName,
      })),
    },
    {
      fieldId: field.Creator,
      type: RESOURCE_FIELD_TYPES.Select,
      nullable: true,
      readOnly: true,
      options: detail.key.creator_user_id
        ? [
            {
              value: detail.key.creator_user_id,
              displayLabel: detail.creatorDisplay,
            },
          ]
        : [],
    },
    {
      fieldId: field.LimitMode,
      type: RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_MODES).map((value) => ({
        value,
      })),
    },
    {
      fieldId: field.Limit,
      type: RESOURCE_FIELD_TYPES.Number,
      nullable: true,
      min: 0,
    },
    {
      fieldId: field.LimitReset,
      type: RESOURCE_FIELD_TYPES.Select,
      required: true,
      options: Object.values(OPENROUTER_KEY_LIMIT_RESETS).map((value) => ({
        value,
      })),
    },
    {
      fieldId: field.ExpiresAt,
      type: RESOURCE_FIELD_TYPES.DateTime,
      nullable: true,
      readOnly: true,
    },
    { fieldId: field.Disabled, type: RESOURCE_FIELD_TYPES.Boolean },
    { fieldId: field.IncludeByokInLimit, type: RESOURCE_FIELD_TYPES.Boolean },
  ] as const
}

const toInitialValues = (
  detail: OpenRouterKeyDetail,
): EditableResourceProjection => {
  const key = detail.key
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    [field.Name]: key.name,
    [field.Workspace]: key.workspace_id,
    [field.Creator]: key.creator_user_id,
    [field.LimitMode]: toLimitMode(key.limit),
    [field.Limit]: key.limit,
    [field.LimitReset]: toLimitReset(key.limit_reset),
    [field.ExpiresAt]: key.expires_at ?? null,
    [field.Disabled]: key.disabled,
    [field.IncludeByokInLimit]: key.include_byok_in_limit,
  }
}

/** OpenRouter native key resources use only the documented Management API fields. */
export const openRouterAccountKeyResources = defineAccountKeyResourceCapability(
  {
    siteType: SITE_TYPES.OPENROUTER,
    openConfig: async (input, options) => {
      const request = input.request
      const managementKey = request.auth.accessToken?.trim() ?? ""
      let defaultWorkspace: OpenRouterWorkspace
      try {
        defaultWorkspace = await fetchOpenRouterDefaultWorkspace(
          options?.signal
            ? { ...request, abortSignal: options.signal }
            : request,
        )
      } catch (error) {
        throw new OpenRouterNativeResourceError({
          error,
          secrets: [managementKey],
        })
      }
      const config: OpenRouterKeyResourceConfig = {
        account: input.account,
        request,
        managementKey,
        // The `/workspaces/default` locator is the explicitly accepted fail-closed
        // compatibility assumption; never infer a default workspace from inventory.
        defaultWorkspace,
        workspaceNames: new Map(),
        issuedCursors: new Map(),
        cursorSequence: 0,
      }
      config.workspaceNames.set(
        config.defaultWorkspace.id,
        getWorkspaceDisplayName(config.defaultWorkspace),
      )
      return config
    },
    listScopes: async (config, options) => {
      try {
        const workspaces = await read(config, () =>
          drainWorkspaces(config, options),
        )
        return workspaces
          .map((workspace) =>
            workspaceScope(workspace, config.defaultWorkspace.id),
          )
          .sort(
            (left, right) =>
              Number(right.isDefault) - Number(left.isDefault) ||
              left.displayName.localeCompare(right.displayName),
          )
      } catch (error) {
        if (
          error instanceof OpenRouterNativeResourceError &&
          !isAbortError(error.failure.error, options?.signal)
        ) {
          return [
            workspaceScope(
              config.defaultWorkspace,
              config.defaultWorkspace.id,
              true,
            ),
          ]
        }
        throw error
      }
    },
    defaultScopeKey: (config) => config.defaultWorkspace.id,
    encodeLocator: (hash) => hash,
    decodeLocator: (resourceId) => resourceId,
    locatorFromListItem: (item: OpenRouterKeyDetail) => item.key.hash,
    locatorFromDetail: (detail: OpenRouterKeyDetail) => detail.key.hash,
    list: async (
      config,
      scope,
      query,
      options,
    ): Promise<AccountKeyResourcePage<OpenRouterKeyDetail>> => {
      const requestedLimit = query?.limit ?? PAGE_SIZE
      if (
        !Number.isInteger(requestedLimit) ||
        requestedLimit <= 0 ||
        requestedLimit > PAGE_SIZE
      )
        throw new Error("invalid_limit")
      const cursorState = openCursorChain(config, scope.scopeKey, query?.cursor)
      const offset = cursorState.offset
      const page = await read(
        config,
        () =>
          fetchOpenRouterKeys(requestWithOptions(config, options), {
            workspaceId: scope.scopeKey,
            includeDisabled: true,
            offset,
          }),
        [scope.scopeKey],
      )
      const pageHashes = new Set<string>()
      for (const key of page) {
        assertKeyScope(key, scope)
        if (pageHashes.has(key.hash)) throw new Error("duplicate_hash")
        pageHashes.add(key.hash)
      }
      const itemKeys = page.slice(0, requestedLimit)
      for (const key of itemKeys) {
        if (cursorState.chain.seenHashes.has(key.hash)) {
          throw new Error("duplicate_hash")
        }
      }
      for (const key of itemKeys) cursorState.chain.seenHashes.add(key.hash)
      const items = itemKeys.map((key) => toDetail(config, key, scope))
      const nextOffset = offset + items.length
      const nextCursor =
        (items.length < page.length || page.length === PAGE_SIZE) &&
        items.length > 0
          ? issueCursor(config, nextOffset, cursorState.chain)
          : undefined
      return { items, ...(nextCursor ? { nextCursor } : {}) }
    },
    get: (config, scope, hash, options) =>
      read(
        config,
        async () =>
          toDetail(
            config,
            assertKeyScope(
              await fetchOpenRouterKey(
                requestWithOptions(config, options),
                hash,
              ),
              scope,
            ),
            scope,
          ),
        [hash],
      ),
    toListFacts: (item, ref) => toFacts(item, ref),
    toDetailFacts: (detail, ref) => toFacts(detail, ref),
    createEditor: async (
      config,
      scope,
      options,
    ): Promise<
      AccountKeyResourceEditorDefinition<OpenRouterKeyCreateCommand>
    > => {
      const scopes = await read(config, () =>
        drainWorkspaces(config, options),
      ).catch((error) => {
        if (
          error instanceof OpenRouterNativeResourceError &&
          isAbortError(error.failure.error, options?.signal)
        )
          throw error
        return [config.defaultWorkspace]
      })
      const scopeEntries = scopes
        .map((workspace) =>
          workspaceScope(workspace, config.defaultWorkspace.id),
        )
        .sort(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            left.displayName.localeCompare(right.displayName),
        )
      const knownWorkspaceIds = new Set(
        scopeEntries.map((entry) => entry.scopeKey),
      )
      const field = OPENROUTER_KEY_FIELD_IDS
      return {
        fields: createFields(scopeEntries),
        initialValues: {
          [field.Name]: "",
          [field.Workspace]: scope.scopeKey,
          [field.Creator]: null,
          [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
          [field.Limit]: null,
          [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
          [field.ExpiresAt]: null,
          [field.IncludeByokInLimit]: false,
        },
        validate: (values) =>
          createValidation(values, { create: true, knownWorkspaceIds }),
        loadOptions: async (fieldId, values, loadOptions) => {
          if (fieldId !== field.Creator) return []
          const workspaceId = values[field.Workspace]
          if (
            !isNonBlankString(workspaceId) ||
            !knownWorkspaceIds.has(workspaceId)
          )
            throw new Error("invalid_workspace")
          const members = await read(config, () =>
            drainMembers(config, workspaceId, loadOptions),
          )
          return members.map((member) => ({
            value: member.user_id,
            displayLabel: member.user_id,
            secondaryLabel: member.role,
          }))
        },
        buildCommand: (values) => {
          const limitMode = normalizeLimitMode(values[field.LimitMode])!
          const expiresAt = values[field.ExpiresAt]
          const destinationScope = scopeEntries.find(
            (entry) => entry.scopeKey === values[field.Workspace],
          )!
          return {
            destinationScope,
            input: {
              name: (values[field.Name] as string).trim(),
              limit:
                limitMode === OPENROUTER_KEY_LIMIT_MODES.Unlimited
                  ? null
                  : (values[field.Limit] as number),
              limitReset: toApiLimitReset(
                normalizeLimitReset(values[field.LimitReset])!,
              ),
              includeByokInLimit: values[field.IncludeByokInLimit] as boolean,
              expiresAt:
                expiresAt === null ||
                expiresAt === undefined ||
                expiresAt === ""
                  ? null
                  : normalizeUtcDateTime(expiresAt)!,
              workspaceId: values[field.Workspace] as string,
              creatorUserId:
                values[field.Creator] === null ||
                values[field.Creator] === undefined
                  ? null
                  : (values[field.Creator] as string),
            },
          }
        },
        destinationScopeKey: (command) => command.destinationScope.scopeKey,
      }
    },
    editEditor: (
      _config,
      scope,
      detail,
    ): AccountKeyResourceEditorDefinition<OpenRouterKeyUpdateCommand> => {
      const field = OPENROUTER_KEY_FIELD_IDS
      const scopes = [scope]
      const knownWorkspaceIds = new Set([detail.key.workspace_id])
      return {
        fields: editFields(detail, scopes),
        initialValues: toInitialValues(detail),
        validate: (values) =>
          createValidation(values, { create: false, knownWorkspaceIds }),
        buildCommand: (values) => {
          const current = detail.key
          const limitMode = normalizeLimitMode(values[field.LimitMode])!
          const targetLimit =
            limitMode === OPENROUTER_KEY_LIMIT_MODES.Unlimited
              ? null
              : (values[field.Limit] as number)
          const targetLimitReset = toApiLimitReset(
            normalizeLimitReset(values[field.LimitReset])!,
          )
          const requested: Partial<OpenRouterUpdateKeyInput> = {}
          if ((values[field.Name] as string).trim() !== current.name)
            requested.name = (values[field.Name] as string).trim()
          if (values[field.Disabled] !== current.disabled)
            requested.disabled = values[field.Disabled] as boolean
          if (targetLimit !== current.limit) requested.limit = targetLimit
          if (targetLimitReset !== current.limit_reset)
            requested.limitReset = targetLimitReset
          if (
            values[field.IncludeByokInLimit] !== current.include_byok_in_limit
          )
            requested.includeByokInLimit = values[
              field.IncludeByokInLimit
            ] as boolean
          return { input: requested, requested }
        },
      }
    },
    create: async (config, _scope, command, options) => {
      try {
        // OpenRouter only returns plaintext `key` in this POST response; do not retry a lost acknowledgement.
        const created = await createOpenRouterKey(
          requestWithOptions(config, options),
          command.input,
        )
        const detail = toDetail(
          config,
          assertKeyScope(created.key, command.destinationScope),
          command.destinationScope,
        )
        const ref = {
          accountId: config.account.id,
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: command.destinationScope.scopeKey,
          resourceId: created.key.hash,
        }
        return {
          certainty: "applied" as const,
          value: {
            detail,
            scopeKey: command.destinationScope.scopeKey,
            createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
              ref,
              displayName: created.key.name,
              secret: created.plaintextKey,
              credential: {
                accountName: config.account.name ?? "OpenRouter",
                apiType: API_TYPES.OPENAI_COMPATIBLE,
                baseUrl: OPENROUTER_API_BASE_URL,
                siteType: SITE_TYPES.OPENROUTER,
                tagIds: [],
              },
            }),
          },
        }
      } catch (error) {
        return mutationFailure(error, config)
      }
    },
    update: async (config, scope, detail, command, options) => {
      if (Object.keys(command.input).length === 0)
        return { certainty: "applied" as const, value: detail }
      try {
        return {
          certainty: "applied" as const,
          value: toDetail(
            config,
            assertKeyScope(
              await updateOpenRouterKey(
                requestWithOptions(config, options),
                detail.key.hash,
                command.input,
              ),
              scope,
            ),
            scope,
          ),
        }
      } catch (error) {
        if (isKnownRejection(error)) {
          return mutationFailure(error, config, [detail.key.hash])
        }
        if (isUnreconciledMutationFailure(error)) {
          return { certainty: "possibly-applied" as const }
        }
        try {
          const current = toDetail(
            config,
            assertKeyScope(
              await fetchOpenRouterKey(
                requestWithOptions(config, options),
                detail.key.hash,
              ),
              scope,
            ),
            scope,
          )
          const matches =
            (command.requested.name === undefined ||
              current.key.name === command.requested.name) &&
            (command.requested.disabled === undefined ||
              current.key.disabled === command.requested.disabled) &&
            (command.requested.limit === undefined ||
              current.key.limit === command.requested.limit) &&
            (command.requested.limitReset === undefined ||
              current.key.limit_reset === command.requested.limitReset) &&
            (command.requested.includeByokInLimit === undefined ||
              current.key.include_byok_in_limit ===
                command.requested.includeByokInLimit)
          return matches
            ? { certainty: "applied" as const, value: current }
            : { certainty: "possibly-applied" as const }
        } catch {
          return { certainty: "possibly-applied" as const }
        }
      }
    },
    delete: async (config, scope, hash, options) => {
      await read(
        config,
        async () =>
          assertKeyCorrelation(
            await fetchOpenRouterKey(requestWithOptions(config, options), hash),
            scope,
            hash,
          ),
        [hash],
      )
      try {
        await deleteOpenRouterKey(requestWithOptions(config, options), hash)
        return { certainty: "applied" as const, value: undefined }
      } catch (error) {
        if (isKnownRejection(error)) {
          return mutationFailure(error, config, [hash])
        }
        if (isUnreconciledMutationFailure(error)) {
          return { certainty: "possibly-applied" as const }
        }
        try {
          await fetchOpenRouterKey(requestWithOptions(config, options), hash)
          return { certainty: "possibly-applied" as const }
        } catch (readError) {
          if (getStructuredStatus(readError) === 404)
            return { certainty: "applied" as const, value: undefined }
          return { certainty: "possibly-applied" as const }
        }
      }
    },
    mapFailure,
  },
)
