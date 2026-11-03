import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import {
  NANOGPT_DISPLAY_NAME,
  NANOGPT_INFERENCE_BASE_URL,
} from "~/services/accountSiteDefinitions/identifiers"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { nanoGptKeyEditor } from "~/services/apiAdapters/nanogpt/keyEditor"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { NANOGPT_KEY_STATUSES } from "~/services/apiService/nanogpt/constants"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import {
  createNanoGptKey,
  deleteNanoGptKey,
  fetchNanoGptKey,
  fetchNanoGptKeys,
  NANOGPT_KEY_LIMIT_FIELDS,
  updateNanoGptKey,
  type NanoGptKey,
  type NanoGptKeyWrite,
} from "~/services/apiService/nanogpt/management"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"

const facts = (
  key: NanoGptKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => ({
  ref,
  detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
  displayName: key.name,
  maskedLabel: `#${key.id}`,
  status: key.status === NANOGPT_KEY_STATUSES.Active ? "enabled" : "expired",
  runtimeSecret: undefined,
  runtimeKey: {
    modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
    baseUrl: NANOGPT_INFERENCE_BASE_URL,
    createdAt: Date.parse(key.created_at),
  },
  fields: [
    { fieldId: "zdr_policy", kind: "text", value: key.zdr_policy },
    ...NANOGPT_KEY_LIMIT_FIELDS.filter((field) => key[field] !== null).map(
      (field) => ({
        fieldId: field,
        kind: "number" as const,
        value: key[field]!,
      }),
    ),
  ],
  displayFacts: [
    {
      fieldId: "expires_at",
      kind: "expiry",
      timestampMs:
        key.expires_at === null ? "never" : Date.parse(key.expires_at),
    },
  ],
  actions: { canUpdate: true, canDelete: true },
})
const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
) => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

/** Permissions are enforced by the provider; a read-only token's 403 is not invalid authentication. */
export const nanoGptKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.NANOGPT,
  operations: (auth) => {
    const available = Boolean(
      parseNanoGptCredentials(auth.accessToken).managementToken,
    )
    return { create: available, update: available, delete: available }
  },
  defaultCreation: ACCOUNT_KEY_DEFAULT_CREATION_POLICIES.RequiresInput,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.WebsiteVerification,
  requiresFreshUpdateDetail: () => true,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: "account",
      routeKey: "account",
      displayName: NANOGPT_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "account",
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: NanoGptKey) => key.id,
  locatorFromDetail: (key: NanoGptKey) => key.id,
  list: async (config, _scope, _query, options) => {
    // Inference-only accounts remain usable; remote inventory is optional.
    if (
      !parseNanoGptCredentials(config.request.auth.accessToken).managementToken
    )
      return { items: [], total: 0 }
    const items = await fetchNanoGptKeys(withSignal(config.request, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    fetchNanoGptKey(withSignal(config.request, options), id),
  toListFacts: facts,
  toDetailFacts: facts,
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    nanoGptKeyEditor(undefined, intent?.nameHint),
  editEditor: (_config, _scope, detail) => nanoGptKeyEditor(detail),
  create: (config, scope, command: Partial<NanoGptKeyWrite>, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      mapFailure: mapAccountKeyResourceFailure,
      execute: async (request) => {
        const created = await createNanoGptKey(request, command)
        const ref = {
          accountId: config.account.id,
          siteType: SITE_TYPES.NANOGPT,
          scopeKey: scope.scopeKey,
          resourceId: created.key.id,
        }
        return {
          detail: created.key,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref,
            displayName: created.key.name,
            secret: created.secret,
            secretAvailability:
              INVENTORY_SECRET_AVAILABILITIES.WebsiteVerification,
            credential: {
              accountName: config.account.name ?? NANOGPT_DISPLAY_NAME,
              apiType: API_TYPES.OPENAI_COMPATIBLE,
              baseUrl: NANOGPT_INFERENCE_BASE_URL,
              tagIds: [],
            },
          }),
        }
      },
    }),
  update: (
    config,
    _scope,
    { current },
    command: Partial<NanoGptKeyWrite>,
    options,
  ) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      mapFailure: mapAccountKeyResourceFailure,
      execute: async (request) => {
        if (!Object.keys(command).length) return current
        await updateNanoGptKey(request, current.id, command)
        const confirmed = await fetchNanoGptKey(request, current.id)
        for (const [field, value] of Object.entries(command)) {
          const actual = confirmed[field as keyof NanoGptKey]
          const matches =
            field === "expires_at" &&
            typeof actual === "string" &&
            typeof value === "string"
              ? Date.parse(actual) === Date.parse(value)
              : actual === value
          if (!matches)
            throw new AccountKeyResourceError({
              code: failures.MutationStateUncertain,
            })
        }
        return confirmed
      },
    }),
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: (request) => deleteNanoGptKey(request, id),
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
