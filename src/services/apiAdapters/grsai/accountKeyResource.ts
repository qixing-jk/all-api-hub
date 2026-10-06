import { SITE_TYPES } from "~/constants/siteType"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/runtimeKeyModelAccess"
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
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
import { RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  createGrsaiKey,
  deleteGrsaiKey,
  fetchGrsaiKeys,
  updateGrsaiKey,
} from "~/services/apiService/grsai"
import {
  GRSAI_API_BASE_URL,
  GRSAI_KEY_TYPE_LIMITED,
  GRSAI_KEY_TYPE_UNLIMITED,
} from "~/services/apiService/grsai/constants"
import { toOptionalFiniteNumber } from "~/services/apiService/grsai/parsing"
import type {
  GrsaiApiKey,
  GrsaiApiKeyUpdateRequest,
} from "~/services/apiService/grsai/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import {
  createGrsaiKeyEditor,
  GRSAI_KEY_FIELD_IDS as field,
  toGrsaiExpireTime,
  toGrsaiKeySnapshot,
  type GrsaiKeyEditCommand,
  type GrsaiKeySnapshot,
} from "./keyResourceEditor"

const ACCOUNT_SCOPE_KEY = "account"

type Config = {
  account: AccountKeyResourceOpenInput["account"]
  request: ApiServiceRequest
}

const requireId = (id: string) => {
  const trimmed = id.trim()
  if (!trimmed) throw new Error("invalid_grsai_key_id")
  return trimmed
}

