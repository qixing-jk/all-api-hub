import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
} from "~/services/accounts/createdRuntimeSecret"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import {
  mapAccountKeyResourceFailure,
  mapAccountKeyResourceUncertainFailure,
} from "~/services/apiAdapters/accountKeyResources/failure"
import type {
  AccountKeyResourceFacts,
  AccountKeyResourceOpenInput,
  AccountKeyResourceRef,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  createAIHubMixKey,
  deleteApiToken,
  fetchAIHubMixKey,
  fetchAIHubMixKeys,
  updateAIHubMixKey,
} from "~/services/apiService/aihubmix"
import type {
  AIHubMixKey,
  AIHubMixKeyData,
} from "~/services/apiService/aihubmix/keyTypes"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import {
  createAIHubMixKeyEditor,
  toAIHubMixKeyWrite,
  type AIHubMixKeyEditCommand,
} from "./keyResourceEditor"

type Config = AccountKeyResourceOpenInput
const requestWithOptions = (
  config: Config,
  options?: ResourceOperationOptions,
) => ({
  ...config.request,
  baseUrl: AIHUBMIX_API_ORIGIN,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})
const requireId = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("invalid_aihubmix_key_id")
  return id
}
const createRef = (config: Config, id: number): AccountKeyResourceRef => ({
  accountId: config.account.id,
  siteType: SITE_TYPES.AIHUBMIX,
  scopeKey: "account",
  resourceId: String(requireId(id)),
})
const readSecret = (key?: AIHubMixKeyData) =>
  [key?.full_key, key?.key, key?.token, key?.value]
    .find(
      (value): value is string =>
        typeof value === "string" && hasUsableApiTokenKey(value),
    )
    ?.trim()
const keyStatus = (key: AIHubMixKey): AccountKeyResourceFacts["status"] =>
  key.expired_time &&
  key.expired_time > 0 &&
  key.expired_time <= Date.now() / 1000
    ? "expired"
    : key.status === 1
      ? "enabled"
      : key.status === 2
        ? "disabled"
        : "unknown"

