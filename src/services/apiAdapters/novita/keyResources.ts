import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAccountCredentialIdentity,
  type AccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentity"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
} from "~/services/accounts/keys/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceProviderFacts } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { RESOURCE_DISPLAY_FACT_KINDS } from "~/services/apiAdapters/contracts/resourceNative"
import { getNovitaSafeErrorMessage } from "~/services/apiAdapters/novita/accountPersistence"
import { novitaKeyEditor } from "~/services/apiAdapters/novita/keyEditor"
import {
  fetchNovitaKeys,
  type NovitaApiKey,
} from "~/services/apiService/novita"
import { parseNovitaCredentials } from "~/services/apiService/novita/constants"
import {
  createNovitaKey,
  deleteNovitaKey,
  fetchNovitaAllowedIps,
  fetchNovitaModelPolicy,
  findNovitaKey,
  setNovitaAllowedIps,
  setNovitaModelPolicy,
  updateNovitaKeyName,
  verifyNovitaManagementIdentity,
  type NovitaModelPolicy,
} from "~/services/apiService/novita/keyManagement"
import { isNovitaConsoleCredential } from "~/services/apiService/novita/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { normalizeToMs } from "~/utils/core/formatters"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

type KeyRow = NovitaApiKey & {
  canManage: boolean
  accountCredentialIdentity: AccountCredentialIdentity
  modelPolicy?: NovitaModelPolicy
  allowedIps?: string[]
}

const inferenceBaseUrl = toProtocolRoot(
  API_TYPES.OPENAI_COMPATIBLE,
  "https://api.novita.ai/openai/v1",
)!

/** Only an explicit empty exclusion summary proves unrestricted model access. */
const hasUnrestrictedModels = (key: NovitaApiKey) =>
  isRecord(key.modelAccessPolicy) &&
  key.modelAccessPolicy.mode === "all_enabled" &&
  key.modelAccessPolicy.excludedModelCount === 0

const runtimeModelAccess = (key: KeyRow) => {
  const policy = key.modelPolicy
  if (!policy)
    return hasUnrestrictedModels(key)
      ? UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS
      : { groups: null, allowedModelIds: [], suggestedModelIds: [] }
  const allowed = policy.allowedModels
    .filter((model) => model.type === "llm")
    .map((model) => model.id)
  return {
    groups: null,
    allowedModelIds: policy.mode === "selected" ? allowed : null,
    deniedModelIds: policy.excludedModels
      .filter((model) => model.type === "llm")
      .map((model) => model.id),
    suggestedModelIds: policy.mode === "selected" ? allowed : [],
  }
}

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)
const uncertainReadback = () =>
  new AccountKeyResourceError({ code: failures.MutationStateUncertain })
const consoleOnlyFailure = () =>
  new AccountKeyResourceError({
    code: failures.AuthenticationFailed,
    message: t("messages:novita.consoleCredentialRequired"),
  })
const requireManagement = (request: ApiServiceRequest) => {
  if (!isNovitaConsoleCredential(request.auth.accessToken))
    throw consoleOnlyFailure()
}
const mutationCertainty = (
  error: unknown,
  dispatched: boolean,
  accepted = false,
) => {
  if (!dispatched) return "not-applied" as const
  const status = error instanceof ApiError ? error.statusCode : undefined
  return !accepted &&
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 499
    ? ("not-applied" as const)
    : ("possibly-applied" as const)
}

/** Hydrates writable policies separately from the lightweight inventory. */
async function detail(request: ApiServiceRequest, id: string): Promise<KeyRow> {
  const key = await findNovitaKey(request, id)
  if (!key) throw new AccountKeyResourceError({ code: failures.NotFound })
  const canManage = isNovitaConsoleCredential(request.auth.accessToken)
  const [modelPolicy, allowedIps] = await Promise.all([
    fetchNovitaModelPolicy(request, id),
    fetchNovitaAllowedIps(request, id),
  ])
  return {
    ...key,
    canManage,
    modelPolicy,
    allowedIps,
    accountCredentialIdentity: credentialIdentity(key, request),
  }
}

/** A mask match is a visible hint, never proof that the row owns this secret. */
const credentialIdentity = (key: NovitaApiKey, request: ApiServiceRequest) =>
  resolveAccountCredentialIdentity({
    accountCredential:
      parseNovitaCredentials(request.auth.accessToken).apiKey || undefined,
    maskedKey: key.maskedKey,
  })

