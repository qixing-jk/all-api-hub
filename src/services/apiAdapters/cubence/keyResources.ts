import { SITE_TYPES } from "~/constants/siteType"
import { CUBENCE_API_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  AccountKeyResourceError,
  type AccountKeyResourceFacts,
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

import { createCubenceKeyEditor } from "./keyEditor"

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
): AccountKeyResourceFacts => ({
  ref,
  displayName: key.name,
  maskedLabel: maskSecretForDisplay(key.key),
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
    {
      fieldId: "quota",
      kind: "money",
      role: "total",
      amountUsd: Math.max(0, key.quota_limit) / CUBENCE_UNITS_PER_USD,
      unlimited: key.quota_limit === -1,
    },
    {
      fieldId: "used",
      kind: "money",
      role: "used",
      amountUsd: key.quota_used / CUBENCE_UNITS_PER_USD,
    },
    {
      fieldId: "group",
      kind: "group",
      value: String(key.share_group_id),
      emptyValue: "ungrouped",
    },
  ],
  actions: { canUpdate: true, canDelete: true },
})

export const cubenceKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.CUBENCE,
  inventorySecretAvailability: "recoverable",
  defaultCreation: "requires-input",
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
        return { kind: "unavailable", failure: { code: "unavailable" } }
      return { kind: "resolved", secret: key.key }
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
  update: (config, _scope, detail, command, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: (request) => updateKey(request, detail, command),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        error instanceof AccountKeyResourceError &&
        error.failure.code === "resource_changed"
          ? "not-applied"
          : undefined,
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: (request) => deleteKey(request, id),
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
