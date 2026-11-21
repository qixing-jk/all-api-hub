import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_WINDOW_KINDS,
} from "~/services/amounts/financialConstants"
import {
  keyBudgetFact,
  keyProtocolAmount,
  keyRestrictionScope,
} from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import { classifyResourceChangedMutation } from "~/services/apiAdapters/accountKeyResources/operationErrors"
import {
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_GROUP_EMPTY_VALUES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failureCodes,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { FOXCODE_UNITS_PER_USD } from "~/services/apiService/foxcode"
import { fetchChannels } from "~/services/apiService/foxcode/catalog"
import { FOXCODE_UNLIMITED_QUOTA } from "~/services/apiService/foxcode/constants"
import {
  createKey,
  deleteKey,
  fetchKeyRuntimeContext,
  fetchNativeKeys,
  projectFoxCodeRuntimeKey,
  updateKey,
  type FoxCodeKey,
  type FoxCodeRuntimeContext,
} from "~/services/apiService/foxcode/keys"
import { withFoxCodeSession } from "~/services/apiService/foxcode/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { createFoxCodeKeyEditor } from "./keyEditor"

const ACCOUNT_SCOPE_KEY = "account"

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
) => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})
const requireKey = <T extends { id: string }>(
  keys: readonly T[],
  id: string,
): T => {
  const key = keys.find((key) => key.id === id)
  if (!key) throw new AccountKeyResourceError({ code: failureCodes.NotFound })
  return key
}
// Keep complete native records with their published row refs, including accepted
// create/update results. Weak references release records when those rows leave the UI.
const editorSnapshots = new WeakMap<AccountKeyResourceRef, FoxCodeKey>()

const facts = (
  key: FoxCodeKey,
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => {
  const runtimeGroup = key.canonicalChannelKey ?? key.channelKey
  editorSnapshots.set(ref, structuredClone(key))
  return {
    ref,
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayName: key.name,
    maskedLabel: maskSecretForDisplay(key.key),
    runtimeSecret: key.key,
    status: key.isActive ? statuses.Enabled : statuses.Disabled,
    runtimeKey: {
      modelAccess: {
        groups: runtimeGroup ? [runtimeGroup] : [],
        allowedModelIds: key.modelIds,
        suggestedModelIds: key.modelIds ?? [],
      },
      baseUrl: key.baseUrl,
      createdAt: Date.parse(key.createdAt),
      notes: key.description ?? undefined,
    },
    fields: [],
    displayFacts: [
      keyBudgetFact(ref, context, {
        fieldId: "quota",
        operation: "keys",
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState:
          key.quotaLimit === FOXCODE_UNLIMITED_QUOTA
            ? BUDGET_LIMIT_STATES.Unlimited
            : BUDGET_LIMIT_STATES.Finite,
        limit: keyProtocolAmount(key.quotaLimit, FOXCODE_UNITS_PER_USD),
        used: keyProtocolAmount(key.quotaUsed, FOXCODE_UNITS_PER_USD),
        scope: keyRestrictionScope({
          models:
            key.canonicalChannelKey || key.channelKey === null
              ? key.modelIds
              : undefined,
          groups: runtimeGroup ? [runtimeGroup] : null,
        }),
        window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
      }),
      {
        fieldId: "channel",
        kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Group,
        value: key.channelKey ?? "",
        emptyValue: ACCOUNT_KEY_GROUP_EMPTY_VALUES.Ungrouped,
      },
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

export const foxCodeKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.FOXCODE,
  requiresFreshUpdateDetail: () => false,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: ACCOUNT_KEY_DEFAULT_CREATION_POLICIES.RequiresInput,
  openConfig: async (input) => {
    let runtimeContext: FoxCodeRuntimeContext | undefined
    return {
      ...input,
      readChannels: async (options?: { signal?: AbortSignal }) => {
        options?.signal?.throwIfAborted()
        return (
          runtimeContext?.channels ??
          fetchChannels(withSignal(input.request, options))
        )
      },
      readKeys: (options?: { signal?: AbortSignal }, knownBaseUrl?: string) =>
        withFoxCodeSession(
          withSignal(input.request, options),
          async (request) => {
            const native = await fetchNativeKeys(request)
            const context = !runtimeContext
              ? knownBaseUrl
                ? {
                    channels: await fetchChannels(request),
                    baseUrl: knownBaseUrl,
                  }
                : await fetchKeyRuntimeContext(request)
              : runtimeContext
            runtimeContext = context
            return native.map((key) => projectFoxCodeRuntimeKey(key, context))
          },
        ),
    }
  },
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: "FoxCode",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: FoxCodeKey) => key.id,
  locatorFromDetail: (key: FoxCodeKey) => key.id,
  list: async (config, _scope, _query, options) => {
    const items = await config.readKeys(options)
    return { items, total: items.length }
  },
  get: async (config, _scope, id, options) =>
    requireKey(await config.readKeys(options), id),
  getEditDetail: async (config, _scope, id, options, intent) => {
    options?.signal?.throwIfAborted()
    const snapshot = intent?.snapshot
      ? editorSnapshots.get(intent.snapshot.ref)
      : undefined
    if (snapshot?.id === id) return structuredClone(snapshot)
    return requireKey(
      await config.readKeys(options, intent?.snapshot?.runtimeKey?.baseUrl),
      id,
    )
  },
  toListFacts: facts,
  toDetailFacts: facts,
  runtimeKey: {
    async resolve(config, ref, options) {
      const key = requireKey(
        await fetchNativeKeys(withSignal(config.request, options)),
        ref.resourceId,
      )
      if (!hasUsableApiTokenKey(key.key))
        return {
          kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
          failure: { code: failureCodes.Unavailable },
        }
      return {
        kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved,
        secret: key.key,
      }
    },
  },
  createEditor: async (config, _scope, _options, _inventory, intent) =>
    createFoxCodeKeyEditor(
      (options) => config.readChannels(options),
      undefined,
      intent,
    ),
  editEditor: (config, _scope, key) =>
    createFoxCodeKeyEditor((options) => config.readChannels(options), key),
  create: (config, _scope, command, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => ({
        detail: await createKey(request, {
          name: command.name,
          description: command.description,
          channelKey: command.channelKey,
          quotaLimit: command.quotaLimit,
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
