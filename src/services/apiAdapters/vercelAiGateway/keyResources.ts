import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import {
  VERCEL_AI_GATEWAY_API_BASE_URL,
  VERCEL_AI_GATEWAY_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import {
  fetchVercelKeyBudgets,
  updateVercelKeyBudget,
} from "~/services/apiService/vercelAiGateway/budgets"
import { VERCEL_TEAM_ROLES } from "~/services/apiService/vercelAiGateway/constants"
import { fetchVercelTeams } from "~/services/apiService/vercelAiGateway/identity"
import {
  createVercelAiGatewayKey,
  deleteVercelAiGatewayKey,
  getVercelAiGatewayKey,
  listVercelAiGatewayKeys,
  updateVercelKeyAttribution,
  VERCEL_KEY_SPEND_ATTRIBUTIONS,
  type VercelAiGatewayKey,
  type VercelKeyBudget,
  type VercelKeyBudgetInput,
} from "~/services/apiService/vercelAiGateway/keys"
import { API_TYPES } from "~/services/verification/aiApiVerification"

import {
  createVercelKeyEditor,
  vercelKeyFields,
  type VercelKeyCommand,
} from "./keyEditor"

/**
 * Keys are team-scoped, so the account's own team id is the only scope. It is
 * the saved account identity (`auth.userId`), not a separate selector: the
 * console itself only offers per-team pages.
 */
const ACCOUNT_SCOPE_KEY = "account"

/** Usage counters can change while an editor is open; only configuration conflicts. */
const budgetConfiguration = (budget: VercelKeyBudget | null | undefined) =>
  budget
    ? {
        limitAmount: budget.limitAmount,
        refreshPeriod: budget.refreshPeriod,
        alertThresholds: budget.alertThresholds,
        active: budget.active,
        archived: budget.archived,
        includeByokInQuota: budget.includeByokInQuota,
      }
    : null

/** Compare only editable fields, both before a patch and after its readback. */
const matchesBudgetInput = (
  budget: VercelKeyBudget | null | undefined,
  input: VercelKeyBudgetInput,
): boolean =>
  budget?.limitAmount === input.limitAmount &&
  budget?.refreshPeriod === input.refreshPeriod &&
  JSON.stringify(budget?.alertThresholds) ===
    JSON.stringify(input.alertThresholds)

/** Missing custom configuration inherits the independently read team default. */
const withBudgetSnapshot = (
  key: VercelAiGatewayKey,
  snapshot: Awaited<ReturnType<typeof fetchVercelKeyBudgets>>,
  budgetKeyId = key.id,
): VercelAiGatewayKey => ({
  ...key,
  budget: snapshot.budgets.get(budgetKeyId) ?? null,
  defaultBudget: snapshot.defaultBudget,
})

/** Forwards an abort signal only when the caller supplied one. */
const withSignal = (options?: { signal?: AbortSignal }) =>
  options?.signal ? { signal: options.signal } : undefined

const readTeamId = (userId: unknown): string => {
  const teamId = typeof userId === "string" ? userId.trim() : ""
  if (!teamId) {
    throw new AccountKeyResourceError({
      code: failures.AuthenticationFailed,
    })
  }
  return teamId
}

const canSetAttribution = async (config: {
  request: Parameters<typeof fetchVercelTeams>[0]
  teamId: string
}) => {
  const teams = await fetchVercelTeams(config.request)
  const team = teams.find((team) => team.id === config.teamId)
  return (
    team?.role === VERCEL_TEAM_ROLES.Owner ||
    team?.roles?.includes(VERCEL_TEAM_ROLES.AiGatewayBudgetManager) === true
  )
}

const findKey = async (
  config: {
    request: Parameters<typeof listVercelAiGatewayKeys>[0]
    teamId: string
  },
  id: string,
  options?: { signal?: AbortSignal },
) => {
  const key = await getVercelAiGatewayKey(
    config.request,
    config.teamId,
    id,
    withSignal(options),
  )
  const snapshot = await fetchVercelKeyBudgets(
    config.request,
    config.teamId,
    options,
  )
  return withBudgetSnapshot(key, snapshot, id)
}

/**
 * `activeAt` is the OpenAPI-documented "most recently used" timestamp: it
 * equals `createdAt` for a never-used key and never signals deactivation, so
 * it must not be read as an enabled flag. Deactivation has no inventory field;
 * only a leak or a passed expiry proves a non-usable key.
 */
const keyStatus = (key: VercelAiGatewayKey) => {
  if (key.expiresAt !== null && key.expiresAt <= Date.now())
    return statuses.Expired
  if (key.leakedAt !== null) return statuses.Disabled
  return statuses.Enabled
}

const lastUsedFact = (key: VercelAiGatewayKey) =>
  key.activeAt > key.createdAt
    ? [
        {
          fieldId: "accessed_time",
          kind: "last-used" as const,
          timestampMs: key.activeAt,
        },
      ]
    : []

const facts = (
  key: VercelAiGatewayKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => {
  const effectiveBudget = key.budget ?? key.defaultBudget
  return {
    ref,
    displayName: key.name || `Key ${key.partialKey}`,
    // Vercel only ever exposes the last six characters of the secret, so the
    // masked label is built from that suffix rather than from a full key.
    maskedLabel: `vck_${"•".repeat(8)}${key.partialKey}`,
    runtimeSecret: undefined,
    status: keyStatus(key),
    runtimeKey: {
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      baseUrl: VERCEL_AI_GATEWAY_API_BASE_URL,
      createdAt: key.createdAt,
    },
    fields: [],
    displayFacts: [
      ...lastUsedFact(key),
      keyExpiryDisplayFact(vercelKeyFields.ExpiresAt, key.expiresAt ?? 0),
      {
        fieldId: "spend_budget",
        kind: "spend-budget",
        source:
          key.budget === undefined
            ? "unavailable"
            : key.budget
              ? "custom"
              : key.defaultBudget
                ? "inherited"
                : "none",
        ...(effectiveBudget
          ? {
              limitUsd: effectiveBudget.limitAmount,
              period: effectiveBudget.refreshPeriod,
            }
          : {}),
        ...(key.budget
          ? { usedUsd: key.budget.currentSpend, active: key.budget.active }
          : {}),
      },
      ...(key.spendAttribution
        ? [
            {
              fieldId: vercelKeyFields.SpendAttribution,
              // Spend attribution is billing metadata, not a model-access group.
              kind: "attribution" as const,
              value: key.spendAttribution,
            },
          ]
        : []),
    ],
    searchValues: [key.name, key.partialKey],
    actions: {
      // Native edits cover budget and attribution; name and expiry are immutable.
      canUpdate: true,
      canDelete: true,
    },
  }
}

export const vercelAiGatewayKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
  // Refresh budget configuration and metadata before applying a patch.
  requiresFreshUpdateDetail: () => true,
  // The create response is the only place the plaintext secret appears.
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => ({
    ...input,
    teamId: readTeamId(input.request.auth.userId),
  }),
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: VERCEL_AI_GATEWAY_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: VercelAiGatewayKey) => key.id,
  locatorFromDetail: (key: VercelAiGatewayKey) => key.id,
  list: async (config, _scope, _query, options) => {
    const items = await listVercelAiGatewayKeys(
      config.request,
      config.teamId,
      withSignal(options),
    )
    const snapshot = await fetchVercelKeyBudgets(
      config.request,
      config.teamId,
      options,
    ).catch(() => null)
    return {
      items: snapshot
        ? items.map((key) => withBudgetSnapshot(key, snapshot))
        : items,
      total: items.length,
    }
  },
  get: (config, _scope, id, options) => findKey(config, id, options),
  toListFacts: facts,
  toDetailFacts: facts,
  // A created key's secret is shown once; later reads only expose the suffix.
  runtimeKey: {
    resolve: async () => ({
      kind: "unavailable",
      failure: { code: failures.Unavailable },
    }),
  },
  createEditor: async (config, _scope, _options, _inventory, intent) =>
    createVercelKeyEditor(intent, {
      canSetAttribution: await canSetAttribution(config).catch(() => false),
    }),
  getEditDetail: async (config, _scope, id, options) => ({
    ...(await findKey(config, id, options)),
    canSetAttribution: await canSetAttribution(config),
  }),
  editEditor: (_config, _scope, key) =>
    createVercelKeyEditor(undefined, {
      key,
      canSetAttribution:
        "canSetAttribution" in key && key.canSetAttribution === true,
    }),
  create: (config, scope, command: VercelKeyCommand, options) =>
    runNativeResourceMutation({
      request: config.request,
      execute: async (request) => {
        const created = await createVercelAiGatewayKey(
          request,
          config.teamId,
          command,
          withSignal(options),
        )
        const ref = {
          accountId: config.account.id,
          siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
          scopeKey: scope.scopeKey,
          resourceId: created.key.id,
        }
        // Keep one-time delivery available even if the independent budget read fails.
        const snapshot = await fetchVercelKeyBudgets(
          request,
          config.teamId,
          options,
        ).catch(() => null)
        return {
          detail: snapshot
            ? withBudgetSnapshot(created.key, snapshot)
            : created.key,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref,
            displayName: created.key.name,
            secret: created.secret,
            credential: {
              accountName:
                config.account.name ?? VERCEL_AI_GATEWAY_DISPLAY_NAME,
              apiType: API_TYPES.OPENAI_COMPATIBLE,
              baseUrl: VERCEL_AI_GATEWAY_API_BASE_URL,
              siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
              tagIds: [],
            },
          }),
        }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (config, _scope, state, command: VercelKeyCommand, options) =>
    runNativeResourceMutation({
      request: config.request,
      execute: async (request) => {
        const { baseline, current } = state
        const oldBudget = baseline.budget
        const changedBudget = command.removeBudget
          ? !!oldBudget
          : !!command.aiGatewayQuota &&
            !matchesBudgetInput(oldBudget, command.aiGatewayQuota)
        const changedAttribution =
          command.spendAttribution !== undefined &&
          command.spendAttribution !==
            (baseline.spendAttribution ?? VERCEL_KEY_SPEND_ATTRIBUTIONS.Team)
        if (
          (changedBudget &&
            JSON.stringify(budgetConfiguration(baseline.budget)) !==
              JSON.stringify(budgetConfiguration(current.budget))) ||
          (changedAttribution &&
            baseline.spendAttribution !== current.spendAttribution)
        )
          throw new AccountKeyResourceError({ code: failures.ResourceChanged })
        if (changedAttribution) {
          if (!(await canSetAttribution(config)))
            throw new AccountKeyResourceError({
              code: failures.PermissionDenied,
            })
          await updateVercelKeyAttribution(
            request,
            config.teamId,
            current,
            command.spendAttribution!,
            options,
          )
        }
        if (changedBudget)
          await updateVercelKeyBudget(
            request,
            config.teamId,
            current.id,
            command.removeBudget ? { archived: true } : command.aiGatewayQuota!,
            options,
          )
        if (!changedBudget && !changedAttribution) return current
        const confirmed = await findKey(
          { ...config, request },
          current.id,
          options,
        )
        if (
          (changedAttribution &&
            confirmed.spendAttribution !== command.spendAttribution) ||
          (changedBudget &&
            (command.removeBudget
              ? confirmed.budget !== null
              : !matchesBudgetInput(confirmed.budget, command.aiGatewayQuota!)))
        )
          throw new Error("vercel_key_update_not_confirmed")
        return confirmed
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: config.request,
      execute: (request) =>
        deleteVercelAiGatewayKey(
          request,
          config.teamId,
          id,
          withSignal(options),
        ),
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
