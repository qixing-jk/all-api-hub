import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
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
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  ACCOUNT_KEY_RESTRICTION_ROLES,
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  createRelayForToken,
  deleteRelayForToken,
  fetchRelayForTokens,
  rotateRelayForToken,
  updateRelayForToken,
} from "~/services/apiService/relayfor"
import { RELAYFOR_QUOTA_PER_USD } from "~/services/apiService/relayfor/constants"
import { readRelayForStringList as readStringList } from "~/services/apiService/relayfor/parsing"
import type { RelayForToken } from "~/services/apiService/relayfor/type"
import { ApiError } from "~/services/apiTransport/errors"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import { createRelayForKeyEditor, editRelayForKeyEditor } from "./keyEditor"

export { createRelayForKeyEditor, editRelayForKeyEditor } from "./keyEditor"
export type {
  RelayForCreateKeyCommand,
  RelayForEditKeyCommand,
} from "./keyEditor"

const KEY_STATUSES = { Enabled: 1, Disabled: 2 } as const

/** One correlation and credential projection for create and rotation responses. */
const createdSecret = (
  account: AccountKeyResourceOpenInput["account"],
  scopeKey: string,
  token: Pick<RelayForToken, "id" | "name" | "key">,
  baseUrl: string,
) =>
  createAccountKeyResourceCreatedRuntimeSecret({
    ref: {
      accountId: account.id,
      siteType: SITE_TYPES.RELAYFOR,
      scopeKey,
      resourceId: String(token.id),
    },
    displayName: token.name,
    secret: token.key,
    credential: {
      accountName: account.name ?? "RelayFor",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: toProtocolRoot(API_TYPES.OPENAI_COMPATIBLE, baseUrl)!,
      tagIds: [],
    },
  })