const withOptions = (
  request: ApiServiceRequest,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal ? { ...request, abortSignal: options.signal } : request

const keyStatus = (key: GrsaiApiKey): AccountKeyResourceFacts["status"] => {
  const expiresAt = toOptionalFiniteNumber(key.expireTime)
  if (
    expiresAt !== undefined &&
    expiresAt > 0 &&
    expiresAt * 1000 <= Date.now()
  )
    return "expired"
  return "enabled"
}

const toFacts = (
  key: GrsaiApiKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceFacts => {
  const snapshot = toGrsaiKeySnapshot(key)
  const createdAt = Date.parse(key.createTime ?? "")

  return {
    ref,
    displayName: snapshot.name || `Key ${key.id}`,
    maskedLabel: maskSecretForDisplay(key.key),
    status: keyStatus(key),
    runtimeKey: {
      // Keys are addressed by the deployment's own OpenAI-compatible endpoint
      // rather than by the console origin they are managed from.
      baseUrl: GRSAI_API_BASE_URL,
      // The console sells one catalog for every key; a key cannot be scoped to
      // a model subset.
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      ...(Number.isFinite(createdAt) ? { createdAt } : {}),
    },
    displayFacts: [
      {
        fieldId: field.Credits,
        kind: "credits",
        value: snapshot.credits,
        unlimited: snapshot.unlimited,
      },
      keyExpiryDisplayFact(field.ExpiresAt, snapshot.expiresAt ?? ""),
    ],
    fields: [
      { fieldId: field.Unlimited, kind: "boolean", value: snapshot.unlimited },
      { fieldId: field.Credits, kind: "number", value: snapshot.credits },
      {
        fieldId: "totalCost",
        kind: "number",
        value: toOptionalFiniteNumber(key.totalCost) ?? 0,
      },
      {
        fieldId: field.ExpiresAt,
        kind: "text",
        value: snapshot.expiresAt ?? "",
      },
    ],
    searchValues: [snapshot.name, key.id, key.key],
    actions: { canUpdate: true, canDelete: true },
  }
}

const snapshotToWire = (
  key: GrsaiApiKey,
  values: GrsaiKeySnapshot,
): GrsaiApiKeyUpdateRequest => ({
  apiKey: key.key,
  name: values.name,
  // The deployment only reads `credits` while the key is limited, matching
  // the console.
  type: values.unlimited ? GRSAI_KEY_TYPE_UNLIMITED : GRSAI_KEY_TYPE_LIMITED,
  ...(values.unlimited ? {} : { credits: values.credits }),
  expireTime: toGrsaiExpireTime(values.expiresAt),
})

const changedKeys = (
  baseline: GrsaiKeySnapshot,
  values: GrsaiKeySnapshot,
): (keyof GrsaiKeySnapshot)[] =>
  (Object.keys(values) as (keyof GrsaiKeySnapshot)[]).filter(
    (key) => !resourceValuesEqual(values[key], baseline[key]),
  )

/**
 * Grsai native key management.
 *
 * Keys are recoverable: both the list and the create response return the
 * plaintext `sk-` secret, so inventory can always reveal and export a key.
 * There is no detail or patch endpoint — an update addresses the key by its
 * plaintext secret and answers with no payload, so every mutation finishes by
 * re-reading the inventory.
 */
export const grsaiAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.GRSAI,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: "editor-defaults",
  openConfig: async (input): Promise<Config> => ({
    account: input.account,
    request: input.request,
  }),
  listScopes: async (config) => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: config.account.name?.trim() || config.request.baseUrl,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => requireId(id),
  decodeLocator: (id: string) => requireId(id),
  locatorFromListItem: (key: GrsaiApiKey) => requireId(key.id),
  locatorFromDetail: (key: GrsaiApiKey) => requireId(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchGrsaiKeys(withOptions(config.request, options))
    return { items, total: items.length }
  },
  // The deployment exposes no per-key detail endpoint; the inventory row is the
  // whole record.
  get: async (config, _scope, id, options) => {
    const keys = await fetchGrsaiKeys(withOptions(config.request, options))
    const found = keys.find((key) => key.id === id)
    if (!found) throw new Error("grsai_key_not_found")
    return found
  },
  toListFacts: (key, ref) => toFacts(key, ref),
  toDetailFacts: (key, ref) => toFacts(key, ref),
  runtimeKey: {
    resolve: async (config, ref, options) => {
      try {
        const keys = await fetchGrsaiKeys(withOptions(config.request, options))
        const found = keys.find((key) => key.id === ref.resourceId)
        const secret = found?.key?.trim()
        return secret
          ? { kind: "resolved", secret }
          : { kind: "unavailable", failure: { code: "unavailable" } }
      } catch (error) {
        return {
          kind: "unavailable",
          failure: mapAccountKeyResourceFailure(error),
        }
      }
    },
  },
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    createGrsaiKeyEditor({ intent }),
  editEditor: (_config, _scope, detail) =>
    createGrsaiKeyEditor({ key: detail }),
  create: async (config, _scope, command: GrsaiKeyEditCommand, options) => {
    const request = withOptions(config.request, options)
    const values = command.values

    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        createGrsaiKey(mutationRequest, {
          name: values.name,
          type: values.unlimited
            ? GRSAI_KEY_TYPE_UNLIMITED
            : GRSAI_KEY_TYPE_LIMITED,
          ...(values.unlimited ? {} : { credits: values.credits }),
          expireTime: toGrsaiExpireTime(values.expiresAt),
        }),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty !== "applied") return result

    // No one-time secret: the inventory re-reveals the key on every read, so
    // the value belongs to the inventory rather than to the dialog.
    return { certainty: "applied" as const, value: { detail: result.value } }
  },
  update: async (
    config,
    _scope,
    detail: GrsaiApiKey,
    command: GrsaiKeyEditCommand,
    options,
  ) => {
    const latest = toGrsaiKeySnapshot(detail)
    const merged = mergeResourceEdits(command.baseline, command.values, latest)
    if (!merged) {
      return {
        certainty: "not-applied" as const,
        failure: { code: RESOURCE_FAILURE_CODES.ResourceChanged },
      }
    }

    const changed = changedKeys(latest, merged)
    if (changed.length === 0) {
      return { certainty: "applied" as const, value: detail }
    }

    const request = withOptions(config.request, options)
    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        updateGrsaiKey(mutationRequest, snapshotToWire(detail, merged)),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty === "not-applied") return result

    try {
      const keys = await fetchGrsaiKeys(request)
      const actual = keys.find((key) => key.id === detail.id)
      if (actual) {
        const applied = toGrsaiKeySnapshot(actual)
        if (
          changed.every((key) => resourceValuesEqual(applied[key], merged[key]))
        ) {
          return { certainty: "applied" as const, value: actual }
        }
      }
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(undefined),
      }
    } catch (error) {
      return {
        certainty: "possibly-applied" as const,
        failure: mapAccountKeyResourceUncertainFailure(error),
      }
    }
  },
  delete: async (config, _scope, id, options) => {
    const result = await runNativeResourceMutation({
      request: withOptions(config.request, options),
      execute: (request) => deleteGrsaiKey(request, id),
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