const keyFacts = (
  key: KeyRow,
  ref: AccountKeyResourceRef,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: key.name || key.maskedKey,
  maskedLabel: key.maskedKey,
  runtimeSecret: undefined,
  accountCredentialIdentity: key.accountCredentialIdentity,
  runtimeKey: {
    baseUrl: inferenceBaseUrl,
    modelAccess: runtimeModelAccess(key),
  },
  status:
    !key.isPermanent &&
    (normalizeToMs(key.expireTime) ?? Infinity) <= Date.now()
      ? statuses.Expired
      : statuses.Enabled,
  detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
  fields: [
    {
      fieldId: "key",
      kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: key.maskedKey,
    },
    {
      fieldId: "created_at",
      kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: key.createTime,
    },
  ],
  displayFacts: [
    keyExpiryDisplayFact("expire_time", key.isPermanent ? "" : key.expireTime),
    ...keyLastUsedDisplayFacts(key.lastUsedAt),
    ...(key.allowedIps?.length
      ? [
          {
            fieldId: "allowed_ips",
            kind: "restriction" as const,
            role: "ip" as const,
            value: key.allowedIps,
          },
        ]
      : []),
  ],
  searchValues: [key.name, key.maskedKey, key.stringId],
  actions: { canUpdate: true, canDelete: key.canManage },
})

/**
 * Console bearers cover native key CRUD. sk_ OpenAPI keys can edit model/IP
 * policies, but cannot create, rename or delete keys.
 * Plaintext is available only once. Never expose the console bearer as a key.
 */
