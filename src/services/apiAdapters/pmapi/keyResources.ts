import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_GROUP_EMPTY_VALUES,
  ACCOUNT_KEY_MUTATION_CERTAINTIES,
  AccountKeyResourceError,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failureCodes,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import {
  PMAPI_KEY_NEVER_EXPIRES,
  PMAPI_KEY_STATUSES,
} from "~/services/apiService/pmapi/constants"
import {
  createPmApiKey,
  deletePmApiKey,
  fetchPmApiGroupCatalog,
  fetchPmApiKeys,
  fetchPmApiTokenGroups,
  findPmApiKey,
  regeneratePmApiKey,
  setPmApiKeyStatus,
  updatePmApiKey,
  type PmApiKey,
  type PmApiKeyInput,
} from "~/services/apiService/pmapi/keys"
import { fetchPmApiModels } from "~/services/apiService/pmapi/models"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import {
  createPmApiKeyEditor,
  editPmApiKeyEditor,
  type PmApiKeyEditCommand,
} from "./keyEditor"
import { PMAPI_KEY_FACT_FIELDS as factFields } from "./keyResourceFields"

const ACCOUNT_SCOPE_KEY = "account"

/**
 * The token form's usable groups joined with the pricing page's labels, so
 * the editor lists exactly the console's own names ("神秘免费分组喵") and
 * ratios instead of bare ids.
 */
const fetchEditorGroups = async (request: ApiServiceRequest) => {
  const [usable, catalog] = await Promise.all([
    fetchPmApiTokenGroups(request),
    fetchPmApiGroupCatalog(request).catch(() => []),
  ])
  const metadata = new Map(catalog.map((group) => [group.name, group]))
  return usable.map((group) => metadata.get(group.name) ?? group)
}

const withSignal = (
  request: ApiServiceRequest,
  options?: { signal?: AbortSignal },
): ApiServiceRequest => ({
  ...request,
  ...(options?.signal ? { abortSignal: options.signal } : {}),
})

/** One correlation and credential projection for create and rotation responses. */
const createdSecret = (
  account: AccountKeyResourceOpenInput["account"],
  scopeKey: string,
  key: Pick<PmApiKey, "id" | "name">,
  secret: string,
  baseUrl: string,
) =>
  createAccountKeyResourceCreatedRuntimeSecret({
    ref: {
      accountId: account.id,
      siteType: SITE_TYPES.PMAPI,
      scopeKey,
      resourceId: String(key.id),
    },
    displayName: key.name || `PM-API #${key.id}`,
    secret,
    credential: {
      accountName: account.name ?? "PM-API",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      // Same-origin inference mount: the deployment origin owns `/v1`.
      baseUrl: toProtocolRoot(API_TYPES.OPENAI_COMPATIBLE, baseUrl)!,
      tagIds: [],
    },
  })

/**
 * The console's own status mapping: `1` stays enabled unless its expiry has
 * passed (the console renders 已过期 then), `3` is expired, `2`/`4` are not
 * usable.
 */
const toFactStatus = (key: PmApiKey) =>
  key.status === PMAPI_KEY_STATUSES.Expired ||
  (key.status === PMAPI_KEY_STATUSES.Enabled &&
    key.expiredAt !== PMAPI_KEY_NEVER_EXPIRES &&
    key.expiredAt > 0 &&
    key.expiredAt * 1000 < Date.now())
    ? statuses.Expired
    : key.status === PMAPI_KEY_STATUSES.Enabled
      ? statuses.Enabled
      : statuses.Disabled

const facts = (
  key: PmApiKey,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: key.name || `PM-API #${key.id}`,
  maskedLabel: maskSecretForDisplay(key.key),
  runtimeSecret: key.key,
  status: toFactStatus(key),
  detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
  runtimeKey: {
    modelAccess: {
      groups: key.grp ? [key.grp] : [],
      allowedModelIds: key.models ? key.models.split(",") : null,
      suggestedModelIds: [],
    },
    createdAt: key.createdAt * 1000,
  },
  fields: [],
  displayFacts: [
    {
      fieldId: "quota",
      kind: "money",
      role: "remaining",
      amountUsd: key.unlimited
        ? 0
        : Math.max(0, key.remainQuota) / QUOTA_PER_USD,
      unlimited: key.unlimited,
    },
    {
      fieldId: "used",
      kind: "money",
      role: "used",
      amountUsd: key.usedQuota / QUOTA_PER_USD,
    },
    keyExpiryDisplayFact("expiry", key.expiredAt),
    ...keyLastUsedDisplayFacts(key.accessedAt),
    {
      fieldId: factFields.Group,
      kind: "group",
      value: key.grp,
      emptyValue: ACCOUNT_KEY_GROUP_EMPTY_VALUES.AccountGroup,
    },
    ...(key.models
      ? [
          {
            fieldId: factFields.Models,
            kind: "restriction" as const,
            role: "models" as const,
            value: key.models.split(","),
          },
        ]
      : []),
    ...(key.subnet
      ? [
          {
            fieldId: factFields.Subnet,
            kind: "restriction" as const,
            role: "subnet" as const,
            value: key.subnet.split(","),
          },
        ]
      : []),
    ...(key.rpm > 0
      ? [
          {
            fieldId: factFields.Rpm,
            kind: "rate-limit" as const,
            rpm: key.rpm,
            concurrency: 0,
          },
        ]
      : []),
  ],
  searchValues: [
    String(key.id),
    key.name,
    maskSecretForDisplay(key.key),
    key.grp,
  ],
  actions: {
    canUpdate: true,
    canDelete: true,
    canRotate: true,
    canEnable: key.status === PMAPI_KEY_STATUSES.Disabled,
    canDisable: key.status === PMAPI_KEY_STATUSES.Enabled,
  },
})

