import { SITE_TYPES } from "~/constants/siteType"
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
  RESOURCE_FAILURE_CODES,
  RESOURCE_FIELD_ISSUE_CODES,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  mergeResourceEdits,
  resourceValuesEqual,
} from "~/services/apiAdapters/nativeResources/editableChanges"
import {
  isApiBusinessError,
  runNativeResourceMutation,
} from "~/services/apiAdapters/nativeResources/mutation"
import {
  createRightCodeKey,
  deleteRightCodeKey,
  fetchRightCodeEffectiveUpstreams,
  fetchRightCodeKey,
  fetchRightCodeKeys,
  setRightCodeKeyExpiry,
  updateRightCodeKey,
} from "~/services/apiService/rightcode"
import { resolveRightCodeKeyBaseUrl } from "~/services/apiService/rightcode/channelBaseUrl"
import { toOptionalFiniteNumber } from "~/services/apiService/rightcode/parsing"
import type {
  RightCodeApiKey,
  RightCodeApiKeyUpdateRequest,
} from "~/services/apiService/rightcode/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { toRightCodeChannelInfos, type RightCodeChannelInfo } from "./channels"
import {
  createRightCodeKeyEditor,
  RIGHTCODE_KEY_FIELD_IDS as field,
  toRightCodeKeySnapshot,
  type RightCodeKeyEditCommand,
  type RightCodeKeySnapshot,
} from "./keyResourceEditor"

const ACCOUNT_SCOPE_KEY = "account"

type Config = {
  account: AccountKeyResourceOpenInput["account"]
  request: ApiServiceRequest
  channels: RightCodeChannelInfo[]
}

/** One inventory entry together with the channel that addresses it. */
type RightCodeKeyEntry = {
  key: RightCodeApiKey
  channel?: RightCodeChannelInfo
  /** Client-facing address for this key's channel, when one is known. */
  baseUrl?: string
}

const requireId = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("invalid_rightcode_key_id")
  }
  return id
}

const withOptions = (
  request: ApiServiceRequest,
  options?: ResourceOperationOptions,
): ApiServiceRequest =>
  options?.signal ? { ...request, abortSignal: options.signal } : request

/**
 * Client-facing address this key is used with.
 *
 * Every Right Code key is addressed through a channel prefix rather than the
 * bare site origin: a bound key uses its channel, and a legacy key uses the
 * first prefix it is allowed to call.
 */
