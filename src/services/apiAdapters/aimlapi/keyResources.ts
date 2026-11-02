import { SITE_TYPES } from "~/constants/siteType"
import {
  isProviderConfirmedAccountCredential,
  resolveAccountCredentialIdentity,
  type AccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentity"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import {
  AIMLAPI_API_BASE_URL,
  AIMLAPI_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyDisplayFact,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { AIMLAPI_KEY_LIMIT_PERIODS } from "~/services/apiService/aimlapi/constants"
import {
  createAimlApiKey,
  deleteAimlApiKey,
  fetchAimlApiKey,
  fetchAimlApiKeys,
  fetchAimlApiLatestKey,
  updateAimlApiKey,
  type AimlApiKey,
} from "~/services/apiService/aimlapi/keys"
import { ensureAimlApiKey } from "~/services/apiService/aimlapi/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import {
  createAimlApiKeyEditor,
  type AimlApiKeyCommand,
  type AimlApiKeyStatusCommand,
} from "./keyEditor"
import { AIMLAPI_KEY_FACT_FIELDS as factFields } from "./keyResourceFields"

const ACCOUNT_SCOPE_KEY = "account"
type AimlApiKeyRow = AimlApiKey & {
  savedRuntimeSecret?: string
  accountCredentialIdentity?: AccountCredentialIdentity
}

/** Correlates the saved inference credential using the provider's self endpoint. */
async function readSavedRuntimeKey(request: ApiServiceRequest) {
  const secret = await ensureAimlApiKey(request)
  if (!secret) return undefined
  try {
    const self = await fetchAimlApiLatestKey({
      ...request,
      auth: { ...request.auth, accessToken: secret },
    })
    return { prefix: self.prefix, secret }
  } catch {
    // An unavailable/revoked supplemental key must not hide the management inventory.
    return undefined
  }
}

/** Uses the same provider-identity rules as Requesty's self-resource projection. */
function toRow(
  key: AimlApiKey,
  saved: Awaited<ReturnType<typeof readSavedRuntimeKey>>,
): AimlApiKeyRow {
  const identity = resolveAccountCredentialIdentity({
    resourceIdentity: {
      resourceId: key.prefix,
      credentialResourceId: saved?.prefix ?? null,
    },
  })
  return {
    ...key,
    ...(isProviderConfirmedAccountCredential(identity) && saved
      ? {
          savedRuntimeSecret: saved.secret,
          accountCredentialIdentity: identity,
        }
      : {}),
  }
}

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
): ApiServiceRequest => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

/** Provider budget windows start at UTC midnight; unknown/misaligned starts cannot prove a reset time. */
function nextBudgetResetAt(
  limit: NonNullable<AimlApiKey["limit"]>,
): string | undefined {
  if (!limit.windowStart) return undefined
  const date = new Date(limit.windowStart)
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCHours() !== 0 ||
    date.getUTCMinutes() !== 0 ||
    date.getUTCSeconds() !== 0 ||
    date.getUTCMilliseconds() !== 0
  )
    return undefined
  switch (limit.retention) {
    case AIMLAPI_KEY_LIMIT_PERIODS.Day:
      date.setUTCDate(date.getUTCDate() + 1)
      break
    case AIMLAPI_KEY_LIMIT_PERIODS.Week:
      if (date.getUTCDay() !== 1) return undefined
      date.setUTCDate(date.getUTCDate() + 7)
      break
    case AIMLAPI_KEY_LIMIT_PERIODS.Month:
      if (date.getUTCDate() !== 1) return undefined
      date.setUTCMonth(date.getUTCMonth() + 1)
      break
    default:
      return undefined
  }
  return date.toISOString()
}

/** Publish observed counters only; a configured ceiling cannot establish remaining funds. */
function budgetFacts(limit: AimlApiKey["limit"]): AccountKeyDisplayFact[] {
  if (!limit) return []
  const retention = limit.retention
  if (
    retention !== null &&
    retention !== AIMLAPI_KEY_LIMIT_PERIODS.Never &&
    limit.spentUsd !== undefined &&
    limit.remainingUsd !== undefined
  ) {
    const nextResetAt = nextBudgetResetAt(limit)
    return [
      {
        fieldId: factFields.Limit,
        kind: "budget",
        window: retention,
        limitUsd: limit.thresholdUsd,
        usedUsd: limit.spentUsd,
        remainingUsd: limit.remainingUsd,
        reservedUsd: 0,
        ...(nextResetAt ? { nextResetAt } : {}),
      },
    ]
  }
  return [
    {
      fieldId: factFields.Limit,
      kind: "spend-budget",
      source: "custom",
      period:
        limit.retention === AIMLAPI_KEY_LIMIT_PERIODS.Day
          ? "daily"
          : limit.retention === AIMLAPI_KEY_LIMIT_PERIODS.Week
            ? "weekly"
            : limit.retention === AIMLAPI_KEY_LIMIT_PERIODS.Month
              ? "monthly"
              : "none",
      limitUsd: limit.thresholdUsd,
      ...(limit.spentUsd === undefined ? {} : { usedUsd: limit.spentUsd }),
    },
    ...(limit.spentUsd === undefined && limit.remainingUsd !== undefined
      ? [
          {
            fieldId: factFields.Remaining,
            kind: "money" as const,
            role: "remaining" as const,
            amountUsd: limit.remainingUsd,
          },
        ]
      : []),
  ]
}

/**
 * Projects one native key.
 *
 * The list omits the secret entirely — plaintext exists only in the create
 * response. Only a row confirmed by the saved regular credential's self
 * endpoint can expose that already-retained local secret; other rows remain
 * non-recoverable. No management credential is substituted for a regular key.
 */