/** Fields a full edit replaces; used to detect concurrent native edits. */
const editableProjection = (key: PmApiKey) => ({
  name: key.name,
  grp: key.grp,
  unlimited: key.unlimited,
  remainQuota: key.remainQuota,
  expiredAt: key.expiredAt,
  models: key.models,
  subnet: key.subnet,
  rpm: key.rpm,
  status: key.status,
})

export const pmApiKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.PMAPI,
  // The update route merges partial payloads, so a fresh read is required
  // before every full-form write instead of trusting a UI snapshot.
  requiresFreshUpdateDetail: () => true,
  inventorySecretAvailability: INVENTORY_SECRET_AVAILABILITIES.Recoverable,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: "PM-API",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: PmApiKey) => String(key.id),
  locatorFromDetail: (key: PmApiKey) => String(key.id),
  list: async (config, _scope, _query, options) => {
    const items = await fetchPmApiKeys(withSignal(config.request, options))
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    findPmApiKey(withSignal(config.request, options), id),
  getEditDetail: async (config, _scope, id, options) => {
    const request = withSignal(config.request, options)
    const [detail, groups, models] = await Promise.all([
      findPmApiKey(request, id),
      fetchEditorGroups(request),
      fetchPmApiModels(request),
    ])
    return { ...detail, editorGroups: groups, editorModels: models }
  },
  toListFacts: facts,
  toDetailFacts: facts,
  runtimeKey: {
    async resolve(config, ref, options) {
      const key = await findPmApiKey(
        withSignal(config.request, options),
        ref.resourceId,
      )
      if (!hasUsableApiTokenKey(key.key))
        return {
          kind: "unavailable" as const,
          failure: { code: failureCodes.Unavailable },
        }
      return { kind: "resolved" as const, secret: key.key }
    },
  },
  createEditor: async (config, _scope, options, _inventory, intent) => {
    const request = withSignal(config.request, options)
    const [groups, models] = await Promise.all([
      fetchEditorGroups(request),
      fetchPmApiModels(request),
    ])
    return createPmApiKeyEditor({
      groups,
      models,
      nameHint: intent?.nameHint,
    })
  },
  editEditor: (_config, _scope, detail: PmApiKey, intent) =>
    editPmApiKeyEditor(detail, intent),
  create: (config, scope, command: PmApiKeyInput, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        const { secret, item } = await createPmApiKey(request, command)
        return {
          detail: item,
          createdSecret: createdSecret(
            config.account,
            scope.scopeKey,
            item,
            secret,
            request.baseUrl,
          ),
        }
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  update: (
    config,
    scope,
    { baseline, current },
    command: PmApiKeyEditCommand,
    options,
  ) => {
    // Rotation is confirmed by the response-only plaintext secret, so it is
    // surfaced through the wrapper's top-level createdSecret slot.
    let rotatedSecret: ReturnType<typeof createdSecret> | undefined
    return runNativeResourceMutation({
      request: withSignal(config.request, options),
      async execute(request) {
        if (command.rotate) {
          const secret = await regeneratePmApiKey(request, String(current.id))
          const rotated = await findPmApiKey(request, String(current.id))
          rotatedSecret = createdSecret(
            config.account,
            scope.scopeKey,
            rotated,
            secret,
            request.baseUrl,
          )
          return rotated
        }
        const payload = command.payload
        // Lifecycle toggles reuse the console's own minimal `{status}` write.
        if (payload.status !== undefined && Object.keys(payload).length === 1) {
          return setPmApiKeyStatus(request, String(current.id), payload.status)
        }
        // A full-form write replaces every editable field; refuse when the
        // resource moved under the open dialog instead of clobbering it.
        if (
          JSON.stringify(editableProjection(baseline)) !==
          JSON.stringify(editableProjection(current))
        )
          throw new AccountKeyResourceError({
            code: failureCodes.ResourceChanged,
          })
        // The console's own edit dialog never sends `status`; omitted fields
        // keep their server values.
        const full = payload as PmApiKeyInput
        return updatePmApiKey(request, String(current.id), full)
      },
      mapFailure: mapAccountKeyResourceFailure,
      classifyError: (error) =>
        error instanceof AccountKeyResourceError &&
        error.failure.code === failureCodes.ResourceChanged
          ? ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied
          : undefined,
    }).then((result) => ({
      ...result,
      ...(rotatedSecret ? { createdSecret: rotatedSecret } : {}),
    }))
  },
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: withSignal(config.request, options),
      execute: async (request) => {
        await deletePmApiKey(request, id)
      },
      mapFailure: mapAccountKeyResourceFailure,
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
