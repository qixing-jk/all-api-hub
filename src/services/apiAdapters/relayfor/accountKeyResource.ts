import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { RELAYFOR_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
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
import { normalizeToMs } from "~/utils/core/formatters"

import { createRelayForKeyEditor, editRelayForKeyEditor } from "./keyEditor"

export { createRelayForKeyEditor, editRelayForKeyEditor } from "./keyEditor"
export type {
  RelayForCreateKeyCommand,
  RelayForEditKeyCommand,
} from "./keyEditor"

/** One correlation and credential projection for create and rotation responses. */
const createdSecret = (
  account: AccountKeyResourceOpenInput["account"],
  scopeKey: string,
  token: Pick<RelayForToken, "id" | "name" | "key">,
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
      baseUrl: toProtocolRoot(
        API_TYPES.OPENAI_COMPATIBLE,
        RELAYFOR_API_BASE_URL,
      )!,
      tagIds: [],
    },
  })

const facts = (
  token: RelayForToken,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => {
  const isEnabled = token.status === 1
  return {
    ref,
    displayName: token.name,
    maskedLabel: token.key,
    status: isEnabled
      ? ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
      : ACCOUNT_KEY_RESOURCE_STATUSES.Disabled,
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayFacts: [
      {
        fieldId: "remain_quota",
        kind: "money",
        role: "remaining",
        amountUsd: Math.max(0, token.remain_quota) / RELAYFOR_QUOTA_PER_USD,
        unlimited: token.unlimited_quota,
        followsAccount: !token.unlimited_quota && token.remain_quota < 0,
      },
      {
        fieldId: "used_quota",
        kind: "money",
        role: "used",
        amountUsd: token.used_quota / RELAYFOR_QUOTA_PER_USD,
      },
      keyExpiryDisplayFact("expired_at", token.expired_at ?? ""),
      {
        fieldId: "model_limits",
        kind: "restriction",
        role: "models",
        value: token.model_limits ?? [],
      },
      {
        fieldId: "ip_limits",
        kind: "restriction",
        role: "ip",
        value: readStringList(token.ip_limits),
      },
      {
        fieldId: "access_limits",
        kind: "rate-limit",
        rpm: token.limits?.requests_per_minute ?? 0,
        concurrency: token.limits?.concurrent_requests ?? 0,
      },
      ...(token.budget_usage ?? []).map((item) => ({
        fieldId: `budget_${item.window}`,
        kind: "budget" as const,
        window: item.window,
        limitUsd: item.limit / RELAYFOR_QUOTA_PER_USD,
        usedUsd: item.used / RELAYFOR_QUOTA_PER_USD,
        remainingUsd: item.remaining / RELAYFOR_QUOTA_PER_USD,
        reservedUsd: (item.reserved ?? 0) / RELAYFOR_QUOTA_PER_USD,
        nextResetAt: item.next_reset_at,
      })),
    ],
    runtimeSecret: undefined,
    runtimeKey: {
      modelAccess: {
        groups: null,
        allowedModelIds: token.model_limits?.length ? token.model_limits : null,
        suggestedModelIds: [],
      },
      baseUrl: RELAYFOR_API_BASE_URL,
      createdAt: normalizeToMs(token.created_at) ?? undefined,
    },
    fields: [
      {
        fieldId: "unlimited_quota",
        kind: "boolean",
        value: token.unlimited_quota,
      },
      {
        fieldId: "remain_quota",
        kind: "number",
        value: token.remain_quota / RELAYFOR_QUOTA_PER_USD,
      },
      {
        fieldId: "used_quota",
        kind: "number",
        value: token.used_quota / RELAYFOR_QUOTA_PER_USD,
      },
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
      token.key ?? "",
      ...(token.model_limits || []),
    ],
    actions: {
      canUpdate: true,
      canDelete: true,
      canRotate: true,
      canEnable: !isEnabled,
      canDisable: isEnabled,
    },
  }
}

export const relayForAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.RELAYFOR,
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
      kind: "unavailable",
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
      certainty: "applied",
      value: {
        detail: token,
        createdSecret: createdSecret(config.account, scope.scopeKey, token),
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
        certainty: "applied",
        value: updated,
        ...(rotated
          ? {
              createdSecret: createdSecret(config.account, scope.scopeKey, {
                id,
                name: updated.name,
                key: rotated.key,
              }),
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
        certainty: rejected ? "not-applied" : "possibly-applied",
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
    return { certainty: "applied", value: undefined }
  },
  mapFailure: mapAccountKeyResourceFailure,
})
