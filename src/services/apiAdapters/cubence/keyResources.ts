import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { CUBENCE_API_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import {
  keyBudgetFact,
  keyProtocolAmount,
} from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import { classifyResourceChangedMutation } from "~/services/apiAdapters/accountKeyResources/operationErrors"
import {
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { CUBENCE_UNITS_PER_USD } from "~/services/apiService/cubence"
import {
  createKey,
  deleteKey,
  fetchGroups,
  fetchKeys,
  updateKey,
  type CubenceKey,
} from "~/services/apiService/cubence/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { createCubenceKeyEditor, type CubenceKeyCommand } from "./keyEditor"

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
) => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})
const findKey = async (request: ApiServiceRequest, id: string) => {
  const key = (await fetchKeys(request)).find((key) => String(key.id) === id)
  if (!key) throw new AccountKeyResourceError({ code: "not_found" })
  return key
}
const facts = (
  key: CubenceKey,
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: key.name,
  maskedLabel: maskSecretForDisplay(key.key),
  runtimeSecret: key.key,
  status: key.status === "active" ? "enabled" : "disabled",
  runtimeKey: {
    modelAccess: {
      groups: [String(key.share_group_id)],
      allowedModelIds: null,
      suggestedModelIds: [],
    },
    baseUrl: CUBENCE_API_ORIGIN,
  },
  fields: [],
  displayFacts: [
    keyBudgetFact(ref, context, {
      fieldId: "quota",
      operation: "key/list",
      asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
      limitState:
        key.quota_limit === -1
          ? BUDGET_LIMIT_STATES.Unlimited
          : BUDGET_LIMIT_STATES.Finite,
      limit: keyProtocolAmount(key.quota_limit, CUBENCE_UNITS_PER_USD),
      used: keyProtocolAmount(key.quota_used, CUBENCE_UNITS_PER_USD),
      scope: {
        models: { kind: SCOPE_SELECTION_KINDS.All },
        groups: {
          kind: SCOPE_SELECTION_KINDS.Restricted,
          ids: [String(key.share_group_id)],
        },
      },
      window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
    }),
    {
      fieldId: "group",
      kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Group,
      value: String(key.share_group_id),
      emptyValue: "ungrouped",
    },
  ],
  actions: { canUpdate: true, canDelete: true },
})

export const cubenceKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.CUBENCE,
  requiresFreshUpdateDetail: (
    command: CubenceKeyCommand,
    baseline: CubenceKey,
  ) =>
    (["quota_limit", "share_group_id", "status"] as const).some(
      (field) => command[field] !== baseline[field],
    ),
  inventorySecretAvailability: "recoverable",
  defaultCreation: creationPolicies.RequiresInput,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: "account",
      routeKey: "account",
      displayName: "Cubence",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "account",
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: CubenceKey) => String(key.id),
  locatorFromDetail: (key: CubenceKey) => String(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchKeys(withSignal(config.request, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    findKey(withSignal(config.request, options), id),
  toListFacts: facts,
  toDetailFacts: facts,
  runtimeKey: {
    async resolve(config, ref, options) {
      const key = await findKey(
        withSignal(config.request, options),
        ref.resourceId,
      )
      if (!key.key.trim() || /[*•…]/.test(key.key))
        return {
          kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
          failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable },
        }
      return {
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
        secret: key.key,
      }
    },
  },
  createEditor: async (config, _scope, _options, _inventory, intent) =>
    createCubenceKeyEditor(
      (options) => fetchGroups(withSignal(config.request, options)),
      undefined,
      intent,
    ),
  editEditor: (config, _scope, key) =>
    createCubenceKeyEditor(
      (options) => fetchGroups(withSignal(config.request, options)),
      key,
    ),
  create: (config, _scope, command, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => ({
        detail: await createKey(request, {
          name: command.name,
          quota_limit: command.quota_limit,
          share_group_id: command.share_group_id,
        }),
      }),
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (config, _scope, { baseline, current: detail }, command, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: (request) => updateKey(request, baseline, command, detail),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: classifyResourceChangedMutation,
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: (request) => deleteKey(request, id),
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
