import { SITE_TYPES } from "~/constants/siteType"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import {
  EMRANK_API_BASE_URL,
  EMRANK_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import {
  EMRANK_TOKEN_ASSET,
  EMRANK_TOKENS_PER_M_TOKEN,
} from "~/services/apiService/emrank/constants"
import {
  createKey,
  deleteKey,
  EMRANK_KEY_STATUS,
  fetchKeys,
  revealKeySecrets,
  updateKey,
  type EmRankKey,
} from "~/services/apiService/emrank/keys"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import {
  createEmRankKeyEditor,
  EMRANK_EXPIRATION_MODES,
  toExpiration,
  type EmRankKeyCommand,
} from "./keyEditor"
import { emrankKeyFields } from "./keyResourceFields"

const ACCOUNT_SCOPE_KEY = "account"

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
) => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

const findKey = async (request: ApiServiceRequest, id: string) => {
  const key = (await fetchKeys(request)).find((key) => key.id === id)
  if (!key) throw new AccountKeyResourceError({ code: failures.NotFound })
  return key
}

const commandQuota = (command: EmRankKeyCommand) =>
  command.unlimited
    ? null
    : Math.round(command.quota * EMRANK_TOKENS_PER_M_TOKEN)

const hasKeyChanges = (command: EmRankKeyCommand, baseline: EmRankKey) =>
  command.name !== baseline.name ||
  commandQuota(command) !== baseline.totalQuota ||
  (command.enabled !== undefined && command.enabled !== baseline.enabled) ||
  command.expirationMode !== EMRANK_EXPIRATION_MODES.Keep

/**
 * Keys are never scoped to a model subset and no plaintext is present in the
 * inventory; `can_copy` rows can still be revealed through the secrets route.
 */
const facts = (
  key: EmRankKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: key.name || `Key ${key.suffix}`,
  maskedLabel: `sk-emr-••••${key.suffix}`,
  runtimeSecret: undefined,
  status:
    key.status === EMRANK_KEY_STATUS.Enabled
      ? statuses.Enabled
      : key.status === EMRANK_KEY_STATUS.Expired
        ? statuses.Expired
        : // `exhausted` and `migration_blocked` have no equivalent app state,
          // so they stay unknown instead of reading as a user-toggleable flag.
          key.status === EMRANK_KEY_STATUS.Disabled
          ? statuses.Disabled
          : statuses.Unknown,
  runtimeKey: {
    modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
    baseUrl: EMRANK_API_BASE_URL,
    createdAt: key.createdAt * 1000,
  },
  fields: [],
  displayFacts: [
    {
      fieldId: emrankKeyFields.Quota,
      kind: "quota",
      role: "total",
      asset: EMRANK_TOKEN_ASSET,
      value: key.totalQuota ?? 0,
      unlimited: key.totalQuota === null,
    },
    {
      fieldId: emrankKeyFields.Remaining,
      kind: "quota",
      role: "remaining",
      asset: EMRANK_TOKEN_ASSET,
      value: key.remainingQuota ?? 0,
      unlimited: key.remainingQuota === null,
    },
    {
      fieldId: emrankKeyFields.Used,
      kind: "quota",
      role: "used",
      asset: EMRANK_TOKEN_ASSET,
      value: key.usedQuota,
    },
    keyExpiryDisplayFact(emrankKeyFields.ExpiresAt, key.expiresAt ?? 0),
  ],
  searchValues: [key.name, key.suffix],
  actions: {
    canUpdate: key.status !== EMRANK_KEY_STATUS.MigrationBlocked,
    canDelete: true,
  },
})

export const emRankKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.EMRANK,
  // PUT is a merge, so a fresh baseline is only needed to detect drift on the
  // fields this editor writes.
  requiresFreshUpdateDetail: hasKeyChanges,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: EMRANK_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: EmRankKey) => key.id,
  locatorFromDetail: (key: EmRankKey) => key.id,
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
      try {
        const key = await findKey(
          withSignal(config.request, options),
          ref.resourceId,
        )
        if (!key.canCopy)
          return {
            kind: "unavailable",
            failure: { code: failures.Unavailable },
          }
        const secrets = await revealKeySecrets(
          withSignal(config.request, options),
          [key.id],
        )
        const secret = secrets.get(key.id)
        return secret?.trim()
          ? { kind: "resolved", secret }
          : {
              kind: "unavailable",
              failure: { code: failures.Unavailable },
            }
      } catch (error) {
        return {
          kind: "unavailable",
          failure: mapAccountKeyResourceFailure(error),
        }
      }
    },
  },
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    createEmRankKeyEditor(undefined, intent),
  editEditor: (_config, _scope, key) =>
    createEmRankKeyEditor({
      name: key.name,
      totalQuota: key.totalQuota,
      expiresAt: key.expiresAt,
      enabled: key.enabled,
    }),
  create: (config, _scope, command: EmRankKeyCommand, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        // Like the other re-viewable sites, the create result carries no
        // one-time secret: the console re-reveals can_copy keys from the
        // inventory, so the new row is the handoff, not a dialog.
        const { key } = await createKey(request, {
          name: command.name,
          totalQuotaTokens: commandQuota(command),
          expiration: toExpiration(command) ?? {
            mode: EMRANK_EXPIRATION_MODES.Never,
          },
        })
        return { detail: key }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (
    config,
    _scope,
    { baseline, current },
    command: EmRankKeyCommand,
    options,
  ) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        if (!hasKeyChanges(command, baseline)) return current
        const expiration = toExpiration(command)
        const quota = commandQuota(command)
        const hasConflict = [
          [baseline.name, current.name, command.name],
          [baseline.totalQuota, current.totalQuota, quota],
          [
            baseline.enabled,
            current.enabled,
            command.enabled ?? baseline.enabled,
          ],
        ].some(
          ([before, latest, desired]) =>
            desired !== before && latest !== before && latest !== desired,
        )
        if (
          hasConflict ||
          (expiration !== undefined && current.expiresAt !== baseline.expiresAt)
        )
          throw new AccountKeyResourceError({ code: failures.ResourceChanged })
        await updateKey(request, baseline.id, {
          ...(command.name !== baseline.name ? { name: command.name } : {}),
          ...(quota !== baseline.totalQuota ? { totalQuotaTokens: quota } : {}),
          ...(expiration ? { expiration } : {}),
          ...(command.enabled !== undefined &&
          command.enabled !== baseline.enabled
            ? { enabled: command.enabled }
            : {}),
        })
        // 204 carries no payload; the written state is confirmed by re-reading.
        return findKey(request, baseline.id)
      },
      mapFailure: mapAccountKeyResourceFailure,

      classifyError: (error) =>
        error instanceof AccountKeyResourceError &&
        error.failure.code === failures.ResourceChanged
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
