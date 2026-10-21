import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { DAYA_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_MUTATION_CERTAINTIES,
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failureCodes,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { mergeResourceEdits } from "~/services/apiAdapters/nativeResources/editableChanges"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { DAYA_KEY_STATUSES } from "~/services/apiService/daya/constants"
import {
  createDayaKey,
  deleteDayaKey,
  fetchDayaDefaultKeyGroups,
  fetchDayaGroups,
  fetchDayaKey,
  fetchDayaKeys,
  updateDayaKey,
  type DayaGroup,
  type DayaKey,
  type DayaKeyStatus,
} from "~/services/apiService/daya/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import { createDayaKeyEditor, type DayaKeyCommand } from "./keyEditor"
import { DAYA_KEY_FACT_FIELDS as factFields } from "./keyResourceFields"

const ACCOUNT_SCOPE_KEY = "account"

/** Opening an edit prepares its catalogue; ordinary key reads need no UI metadata. */
type DayaKeyEditDetail = DayaKey & { editorGroups?: readonly DayaGroup[] }

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
): ApiServiceRequest => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

const toFactStatus = (status: DayaKeyStatus) =>
  status === DAYA_KEY_STATUSES.Active
    ? statuses.Enabled
    : status === DAYA_KEY_STATUSES.Expired
      ? statuses.Expired
      : statuses.Disabled