const facts = (
  token: RelayForToken,
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => {
  const isEnabled = token.status === KEY_STATUSES.Enabled
  const scope = keyRestrictionScope({
    models:
      token.model_limits === undefined
        ? undefined
        : token.model_limits?.length
          ? token.model_limits
          : null,
  })
  return {
    ref,
    displayName: token.name,
    maskedLabel: maskSecretForDisplay(token.key),
    status: isEnabled
      ? ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
      : ACCOUNT_KEY_RESOURCE_STATUSES.Disabled,
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayFacts: [
      keyBudgetFact(ref, context, {
        fieldId: "remain_quota",
        operation: "tokens/quota",
        scope,
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState: token.unlimited_quota
          ? BUDGET_LIMIT_STATES.Unlimited
          : token.remain_quota < 0
            ? BUDGET_LIMIT_STATES.Inherited
            : BUDGET_LIMIT_STATES.Finite,
        remaining:
          token.remain_quota < 0
            ? undefined
            : keyProtocolAmount(token.remain_quota, RELAYFOR_QUOTA_PER_USD),
        used: keyProtocolAmount(token.used_quota, RELAYFOR_QUOTA_PER_USD),
        window: { kind: BUDGET_WINDOW_KINDS.Lifetime },
      }),
      keyExpiryDisplayFact("expired_at", token.expired_at ?? ""),
      {
        fieldId: "model_limits",
        kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction,
        role: ACCOUNT_KEY_RESTRICTION_ROLES.Models,
        value: token.model_limits ?? [],
      },
      {
        fieldId: "ip_limits",
        kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction,
        role: ACCOUNT_KEY_RESTRICTION_ROLES.Ip,
        value: readStringList(token.ip_limits),
      },
      {
        fieldId: "access_limits",
        kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.RateLimit,
        rpm: token.limits?.requests_per_minute ?? 0,
        concurrency: token.limits?.concurrent_requests ?? 0,
      },
      ...(token.budget_usage ?? []).map((item) =>
        keyBudgetFact(ref, context, {
          fieldId: `budget_${item.window}`,
          operation: `tokens/budget-usage/${item.window}`,
          scope,
          asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
          limitState: BUDGET_LIMIT_STATES.Finite,
          window:
            item.next_reset_at &&
            Number.isFinite(Date.parse(item.next_reset_at))
              ? {
                  kind: BUDGET_WINDOW_KINDS.Periodic,
                  period: item.window,
                  resetsAt: Date.parse(item.next_reset_at),
                }
              : { kind: BUDGET_WINDOW_KINDS.Unknown, period: item.window },
          limit: keyProtocolAmount(item.limit, RELAYFOR_QUOTA_PER_USD),
          used: keyProtocolAmount(item.used, RELAYFOR_QUOTA_PER_USD),
          remaining: keyProtocolAmount(item.remaining, RELAYFOR_QUOTA_PER_USD),
          reserved: keyProtocolAmount(item.reserved, RELAYFOR_QUOTA_PER_USD),
        }),
      ),
    ],
    runtimeSecret: undefined,
    runtimeKey: {
      modelAccess: {
        groups: null,
        allowedModelIds: token.model_limits?.length ? token.model_limits : null,
        suggestedModelIds: [],
      },
      createdAt: normalizeToMs(token.created_at) ?? undefined,
    },
    fields: [
      {
        fieldId: "expired_at",
        kind: "text",
        value: token.expired_at || "",
      },
      {
        fieldId: "ip_limits",
        kind: "list",
        value: readStringList(token.ip_limits),
      },
      {
        fieldId: "model_limits",
        kind: "list",
        value: token.model_limits || [],
      },
    ],
    searchValues: [
      String(token.id),
      token.name ?? "",
      maskSecretForDisplay(token.key ?? ""),
      ...(token.model_limits || []),
    ],
    actions: {
      canUpdate: true,
      canDelete: true,
      canRotate: true,
    },
  }
}

export const relayForAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.RELAYFOR,
  statusActions: {
    enable: {
      available: (key) => key.status !== KEY_STATUSES.Enabled,
      buildCommand: () => ({
        rotate: false,
        payload: { status: KEY_STATUSES.Enabled },
      }),
    },
    disable: {
      available: (key) => key.status === KEY_STATUSES.Enabled,
      buildCommand: () => ({
        rotate: false,
        payload: { status: KEY_STATUSES.Disabled },
      }),
    },
  },
  requiresFreshUpdateDetail: () => false,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: "default",
      routeKey: "default",
      displayName: "RelayFor",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "default",
  runtimeKey: {
    resolve: async () => ({
      kind: ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Unavailable,
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable },
    }),
  },
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (token: RelayForToken) => String(token.id),
  locatorFromDetail: (token: RelayForToken) => String(token.id),
  list: async (config) => {
    const items = await fetchRelayForTokens(config.request)
    return { items, total: items.length }
  },
  get: async (config, _scope, id) => {
    const tokens = await fetchRelayForTokens(config.request)
    const found = tokens.find((t) => String(t.id) === id)
    if (!found) {
      throw new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
      })
    }
    return found
  },
  toListFacts: facts,
  toDetailFacts: facts,
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    createRelayForKeyEditor(intent?.nameHint),
  editEditor: (_config, _scope, detail: RelayForToken, intent) =>
    editRelayForKeyEditor(detail, intent),
  create: async (config, scope, command, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    const token = await createRelayForToken(request, command)
    return {
      certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
      value: {
        detail: token,
        createdSecret: createdSecret(
          config.account,
          scope.scopeKey,
          token,
          request.baseUrl,
        ),
      },
    }
  },
  update: async (config, scope, state, command, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    const id = state.current.id
    try {
      if (Object.keys(command.payload).length)
        await updateRelayForToken(request, id, command.payload)
      const rotated = command.rotate
        ? await rotateRelayForToken(request, id)
        : undefined
      // Confirmed writes must not lose response-only secrets to a later read failure.
      const updated = {
        ...state.current,
        ...command.payload,
        ...(command.payload.expires_at !== undefined
          ? { expired_at: command.payload.expires_at }
          : {}),
      }
      return {
        certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
        value: updated,
        ...(rotated
          ? {
              createdSecret: createdSecret(
                config.account,
                scope.scopeKey,
                {
                  id,
                  name: updated.name,
                  key: rotated.key,
                },
                request.baseUrl,
              ),
            }
          : {}),
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.statusCode : undefined
      const rejected =
        status !== undefined &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 499
      return {
        certainty: rejected
          ? NATIVE_RESOURCE_MUTATION_CERTAINTIES.NotApplied
          : NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied,
        failure: error,
      }
    }
  },
  delete: async (config, _scope, id, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    await deleteRelayForToken(request, id)
    return {
      certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
      value: undefined,
    }
  },
  mapFailure: mapAccountKeyResourceFailure,
})