const facts = (
  key: AimlApiKeyRow,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => {
  const expiry = key.expiresAt ? normalizeToMs(key.expiresAt) : null
  const createdAt = normalizeToMs(key.createdAt)
  const expired = expiry !== null && expiry <= Date.now()
  return {
    ref,
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayName: key.name?.trim() || key.prefix,
    maskedLabel: maskSecretForDisplay(`${key.prefix}${"0".repeat(24)}`),
    runtimeSecret: key.savedRuntimeSecret,
    ...(key.accountCredentialIdentity
      ? { accountCredentialIdentity: key.accountCredentialIdentity }
      : {}),
    status: expired
      ? statuses.Expired
      : key.disabled
        ? statuses.Disabled
        : statuses.Enabled,
    runtimeKey: {
      modelAccess: {
        groups: [],
        allowedModelIds: key.allowedModels ? [...key.allowedModels] : null,
        suggestedModelIds: [],
      },
      baseUrl: `${AIMLAPI_API_BASE_URL}/v1`,
      ...(createdAt !== null ? { createdAt } : {}),
    },
    fields: [],
    displayFacts: [
      ...budgetFacts(key.limit),
      ...(key.monthlyUsageUsd > 0
        ? [
            {
              fieldId: factFields.MonthlyUsage,
              kind: "money" as const,
              role: "used" as const,
              amountUsd: key.monthlyUsageUsd,
            },
          ]
        : []),
      {
        fieldId: factFields.Expiry,
        kind: "expiry" as const,
        timestampMs: expiry ?? null,
      },
      ...(key.scopes
        ? [
            {
              fieldId: factFields.Scopes,
              kind: "restriction" as const,
              role: "models" as const,
              value: [...key.scopes],
            },
          ]
        : []),
      ...(key.allowedModels
        ? [
            {
              fieldId: factFields.Models,
              kind: "restriction" as const,
              role: "models" as const,
              value: [...key.allowedModels],
            },
          ]
        : []),
      ...(key.allowedTools?.length
        ? [
            {
              fieldId: "tools",
              kind: "restriction" as const,
              role: "tools" as const,
              value: [...key.allowedTools],
            },
          ]
        : []),
    ],
    actions: {
      canUpdate: true,
      canDelete: true,
    },
  }
}

/** AI/ML API keys are managed with the account's management key. */
export const aimlApiKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.AIMLAPI,
  statusActions: {
    enable: {
      available: (key) => key.disabled,
      buildCommand: () => ({ disabled: false }),
    },
    disable: {
      available: (key) => !key.disabled,
      buildCommand: () => ({ disabled: true }),
    },
  },
  // PATCH accepts only the changed fields, so the accepted record is a valid
  // baseline and no extra read is needed before a write.
  requiresFreshUpdateDetail: () => false,
  defaultCreation: creationPolicies.EditorDefaults,
  // `POST /v1/keys` is the only response that carries the plaintext secret.
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: AIMLAPI_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (prefix: string) => prefix,
  decodeLocator: (prefix: string) => prefix,
  locatorFromListItem: (key: AimlApiKey) => key.prefix,
  locatorFromDetail: (key: AimlApiKey) => key.prefix,
  list: async (config, _scope, _query, options) => {
    const request = withSignal(config.request, options)
    const [keys, saved] = await Promise.all([
      fetchAimlApiKeys(request),
      readSavedRuntimeKey(request),
    ])
    const items = keys.map((key) => toRow(key, saved))
    return { items, total: items.length }
  },
  get: async (config, _scope, prefix, options) => {
    const request = withSignal(config.request, options)
    const [key, saved] = await Promise.all([
      fetchAimlApiKey(request, prefix),
      readSavedRuntimeKey(request),
    ])
    return toRow(key, saved)
  },
  toListFacts: facts,
  toDetailFacts: facts,
  createEditor: async (config, _scope, _options, _inventory, intent) =>
    createAimlApiKeyEditor({
      nameHint: intent?.nameHint,
      request: config.request,
    }),
  editEditor: (config, _scope, detail) =>
    createAimlApiKeyEditor({ detail, request: config.request }),
  create: (config, scope, command: AimlApiKeyCommand, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const created = await createAimlApiKey(request, {
          name: command.name,
          limit: command.limit,
          scopes: command.scopes,
          expiresAt: command.expiresAt ?? null,
          allowedModels: command.allowedModels,
          allowedTools: command.allowedTools,
        })
        const ref: AccountKeyResourceRef = {
          accountId: config.account.id,
          siteType: SITE_TYPES.AIMLAPI,
          scopeKey: scope.scopeKey,
          resourceId: created.prefix,
        }
        return {
          detail: created,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref,
            displayName: created.name?.trim() || created.prefix,
            secret: created.key,
            credential: {
              accountName: config.account.name ?? AIMLAPI_DISPLAY_NAME,
              apiType: API_TYPES.OPENAI_COMPATIBLE,
              baseUrl: toProtocolRoot(
                API_TYPES.OPENAI_COMPATIBLE,
                `${AIMLAPI_API_BASE_URL}/v1`,
              )!,
              tagIds: [],
            },
          }),
        }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (
    config,
    _scope,
    { current },
    command: AimlApiKeyCommand | AimlApiKeyStatusCommand,
    options,
  ) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        // `expires_at` is intentionally absent: the route ignores it, so an
        // edited key keeps the expiry it was created with.
        return await updateAimlApiKey(request, current.prefix, {
          ...("name" in command
            ? {
                name: command.name,
                limit: command.limit,
                scopes: command.scopes,
                allowedModels: command.allowedModels,
                allowedTools: command.allowedTools,
              }
            : {}),
          ...(command.disabled !== undefined
            ? { disabled: command.disabled }
            : {}),
        })
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  delete: (config, _scope, prefix, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await deleteAimlApiKey(request, prefix)
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
