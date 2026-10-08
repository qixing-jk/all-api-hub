import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  ACCOUNT_KEY_RESOURCE_FIELD_ISSUE_CODES,
  type AccountKeyCreationIntent,
  type AccountKeyScope,
  type EditableResourceProjection,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  type OpenRouterCreateKeyInput,
  type OpenRouterKeyInfo,
  type OpenRouterUpdateKeyInput,
  type OpenRouterWorkspaceMember,
} from "~/services/apiService/openrouter"
import { t } from "~/utils/i18n/core"

import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
  OPENROUTER_KEY_LIMIT_RESETS,
  type OpenRouterKeyLimitMode,
  type OpenRouterKeyLimitReset,
} from "./keyResourceFields"

export type OpenRouterKeyDetail = {
  readonly key: OpenRouterKeyInfo
  readonly workspaceDisplay: string
  readonly creatorDisplay: string
}

export type OpenRouterKeyCreateCommand = {
  readonly input: OpenRouterCreateKeyInput
  readonly destinationScope: AccountKeyScope
}

export type OpenRouterKeyUpdateCommand = {
  readonly input: OpenRouterUpdateKeyInput
  readonly requested: Readonly<Partial<OpenRouterUpdateKeyInput>>
}

const CURRENT_CREATOR_OPTION_VALUE = "creator-current"
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

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

export const toLimitMode = (limit: number | null): OpenRouterKeyLimitMode =>
  limit === null
    ? OPENROUTER_KEY_LIMIT_MODES.Unlimited
    : OPENROUTER_KEY_LIMIT_MODES.Limited

export const toLimitReset = (value: string | null): OpenRouterKeyLimitReset =>
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
  options: {
    create: boolean
    knownWorkspaceIds: ReadonlySet<string>
    knownCreatorValues?: ReadonlySet<string>
  },
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
  if (
    creator !== null &&
    creator !== undefined &&
    (!isNonBlankString(creator) ||
      (options.knownCreatorValues !== undefined &&
        !options.knownCreatorValues.has(creator)))
  ) {
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
              value: CURRENT_CREATOR_OPTION_VALUE,
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
    [field.Creator]: key.creator_user_id ? CURRENT_CREATOR_OPTION_VALUE : null,
    [field.LimitMode]: toLimitMode(key.limit),
    [field.Limit]: key.limit,
    [field.LimitReset]: toLimitReset(key.limit_reset),
    [field.ExpiresAt]: key.expires_at ?? null,
    [field.Disabled]: key.disabled,
    [field.IncludeByokInLimit]: key.include_byok_in_limit,
  }
}