const toEntry = (
  origin: string,
  channels: readonly RightCodeChannelInfo[],
  key: RightCodeApiKey,
): RightCodeKeyEntry => {
  const channelId = toOptionalFiniteNumber(key.bound_upstream_id)
  const legacyPrefix = key.allowed_prefixes
    ?.find((prefix) => typeof prefix === "string" && prefix.trim())
    ?.trim()
  const channel =
    channelId !== undefined
      ? channels.find((candidate) => candidate.id === channelId)
      : legacyPrefix
        ? channels.find((candidate) => candidate.prefix === legacyPrefix)
        : undefined
  const baseUrl =
    resolveRightCodeKeyBaseUrl({ origin, key, boundChannel: channel }) ??
    undefined
  return {
    key,
    ...(channel ? { channel } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  }
}

const keyStatus = (key: RightCodeApiKey): AccountKeyResourceFacts["status"] => {
  const expiry = key.expired_at?.trim()
  if (expiry) {
    const parsed = Date.parse(expiry)
    if (Number.isFinite(parsed) && parsed <= Date.now()) return "expired"
  }
  return key.is_active === false ? "disabled" : "enabled"
}

const toFacts = (
  entry: RightCodeKeyEntry,
  ref: AccountKeyResourceRef,
): AccountKeyResourceFacts => {
  const snapshot = toRightCodeKeySnapshot(entry.key)
  const createdAt = Date.parse(entry.key.created_at ?? "")

  return {
    ref,
    displayName: snapshot.name || `Key ${entry.key.id}`,
    maskedLabel: maskSecretForDisplay(entry.key.key ?? ""),
    status: keyStatus(entry.key),
    runtimeKey: {
      modelAccess: {
        groups: null,
        allowedModelIds: snapshot.allowedModels.length
          ? snapshot.allowedModels
          : null,
        suggestedModelIds: snapshot.allowedModels,
      },
      ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
      ...(Number.isFinite(createdAt) ? { createdAt } : {}),
    },
    fields: [
      ...(entry.channel
        ? [
            {
              fieldId: field.Channel,
              kind: "text" as const,
              value: `${entry.channel.name} (${entry.channel.prefix})`,
            },
          ]
        : []),
      {
        fieldId: field.Unlimited,
        kind: "boolean",
        value: snapshot.quotaLimit === null,
      },
      {
        fieldId: field.QuotaUsd,
        kind: "number",
        value: snapshot.quotaLimit ?? 0,
      },
      {
        fieldId: "used_quota",
        kind: "number",
        value: toOptionalFiniteNumber(entry.key.used_quota) ?? 0,
      },
      {
        fieldId: field.ExpiresAt,
        kind: "text",
        value: snapshot.expiresAt ?? "",
      },
      {
        fieldId: field.AllowWallet,
        kind: "boolean",
        value: snapshot.allowWallet,
      },
      { fieldId: field.Models, kind: "list", value: snapshot.allowedModels },
    ],
    searchValues: [
      snapshot.name,
      String(entry.key.id),
      entry.key.key ?? "",
      entry.channel?.name ?? "",
      ...snapshot.allowedModels,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

const snapshotToWire = (
  values: RightCodeKeySnapshot,
): RightCodeApiKeyUpdateRequest => ({
  name: values.name,
  quota_limit: values.quotaLimit,
  is_active: values.isActive,
  ...(values.channelId === null ? {} : { bound_upstream_id: values.channelId }),
  allowed_models: values.allowedModels,
  allow_wallet: values.allowWallet,
})

const changedKeys = (
  baseline: RightCodeKeySnapshot,
  values: RightCodeKeySnapshot,
): (keyof RightCodeKeySnapshot)[] =>
  (Object.keys(values) as (keyof RightCodeKeySnapshot)[]).filter(
    (key) =>
      key !== "expiresAt" && !resourceValuesEqual(values[key], baseline[key]),
  )

/**
 * Right Code native key management.
 *
 * Keys are recoverable: list, detail and create all return the plaintext
 * `sk-...` secret, so inventory can always reveal and export a key. A key binds
 * to exactly one channel, which is also the address its client traffic uses.
 */
export const rightCodeAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.RIGHT_CODE,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: "requires-input",
  openConfig: async (input, options): Promise<Config> => {
    const channels = toRightCodeChannelInfos(
      await fetchRightCodeEffectiveUpstreams(
        withOptions(input.request, options),
      ),
    )
    return { account: input.account, request: input.request, channels }
  },
  listScopes: async (config) => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: config.account.name?.trim() || config.request.baseUrl,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: number) => String(requireId(id)),
  decodeLocator: (id: string) => {
    if (!/^[1-9]\d*$/.test(id)) throw new Error("invalid_rightcode_key_id")
    return requireId(Number(id))
  },
  locatorFromListItem: (entry: RightCodeKeyEntry) => requireId(entry.key.id),
  locatorFromDetail: (entry: RightCodeKeyEntry) => requireId(entry.key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchRightCodeKeys(withOptions(config.request, options))
    return {
      items: items.map((key) =>
        toEntry(config.request.baseUrl, config.channels, key),
      ),
      total: items.length,
    }
  },
  get: async (config, _scope, id, options) =>
    toEntry(
      config.request.baseUrl,
      config.channels,
      await fetchRightCodeKey(withOptions(config.request, options), id),
    ),
  toListFacts: (entry, ref) => toFacts(entry, ref),
  toDetailFacts: (entry, ref) => toFacts(entry, ref),
  runtimeKey: {
    resolve: async (config, ref, options) => {
      try {
        const key = await fetchRightCodeKey(
          withOptions(config.request, options),
          ref.resourceId,
        )
        const secret = key.key?.trim()
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
  createEditor: async (config, _scope, _options, _inventory, intent) =>
    createRightCodeKeyEditor({ channels: config.channels, intent }),
  editEditor: (config, _scope, detail) =>
    createRightCodeKeyEditor({ channels: config.channels, key: detail.key }),
  create: async (config, _scope, command: RightCodeKeyEditCommand, options) => {
    const request = withOptions(config.request, options)
    const values = command.values
    if (values.channelId === null) {
      return {
        certainty: "not-applied" as const,
        failure: {
          code: RESOURCE_FAILURE_CODES.ValidationFailed,
          fieldIssues: [
            {
              fieldId: field.Channel,
              code: RESOURCE_FIELD_ISSUE_CODES.Required,
            },
          ],
        },
      }
    }

    const result = await runNativeResourceMutation({
      request,
      execute: (mutationRequest) =>
        createRightCodeKey(mutationRequest, {
          bound_upstream_id: values.channelId as number,
          allowed_models: values.allowedModels,
          ...(values.name ? { name: values.name } : {}),
          quota_limit: values.quotaLimit,
          allow_wallet: values.allowWallet,
          allowed_item_ids: null,
        }),
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        isApiBusinessError(error) ? "not-applied" : undefined,
    })
    if (result.certainty !== "applied") return result

    const created = result.value
    // Expiry lives behind its own endpoint; a failure there still leaves a
    // created, permanent key that the read below reports accurately.
    if (values.expiresAt) {
      try {
        await setRightCodeKeyExpiry(request, created.id, values.expiresAt)
      } catch (error) {
        return {
          certainty: "partially-applied" as const,
          failure: mapAccountKeyResourceUncertainFailure(error),
        }
      }
    }

    const entry = toEntry(
      config.request.baseUrl,
      config.channels,
      await fetchRightCodeKey(request, created.id).catch(() => created),
    )
    // No one-time secret: Right Code re-reveals the key on every read, so the
    // inventory owns the value and the create response must not imply that
    // closing the dialog would lose it.
    return { certainty: "applied" as const, value: { detail: entry } }
  },
  update: async (
    config,
    _scope,
    detail: RightCodeKeyEntry,
    command: RightCodeKeyEditCommand,
    options,
  ) => {
    const latest = toRightCodeKeySnapshot(detail.key)
    const merged = mergeResourceEdits(command.baseline, command.values, latest)
    if (!merged) {
      return {
        certainty: "not-applied" as const,
        failure: { code: RESOURCE_FAILURE_CODES.ResourceChanged },
      }
    }

    const request = withOptions(config.request, options)
    const changed = changedKeys(latest, merged)
    const expiryChanged = !resourceValuesEqual(
      merged.expiresAt,
      latest.expiresAt,
    )
    if (changed.length === 0 && !expiryChanged) {
      return { certainty: "applied" as const, value: detail }
    }

    if (changed.length > 0) {
      const result = await runNativeResourceMutation({
        request,
        execute: (mutationRequest) =>
          updateRightCodeKey(
            mutationRequest,
            detail.key.id,
            snapshotToWire(merged),
          ),
        mapFailure: mapAccountKeyResourceFailure,
        classifyError: (error) =>
          isApiBusinessError(error) ? "not-applied" : undefined,
      })
      if (result.certainty === "not-applied") return result
    }

    if (expiryChanged && merged.expiresAt) {
      try {
        await setRightCodeKeyExpiry(request, detail.key.id, merged.expiresAt)
      } catch (error) {
        return {
          certainty: "partially-applied" as const,
          failure: mapAccountKeyResourceUncertainFailure(error),
        }
      }
    }

    try {
      const entry = toEntry(
        config.request.baseUrl,
        config.channels,
        await fetchRightCodeKey(request, detail.key.id),
      )
      const actual = toRightCodeKeySnapshot(entry.key)
      const applied = changed.every((key) =>
        resourceValuesEqual(actual[key], merged[key]),
      )
      const expiryApplied =
        !expiryChanged ||
        resourceValuesEqual(actual.expiresAt, merged.expiresAt)
      if (applied && expiryApplied) {
        return { certainty: "applied" as const, value: entry }
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
      execute: (request) => deleteRightCodeKey(request, id),
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