const facts = (
  key: DayaKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => ({
  ref,
  detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
  displayName: key.name || `Daya #${key.id}`,
  maskedLabel: maskSecretForDisplay(key.key),
  runtimeSecret: key.key,
  status: toFactStatus(key.status),
  runtimeKey: {
    modelAccess: {
      groups: key.groupIds.map(String),
      allowedModelIds: null,
      suggestedModelIds: [],
    },
    baseUrl: DAYA_API_BASE_URL,
    createdAt: normalizeToMs(key.createdAt) ?? undefined,
  },
  fields: [],
  displayFacts: [
    {
      fieldId: "quota",
      kind: "money",
      role: "remaining",
      amountUsd:
        key.quotaUsd === 0 ? 0 : Math.max(0, key.quotaUsd - key.quotaUsedUsd),
      unlimited: key.quotaUsd === 0,
    },
    {
      fieldId: "used",
      kind: "money",
      role: "used",
      amountUsd: Math.max(0, key.quotaUsedUsd),
    },
    {
      fieldId: "expiry",
      kind: "expiry",
      timestampMs: key.expiresAt ? normalizeToMs(key.expiresAt) ?? null : null,
    },
    ...(key.lastUsedAt && normalizeToMs(key.lastUsedAt)
      ? [
          {
            fieldId: "accessed_time",
            kind: "last-used" as const,
            timestampMs: normalizeToMs(key.lastUsedAt)!,
          },
        ]
      : []),
    ...ipFacts(factFields.IpWhitelist, key.ipWhitelist, "ip"),
    ...ipFacts(factFields.IpBlacklist, key.ipBlacklist, "subnet"),
    ...rateLimitFact(factFields.RateLimit5h, key.rateLimits.hours5Usd),
    ...rateLimitFact(factFields.RateLimit1d, key.rateLimits.dayUsd),
    ...rateLimitFact(factFields.RateLimit7d, key.rateLimits.days7Usd),
  ],
  actions: {
    canUpdate: true,
    canDelete: true,
    canRevoke:
      key.status === DAYA_KEY_STATUSES.Active ||
      key.status === DAYA_KEY_STATUSES.Inactive,
  },
})

/** Project configured restrictions into the inventory detail facts. */
function ipFacts(
  fieldId: string,
  entries: readonly string[] | null,
  role: "ip" | "subnet",
) {
  if (!entries || entries.length === 0) return []
  return [{ fieldId, kind: "restriction" as const, role, value: entries }]
}

/** A zero limit means no configured limit, so nothing is displayed. */
function rateLimitFact(fieldId: string, amountUsd: number) {
  if (amountUsd <= 0) return []
  return [
    {
      fieldId,
      kind: "money" as const,
      role: "total" as const,
      amountUsd,
    },
  ]
}

export const dayaKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.DAYA,
  // The update route replaces its writable fields, so re-read the accepted
  // record before every write instead of trusting a UI snapshot.
  requiresFreshUpdateDetail: () => true,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: "Daya API",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: DayaKey) => String(key.id),
  locatorFromDetail: (key: DayaKey) => String(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchDayaKeys(withSignal(config.request, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    fetchDayaKey(withSignal(config.request, options), id),
  getEditDetail: async (config, _scope, id, options) => {
    const request = withSignal(config.request, options)
    const [detail, editorGroups] = await Promise.all([
      fetchDayaKey(request, id),
      fetchDayaGroups(request),
    ])
    return { ...detail, editorGroups }
  },
  toListFacts: facts,
  toDetailFacts: facts,
  runtimeKey: {
    async resolve(config, ref, options) {
      const key = await fetchDayaKey(
        withSignal(config.request, options),
        ref.resourceId,
      )
      if (!hasUsableApiTokenKey(key.key))
        return {
          kind: "unavailable" as const,
          failure: { code: failureCodes.Unavailable },
        }
      return {
        kind: "resolved" as const,
        secret: key.key,
      }
    },
  },
  createEditor: async (config, _scope, options, _inventory, intent) => {
    const request = withSignal(config.request, options)
    const [groups, defaults] = await Promise.all([
      fetchDayaGroups(request),
      fetchDayaDefaultKeyGroups(request),
    ])
    const available = new Set(groups.map((group) => group.id))
    return createDayaKeyEditor({
      groups,
      defaultGroupIds: defaults
        .filter((group) => available.has(group.id))
        .map((group) => group.id),
      nameHint: intent?.nameHint,
    })
  },
  editEditor: (_config, _scope, detail: DayaKeyEditDetail) =>
    createDayaKeyEditor({
      groups: detail.editorGroups ?? [],
      detail,
    }),
  create: (config, scope, command: DayaKeyCommand, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const { secret, item } = await createDayaKey(request, {
          allowFast: command.allowFast,
          customKey: command.customKey,
          ipWhitelist: command.ipWhitelist,
          ipBlacklist: command.ipBlacklist,
          rateLimits: command.rateLimits,
          name: command.name,
          groupIds: command.groupIds,
          quotaUsd: command.quotaUsd,
          expiresInDays: command.expiresInDays ?? null,
        })
        const credential = {
          accountName: config.account.name ?? "Daya API",
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          baseUrl: toProtocolRoot(
            API_TYPES.OPENAI_COMPATIBLE,
            DAYA_API_BASE_URL,
          )!,
          tagIds: [],
        }
        return {
          detail: item,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref: {
              accountId: config.account.id,
              siteType: SITE_TYPES.DAYA,
              scopeKey: scope.scopeKey,
              resourceId: String(item.id),
            },
            displayName: item.name || `Daya #${item.id}`,
            secret,
            credential,
          }),
        }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (
    config,
    _scope,
    { baseline, current },
    command: DayaKeyCommand,
    options,
  ) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const before = editableKey(baseline)
        const edited = {
          allowFast: command.allowFast,
          name: command.name,
          groupIds: command.groupIds,
          quotaUsd: command.quotaUsd,
          status:
            command.status === undefined ||
            (command.status === DAYA_KEY_STATUSES.Active) ===
              (baseline.status === DAYA_KEY_STATUSES.Active)
              ? baseline.status
              : command.status,
          expiresAt: command.expiresAt ?? null,
          ipWhitelist: command.ipWhitelist,
          ipBlacklist: command.ipBlacklist,
          hours5Usd: command.rateLimits.hours5Usd,
          dayUsd: command.rateLimits.dayUsd,
          days7Usd: command.rateLimits.days7Usd,
        }
        const latest = editableKey(current)
        const merged = mergeResourceEdits(before, edited, latest)
        if (!merged)
          throw new AccountKeyResourceError({
            code: failureCodes.ResourceChanged,
          })
        return updateDayaKey(request, current, {
          ...merged,
          rateLimits: {
            hours5Usd: merged.hours5Usd,
            dayUsd: merged.dayUsd,
            days7Usd: merged.days7Usd,
          },
          // Keep native timestamp precision when expiry was not changed.
          expiresAt:
            merged.expiresAt === latest.expiresAt
              ? current.expiresAt
              : merged.expiresAt,
        })
      },
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        error instanceof AccountKeyResourceError &&
        error.failure.code === failureCodes.ResourceChanged
          ? ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied
          : undefined,
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await deleteDayaKey(request, id)
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  revoke: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const baseline = await fetchDayaKey(request, id)
        if (baseline.status === DAYA_KEY_STATUSES.Inactive) return baseline
        return updateDayaKey(request, baseline, {
          name: baseline.name,
          groupIds: baseline.groupIds,
          quotaUsd: baseline.quotaUsd,
          status: DAYA_KEY_STATUSES.Inactive,
          expiresAt: baseline.expiresAt,
        })
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})

/** Compare the same normalized values the editor presents, preserving native statuses. */
function editableKey(key: DayaKey) {
  return {
    allowFast: key.allowFast,
    ipWhitelist: key.ipWhitelist ?? [],
    ipBlacklist: key.ipBlacklist ?? [],
    ...key.rateLimits,
    name: key.name,
    groupIds: key.groupIds,
    quotaUsd: key.quotaUsd,
    status: key.status,
    expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
  }
}