/** Native create fields, defaults and validation shared with local fixture sessions. */
export function createOpenRouterKeyEditorProjection(
  scope: AccountKeyScope,
  scopes: readonly AccountKeyScope[],
  intent?: AccountKeyCreationIntent,
  knownCreatorValues: () => ReadonlySet<string> = () => new Set(),
) {
  const field = OPENROUTER_KEY_FIELD_IDS
  const knownWorkspaceIds = new Set(scopes.map((entry) => entry.scopeKey))
  return {
    fields: createFields(scopes),
    initialValues: {
      [field.Name]: intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
      [field.Workspace]: scope.scopeKey,
      [field.Creator]: null,
      [field.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
      [field.Limit]: null,
      [field.LimitReset]: OPENROUTER_KEY_LIMIT_RESETS.None,
      [field.ExpiresAt]: null,
      [field.IncludeByokInLimit]: false,
    },
    validate: (values: EditableResourceProjection) =>
      createValidation(values, {
        create: true,
        knownWorkspaceIds,
        knownCreatorValues: knownCreatorValues(),
      }),
  }
}

/** Keeps creator identities private to the editor session and correlates them with workspace choices. */
export function createOpenRouterKeyEditorSession({
  scope,
  scopeEntries,
  intent,
  loadMembers,
}: {
  scope: AccountKeyScope
  scopeEntries: readonly AccountKeyScope[]
  intent?: AccountKeyCreationIntent
  loadMembers: (
    workspaceId: string,
    options?: ResourceOperationOptions,
  ) => Promise<readonly OpenRouterWorkspaceMember[]>
}): AccountKeyResourceEditorDefinition<OpenRouterKeyCreateCommand> {
  const knownWorkspaceIds = new Set(scopeEntries.map((entry) => entry.scopeKey))
  const creatorIdsByOptionValue = new Map<
    string,
    { workspaceId: string; providerUserId: string }
  >()
  const optionValuesByCreator = new Map<string, string>()
  let creatorOptionSequence = 0
  const field = OPENROUTER_KEY_FIELD_IDS
  return {
    ...createOpenRouterKeyEditorProjection(
      scope,
      scopeEntries,
      intent,
      () => new Set(creatorIdsByOptionValue.keys()),
    ),
    loadOptions: async (fieldId, values, loadOptions) => {
      if (fieldId !== field.Creator) return []
      const workspaceId = values[field.Workspace]
      if (!isNonBlankString(workspaceId) || !knownWorkspaceIds.has(workspaceId))
        throw new Error("invalid_workspace")
      const members = await loadMembers(workspaceId, loadOptions)
      return members.map((member) => {
        const creatorKey = `${workspaceId}\u0000${member.id}`
        let optionValue = optionValuesByCreator.get(creatorKey)
        if (!optionValue) {
          optionValue = `creator-option-${++creatorOptionSequence}`
          optionValuesByCreator.set(creatorKey, optionValue)
          creatorIdsByOptionValue.set(optionValue, {
            workspaceId,
            providerUserId: member.user_id,
          })
        }
        return {
          value: optionValue,
          // OpenRouter requires the raw `creator_user_id` on create, but
          // the editor exposes only session-local values because the member
          // endpoint provides no safe human-facing identity.
          displayLabel: t(
            "keyManagement:openRouter.editor.options.creator.unknown",
          ),
          secondaryLabel: member.role,
        }
      })
    },
    buildCommand: (values) => {
      const limitMode = normalizeLimitMode(values[field.LimitMode])!
      const expiresAt = values[field.ExpiresAt]
      const destinationScope = scopeEntries.find(
        (entry) => entry.scopeKey === values[field.Workspace],
      )!
      const creatorOptionValue = values[field.Creator]
      const creator =
        typeof creatorOptionValue === "string"
          ? creatorIdsByOptionValue.get(creatorOptionValue)
          : undefined
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
            expiresAt === null || expiresAt === undefined || expiresAt === ""
              ? null
              : normalizeUtcDateTime(expiresAt)!,
          workspaceId: values[field.Workspace] as string,
          creatorUserId:
            creatorOptionValue === null || creatorOptionValue === undefined
              ? null
              : creator?.workspaceId === destinationScope.scopeKey
                ? creator.providerUserId
                : null,
        },
      }
    },
    destinationScopeKey: (command) => command.destinationScope.scopeKey,
  }
}
/** Projects editable fields and constructs only the changes to the loaded key. */
export function createOpenRouterKeyEditSession(
  scope: AccountKeyScope,
  detail: OpenRouterKeyDetail,
): AccountKeyResourceEditorDefinition<OpenRouterKeyUpdateCommand> {
  const field = OPENROUTER_KEY_FIELD_IDS
  const scopes = [scope]
  const knownWorkspaceIds = new Set([detail.key.workspace_id])
  const knownCreatorValues = new Set(
    detail.key.creator_user_id ? [CURRENT_CREATOR_OPTION_VALUE] : [],
  )
  return {
    fields: editFields(detail, scopes),
    initialValues: toInitialValues(detail),
    validate: (values) =>
      createValidation(values, {
        create: false,
        knownWorkspaceIds,
        knownCreatorValues,
      }),
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
      if (values[field.IncludeByokInLimit] !== current.include_byok_in_limit)
        requested.includeByokInLimit = values[
          field.IncludeByokInLimit
        ] as boolean
      return { input: requested, requested }
    },
  }
}
