import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
} from "~/services/accounts/keys/createdRuntimeSecret"
import { KRILL_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import {
  createKrillKey,
  deleteKrillKey,
  fetchKrillChannels,
  fetchKrillKey,
  fetchKrillKeys,
  revokeKrillKey,
  updateKrillKey,
  type KrillChannel,
  type KrillToken,
  type KrillTokenDetail,
} from "~/services/apiService/krill/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { normalizeToMs } from "~/utils/core/formatters"

import {
  createKrillKeyEditor,
  type KrillKeyCommand,
  type KrillKeyEditableDetail,
} from "./keyEditor"
import { krillKeyFields } from "./keyResourceFields"

/** A hydrated key also carries the channel catalogue the editor needs. */
type KrillHydratedDetail = KrillTokenDetail & {
  channels?: readonly KrillChannel[]
}

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
): ApiServiceRequest => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

/** The console shows the key prefix only; it never reveals a stored secret. */
const maskedLabel = (tokenPrefix: string) => `${tokenPrefix}••••`

const lastUsedFacts = (token: KrillToken) => {
  const timestampMs =
    token.lastUsedAt === null ? null : normalizeToMs(token.lastUsedAt)
  return timestampMs === null || timestampMs <= 0
    ? []
    : [{ fieldId: "accessed_time", kind: "last-used" as const, timestampMs }]
}

const ipFacts = (token: KrillToken) =>
  token.ipWhitelist === null || token.ipWhitelistDisabled
    ? []
    : [
        {
          fieldId: krillKeyFields.IpWhitelist,
          kind: "restriction" as const,
          role: "ip" as const,
          value: token.ipWhitelist,
        },
      ]

/** Empty native selections inherit the site's default-routed billing channels. */
function channelNames(detail: KrillHydratedDetail): readonly string[] {
  if (!detail.channels) return detail.channelIds.map(String)
  if (detail.channelIds.length === 0)
    return detail.channels
      .filter((channel) => channel.defaultRouted)
      .map((channel) => channel.name)
  const byId = new Map(
    detail.channels.map((channel) => [channel.id, channel.name]),
  )
  return detail.channelIds.map((id) => byId.get(id) ?? String(id))
}

const facts = (
  token: KrillToken,
  ref: AccountKeyResourceRef,
  detail?: KrillHydratedDetail,
): AccountKeyResourceProviderFacts => ({
  ...(detail
    ? { detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete }
    : {}),
  ref,
  displayName: token.name || `Krill #${token.id}`,
  maskedLabel: maskedLabel(token.tokenPrefix),
  // A rotated-away plaintext is never recoverable from the inventory.
  runtimeSecret: undefined,
  status: token.revoked ? "disabled" : "enabled",
  runtimeKey: {
    modelAccess: {
      // Channels gate billing routes, not model groups, so no group policy applies.
      groups: null,
      allowedModelIds: null,
      suggestedModelIds: [],
    },
    baseUrl: KRILL_API_BASE_URL,
    createdAt: normalizeToMs(token.createdAt) ?? undefined,
  },
  fields: [],
  displayFacts: [
    ...lastUsedFacts(token),
    ...ipFacts(token),
    ...(detail
      ? [
          {
            fieldId: krillKeyFields.Channels,
            kind: "channels" as const,
            value: channelNames(detail),
            usesDefault: detail.channelIds.length === 0,
          },
        ]
      : []),
  ],
  actions: {
    canUpdate: !token.revoked,
    canDelete: true,
    canRevoke: !token.revoked,
  },
})

/** Hydrate channels on demand for display names and editor options. */
async function hydrateDetail(
  request: ApiServiceRequest,
  id: string,
  withCatalogue: boolean,
): Promise<KrillHydratedDetail> {
  const detail = await fetchKrillKey(request, id)
  if (!withCatalogue) return detail
  const channels = await fetchKrillChannels(request)
  return { ...detail, channels }
}

export const krillKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.KRILL,
  // Settings and channels are written on separate routes, so re-read before writing.
  requiresFreshUpdateDetail: () => true,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: "account",
      routeKey: "account",
      displayName: "Krill AI",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "account",
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: KrillToken) => String(key.id),
  locatorFromDetail: (key: KrillToken) => String(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchKrillKeys(withSignal(config.request, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    hydrateDetail(withSignal(config.request, options), id, true),
  // Editing needs the channel catalogue as well as the key's own selection.
  getEditDetail: (config, _scope, id, options) =>
    hydrateDetail(withSignal(config.request, options), id, true),
  toListFacts: (item: KrillToken, ref) => facts(item, ref),
  toDetailFacts: (detail: KrillHydratedDetail, ref) =>
    facts(detail, ref, detail),
  runtimeKey: {
    // The inventory carries only the prefix and no reveal route exists.
    resolve: async () => ({
      kind: "unavailable",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable },
    }),
  },
  // Match the native name-only creation. Permissions are edited after the
  // one-time secret is acknowledged, never between creation and its delivery.
  createEditor: async (_config, _scope, _options, _inventory, intent) => ({
    fields: [
      { fieldId: krillKeyFields.Name, type: "text" as const, nullable: true },
    ],
    initialValues: {
      name: intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
    },
    validate: () => ({ valid: true as const }),
    buildCommand: (values) => ({ name: String(values.name ?? "").trim() }),
  }),
  editEditor: (
    _config,
    _scope,
    detail: KrillHydratedDetail & KrillKeyEditableDetail,
  ) => createKrillKeyEditor({ channels: detail.channels ?? [], detail }),
  create: (config, scope, command: { name: string }, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const { secret, item } = await createKrillKey(request, {
          name: command.name,
        })
        const credential = {
          accountName: config.account.name ?? "Krill AI",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: toProtocolRoot(
            API_TYPES.OPENAI_COMPATIBLE,
            KRILL_API_BASE_URL,
          )!,
          tagIds: [],
        }
        if (!item)
          return {
            detail: null,
            createdSecret: createUnattributedAccountCreatedRuntimeSecret({
              accountId: config.account.id,
              displayName: command.name.trim() || "Krill AI",
              secret,
              credential,
            }),
          }
        return {
          detail: { ...item, channelIds: [] },
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref: {
              accountId: config.account.id,
              siteType: SITE_TYPES.KRILL,
              scopeKey: scope.scopeKey,
              resourceId: String(item.id),
            },
            displayName: item.name || `Krill #${item.id}`,
            secret,
            credential,
          }),
        }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (config, _scope, { baseline }, command: KrillKeyCommand, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await updateKrillKey(request, {
          id: baseline.id,
          name: command.name,
          allowBalanceFallback: command.allowBalanceFallback,
          ipWhitelist: command.ipWhitelist,
          ipWhitelistDisabled: command.ipWhitelistDisabled,
          channelIds: command.channelIds,
        })
        // Read the written state back so the saved facts match the console.
        return hydrateDetail(request, String(baseline.id), true)
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await deleteKrillKey(request, id)
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  revoke: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await revokeKrillKey(request, id)
        const detail = await hydrateDetail(request, id, true)
        if (!detail.revoked) throw new Error("Revocation was not confirmed")
        return detail
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