const toFacts = (
  key: AIHubMixKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceFacts => {
  const values = toAIHubMixKeyWrite(key)
  const models = values.models
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
  return {
    ref,
    displayName: key.name?.trim() || `Key ${key.id}`,
    maskedLabel: maskSecretForDisplay(key.key ?? key.token ?? key.value ?? ""),
    status: keyStatus(key),
    runtimeKey: {
      modelAccess: {
        groups: null,
        allowedModelIds: models.length ? models : null,
        suggestedModelIds: models,
      },
      legacyTokenId: key.id,
      createdAt: normalizeToMs(key.created_time) ?? undefined,
      notes: key.note,
    },
    fields: [
      {
        fieldId: "unlimited_quota",
        kind: "boolean",
        value: values.unlimited_quota,
      },
      { fieldId: "remain_quota", kind: "number", value: values.remain_quota },
      {
        fieldId: "used_quota",
        kind: "number",
        value: Number(key.used_quota) || 0,
      },
      { fieldId: "expired_time", kind: "number", value: values.expired_time },
      ...(typeof key.accessed_time === "number" &&
      Number.isFinite(key.accessed_time) &&
      key.accessed_time > 0
        ? [
            {
              fieldId: "accessed_time",
              kind: "number" as const,
              value: key.accessed_time,
            },
          ]
        : []),
      { fieldId: "models", kind: "list", value: models },
      { fieldId: "subnet", kind: "text", value: values.subnet },
    ],
    searchValues: [key.name ?? "", String(key.id), ...models],
    actions: { canUpdate: true, canDelete: true },
  }
}

const createdSecret = (
  config: Config,
  name: string,
  secret: string,
  ref?: AccountKeyResourceRef,
) => {
  const input = {
    displayName: name,
    secret,
    credential: {
      accountName: config.account.name ?? "AIHubMix",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      tagIds: [],
    },
  }
  return ref
    ? createAccountKeyResourceCreatedRuntimeSecret({ ...input, ref })
    : createUnattributedAccountCreatedRuntimeSecret({
        ...input,
        accountId: config.account.id,
      })
}

/** AIHubMix native keys keep create-only plaintext out of inventory and detail facts. */
export const aihubmixAccountKeyResources = defineAccountKeyResourceCapability({
  defaultCreation: "editor-defaults",
  siteType: SITE_TYPES.AIHUBMIX,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  openConfig: async (input): Promise<Config> => input,
  listScopes: async () => [
    {
      scopeKey: "account",
      routeKey: "account",
      displayName: "AIHubMix",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "account",
  encodeLocator: (id: number) => String(requireId(id)),
  decodeLocator: (id: string) => {
    if (!/^[1-9]\d*$/.test(id)) throw new Error("invalid_aihubmix_key_id")
    return requireId(Number(id))
  },
  locatorFromListItem: (key: AIHubMixKey) => requireId(key.id),
  locatorFromDetail: (key: AIHubMixKey) => requireId(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchAIHubMixKeys(requestWithOptions(config, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    fetchAIHubMixKey(requestWithOptions(config, options), id),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  runtimeKey: {
    resolve: async () => ({
      kind: "unavailable",
      failure: { code: "unavailable" },
    }),
  },
  createEditor: async (config, _scope, options, _inventory, intent) =>
    createAIHubMixKeyEditor(
      requestWithOptions(config, options),
      undefined,
      intent,
    ),
  editEditor: (config, _scope, detail) =>
    createAIHubMixKeyEditor(requestWithOptions(config), detail),
  create: async (config, _scope, command: AIHubMixKeyEditCommand, options) => {
    const request = requestWithOptions(config, options)
    const before = new Set(
      (await fetchAIHubMixKeys(request)).map((key) => key.id),
    )
    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        createAIHubMixKey(mutationRequest, command.values),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty === "not-applied") return result
    const response = result.certainty === "applied" ? result.value : undefined
    const secret = readSecret(response)
    const responseId = Number(response?.id ?? response?.token_id)
    const hasResponseId = Number.isSafeInteger(responseId) && responseId > 0
    let detail: AIHubMixKey | undefined
    if (response && hasResponseId && !before.has(responseId))
      detail = { ...response, id: responseId }
    let reconciliationFailure: unknown
    if (!detail) {
      try {
        const candidates = (await fetchAIHubMixKeys(request)).filter(
          (key) =>
            !before.has(key.id) &&
            (!hasResponseId || key.id === responseId) &&
            resourceValuesEqual(toAIHubMixKeyWrite(key), command.values),
        )
        if (candidates.length === 1) detail = candidates[0]
      } catch (error) {
        reconciliationFailure = error
      }
    }
    if (detail)
      return {
        certainty: "applied" as const,
        value: {
          detail,
          ...(secret
            ? {
                createdSecret: createdSecret(
                  config,
                  command.values.name,
                  secret,
                  createRef(config, detail.id),
                ),
              }
            : {}),
        },
      }
    if (secret)
      return {
        certainty: "applied" as const,
        value: {
          detail: null,
          createdSecret: createdSecret(config, command.values.name, secret),
        },
      }
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(
        result.certainty === "possibly-applied"
          ? result.failure
          : reconciliationFailure,
      ),
    }
  },
  update: async (
    config,
    _scope,
    detail,
    command: AIHubMixKeyEditCommand,
    options,
  ) => {
    const latest = toAIHubMixKeyWrite(detail)
    const merged = mergeResourceEdits(command.baseline, command.values, latest)
    if (!merged)
      return {
        certainty: "not-applied" as const,
        failure: { code: "resource_changed" as const },
      }
    if (resourceValuesEqual(merged, latest))
      return { certainty: "applied" as const, value: detail }
    const request = requestWithOptions(config, options)
    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        updateAIHubMixKey(mutationRequest, detail.id, merged),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty === "not-applied") return result
    try {
      const updated = await fetchAIHubMixKey(request, detail.id)
      const actual = toAIHubMixKeyWrite(updated)
      // Acknowledged writes or an untouched quota permit subsequent consumption.
      // An uncertain quota edit must still match exactly before confirming it.
      const allowQuotaConsumption =
        result.certainty === "applied" ||
        merged.remain_quota === latest.remain_quota
      if (
        (Object.keys(merged) as (keyof typeof merged)[]).every(
          (field) =>
            resourceValuesEqual(actual[field], merged[field]) ||
            (field === "remain_quota" &&
              allowQuotaConsumption &&
              actual.remain_quota < merged.remain_quota),
        )
      )
        return { certainty: "applied" as const, value: updated }
    } catch (error) {
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(error),
      }
    }
    return {
      certainty: "possibly-applied" as const,
      failure: mapAccountKeyResourceUncertainFailure(
        result.certainty === "possibly-applied" ? result.failure : undefined,
      ),
    }
  },
  delete: async (config, _scope, id, options) => {
    const result = await runNativeResourceMutation({
      request: requestWithOptions(config, options),
      execute: (request) => deleteApiToken(request, id),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    return result.certainty === "applied"
      ? { certainty: "applied", value: undefined }
      : result
  },
  mapFailure: mapAccountKeyResourceFailure,
})