export const novitaAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.NOVITA,
  defaultCreation: ACCOUNT_KEY_DEFAULT_CREATION_POLICIES.EditorDefaults,
  operations: (auth) => ({
    create: isNovitaConsoleCredential(auth.accessToken),
    update: true,
    delete: isNovitaConsoleCredential(auth.accessToken),
  }),
  requiresFreshUpdateDetail: () => true,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  openConfig: async (input: AccountKeyResourceOpenInput) => ({
    account: input.account,
    request: input.request,
  }),
  listScopes: async () => [
    {
      scopeKey: "default",
      routeKey: "default",
      displayName: "Novita AI",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "default",
  runtimeKey: {
    resolve: async () => ({
      kind: "unavailable",
      failure: { code: failures.Unavailable },
    }),
  },
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: KeyRow) => key.stringId,
  locatorFromDetail: (key: KeyRow) => key.stringId,
  list: async (config, _scope, _query, options) => {
    const request = {
      ...config.request,
      abortSignal: options?.signal ?? config.request.abortSignal,
    }
    const items = await Promise.all(
      (await fetchNovitaKeys(request)).map(async (key) => ({
        ...key,
        canManage: isNovitaConsoleCredential(request.auth.accessToken),
        accountCredentialIdentity: credentialIdentity(key, request),
        ...(!hasUnrestrictedModels(key)
          ? { modelPolicy: await fetchNovitaModelPolicy(request, key.stringId) }
          : {}),
      })),
    )
    return { items, total: items.length }
  },
  get: (config, _scope, id, options) =>
    detail(
      {
        ...config.request,
        abortSignal: options?.signal ?? config.request.abortSignal,
      },
      id,
    ),
  toListFacts: keyFacts,
  toDetailFacts: keyFacts,
  createEditor: async (config, _scope, _options, _inventory, intent) => {
    requireManagement(config.request)
    return novitaKeyEditor(config.request, undefined, intent?.nameHint)
  },
  editEditor: (config, _scope, key: KeyRow) => {
    if (!key.modelPolicy || !key.allowedIps) throw uncertainReadback()
    return novitaKeyEditor(config.request, {
      name: key.name,
      modelPolicy: key.modelPolicy,
      allowedIps: key.allowedIps,
      canRename: key.canManage,
    })
  },
  create: async (config, scope, command, options) => {
    const request = {
      ...config.request,
      abortSignal: options?.signal ?? config.request.abortSignal,
    }
    let dispatched = false
    let createdId: string | undefined
    try {
      requireManagement(request)
      await verifyNovitaManagementIdentity(request, true)
      const hours =
        { permanent: 0, "90d": 2160, "30d": 720, "24h": 24 }[
          command.lifecycle
        ] ?? 0
      dispatched = true
      const created = await createNovitaKey(request, {
        name: command.name,
        expireTime: hours
          ? new Date(Date.now() + hours * 3600000)
              .toISOString()
              .slice(0, 19)
              .replace("T", " ")
          : "",
      })
      createdId = created.id
      const hasPolicy =
        command.modelPolicy.mode !== "all_enabled" ||
        command.modelPolicy.excludedModels.length > 0
      if (hasPolicy) {
        await setNovitaModelPolicy(request, created.id, command.modelPolicy)
        if (
          !same(
            await fetchNovitaModelPolicy(request, created.id),
            command.modelPolicy,
          )
        )
          throw uncertainReadback()
      }
      if (command.allowedIps.length) {
        await setNovitaAllowedIps(request, created.id, command.allowedIps)
        if (
          !same(
            await fetchNovitaAllowedIps(request, created.id),
            command.allowedIps,
          )
        )
          throw uncertainReadback()
      }
      // Preserve the one-time secret when the subsequent inventory read fails.
      const key = await findNovitaKey(request, created.id).catch(
        () => undefined,
      )
      const credential = {
        accountName: config.account.name ?? "Novita AI",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: inferenceBaseUrl,
        tagIds: [],
      }
      return {
        certainty: "applied",
        value: {
          detail: key
            ? {
                ...key,
                canManage: true,
                modelPolicy: command.modelPolicy,
                accountCredentialIdentity: credentialIdentity(key, request),
              }
            : null,
          createdSecret: key
            ? createAccountKeyResourceCreatedRuntimeSecret({
                ref: {
                  accountId: config.account.id,
                  siteType: SITE_TYPES.NOVITA,
                  scopeKey: scope.scopeKey,
                  resourceId: created.id,
                },
                displayName: command.name,
                secret: created.apiKey,
                credential,
              })
            : createUnattributedAccountCreatedRuntimeSecret({
                accountId: config.account.id,
                displayName: command.name,
                secret: created.apiKey,
                credential,
              }),
        },
      }
    } catch (error) {
      // Compensate only an ID proven created by this operation. Do not offer
      // retry unless readback establishes the failed creation was removed.
      if (createdId) {
        try {
          const cleanup = { ...request, abortSignal: undefined }
          await verifyNovitaManagementIdentity(cleanup, true)
          await deleteNovitaKey(cleanup, createdId)
          if (!(await findNovitaKey(cleanup, createdId)))
            return { certainty: "not-applied", failure: error }
        } catch {
          /* The original failure remains uncertain. */
        }
      }
      return {
        certainty: mutationCertainty(error, dispatched, Boolean(createdId)),
        failure: error,
      }
    }
  },
  update: async (
    config,
    _scope,
    state: { baseline: KeyRow; current: KeyRow },
    command,
    options,
  ) => {
    const request = {
      ...config.request,
      abortSignal: options?.signal ?? config.request.abortSignal,
    }
    let dispatched = false
    let accepted = false
    try {
      const baseline = state.baseline
      const current = state.current
      const changeName = command.name !== baseline.name
      await verifyNovitaManagementIdentity(request, changeName)
      if (changeName) requireManagement(request)
      const changeModels = !same(command.modelPolicy, baseline.modelPolicy)
      const changeIps = !same(command.allowedIps, baseline.allowedIps)
      if (
        (changeName && current.name !== baseline.name) ||
        (changeModels && !same(current.modelPolicy, baseline.modelPolicy)) ||
        (changeIps && !same(current.allowedIps, baseline.allowedIps))
      ) {
        throw new AccountKeyResourceError({
          code: failures.ResourceChanged,
          message: t("messages:novita.keyChanged"),
        })
      }
      if (changeName) {
        dispatched = true
        await updateNovitaKeyName(request, current.stringId, command.name)
        accepted = true
      }
      if (changeModels) {
        dispatched = true
        await setNovitaModelPolicy(
          request,
          current.stringId,
          command.modelPolicy,
        )
        accepted = true
      }
      if (changeIps) {
        dispatched = true
        await setNovitaAllowedIps(request, current.stringId, command.allowedIps)
        accepted = true
      }
      const updated = await detail(request, current.stringId)
      if (
        (changeName && updated.name !== command.name) ||
        (changeModels && !same(updated.modelPolicy, command.modelPolicy)) ||
        (changeIps && !same(updated.allowedIps, command.allowedIps))
      )
        throw uncertainReadback()
      return { certainty: "applied", value: updated }
    } catch (error) {
      return {
        certainty: mutationCertainty(error, dispatched, accepted),
        failure: error,
      }
    }
  },
  delete: async (config, _scope, id, options) => {
    const request = {
      ...config.request,
      abortSignal: options?.signal ?? config.request.abortSignal,
    }
    let dispatched = false
    let accepted = false
    try {
      requireManagement(request)
      await verifyNovitaManagementIdentity(request, true)
      dispatched = true
      await deleteNovitaKey(request, id)
      accepted = true
      if (await findNovitaKey(request, id)) throw uncertainReadback()
      return { certainty: "applied", value: undefined }
    } catch (error) {
      return {
        certainty: mutationCertainty(error, dispatched, accepted),
        failure: error,
      }
    }
  },
  mapFailure: (error) => {
    if (error instanceof AccountKeyResourceError)
      return mapAccountKeyResourceFailure(error)
    if (
      error instanceof ApiError &&
      error.code === API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH
    )
      return {
        code: failures.AuthenticationFailed,
        message: t("accountDialog:messages.autoDetectIdentityMismatch"),
      }
    const mapped = mapAccountKeyResourceFailure(error)
    return {
      code: mapped.code,
      message: getNovitaSafeErrorMessage(
        error,
        t("messages:novita.malformedResponse"),
      ),
    }
  },
})
