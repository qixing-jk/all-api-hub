import { SITE_TYPES } from "~/constants/siteType"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_RESOURCE_LOCAL_METADATA,
  AccountKeyResourceError,
  ACCOUNT_KEY_RESOURCE_EDIT_ACTIONS as editActions,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES as failures,
  ACCOUNT_KEY_RESOURCE_STATUSES as statuses,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type {
  AccountKeyResourceFacts,
  AccountKeyResourceOpenInput,
  AccountKeyResourceRef,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES as secretAvailability } from "~/services/apiAdapters/contracts/inventorySecret"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  DAHL_KEY_RESOURCE_FIELDS as fields,
  DAHL_KEY_NAME_SYNC_STATES as nameSyncStates,
  type DahlKeyNameSyncState,
} from "~/services/apiAdapters/dahl/keyResourceFields"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import {
  createKey,
  fetchKeys,
  fetchTokenPool,
  revokeKey,
  transferKeyTokens,
  type DahlKey,
  type DahlKeyTransfer,
} from "~/services/apiService/dahl"
import { DAHL_KEY_STATUSES } from "~/services/apiService/dahl/constants"
import { parseDahlTokenAmount } from "~/services/apiService/dahl/tokenAmount"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { API_TYPES } from "~/services/verification/aiApiVerification"

import {
  readDahlKeyNames,
  removeDahlKeyName,
  saveDahlKeyName,
} from "./keyNames"
import { scheduleDahlKeyNameSync, syncDahlKeyNames } from "./keyNameSync"
import { dahlKeyNameOwner, isValidDahlKeyName } from "./keyNameValue"

type NamedKey = { key: DahlKey; name: string; nameSync: DahlKeyNameSyncState }
type FundingDetail = NamedKey & { poolTokens: number }
type RenameDetail = {
  kind: typeof editActions.Rename
  keyId: number
  name: string
  nameSync: DahlKeyNameSyncState
  facts: AccountKeyResourceFacts
}
type Detail = FundingDetail | RenameDetail
const TRANSFER_COMMAND_KIND = "transfer"

export const DAHL_KEY_SCOPE = "default"

type UpdateCommand =
  | { kind: typeof editActions.Rename; name: string }
  | {
      kind: typeof TRANSFER_COMMAND_KIND
      baseline: DahlKey
      transfer: DahlKeyTransfer
    }
const nameField = {
  fieldId: fields.Name,
  type: RESOURCE_FIELD_TYPES.Text,
} as const
const nameValidation = (name: unknown) =>
  isValidDahlKeyName(name)
    ? { valid: true as const }
    : {
        valid: false as const,
        issues: [
          {
            fieldId: fields.Name,
            code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
          },
        ],
      }

/** Project local and website names without changing native key or funding facts. */
async function namedKeys(
  request: ApiServiceRequest,
  keys: DahlKey[],
): Promise<NamedKey[]> {
  const { names, connected } = await syncDahlKeyNames(
    request,
    keys.map((key) => key.id),
  )
  return keys.map((key) => ({
    key,
    name: names[String(key.id)]?.name ?? "",
    nameSync: names[String(key.id)]?.pending
      ? nameSyncStates.Pending
      : connected
        ? nameSyncStates.Synced
        : nameSyncStates.Cached,
  }))
}

const keyDisplayName = (id: number, name: string) => name || `Dahl #${id}`

const facts = (
  detail: NamedKey | RenameDetail,
  ref: AccountKeyResourceRef,
): AccountKeyResourceFacts => {
  if ("kind" in detail)
    return {
      ...detail.facts,
      ref,
      displayName: keyDisplayName(detail.keyId, detail.name),
    }
  const { key, name } = detail
  return {
    ref,
    displayName: keyDisplayName(key.id, name),
    maskedLabel: key.masked,
    status:
      key.status === DAHL_KEY_STATUSES.Active
        ? statuses.Enabled
        : statuses.Disabled,
    runtimeKey: {
      modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
      baseUrl: `${DAHL_WEB_ORIGIN}/v1`,
      createdAt: Date.parse(key.created_at),
    },
    fields: [],
    displayFacts: [
      {
        fieldId: "available_tokens",
        kind: "credits",
        value: key.available_tokens,
      },
    ],
    actions: {
      canUpdate: key.status !== DAHL_KEY_STATUSES.Revoked,
      canDelete: key.status !== DAHL_KEY_STATUSES.Revoked,
    },
  }
}

/** Use accepted name metadata without a foreground website read. */
async function cachedName(request: ApiServiceRequest, id: number) {
  const entry = (await readDahlKeyNames(dahlKeyNameOwner(request)))[String(id)]
  return {
    name: entry?.name ?? "",
    nameSync: entry?.pending
      ? nameSyncStates.Pending
      : entry
        ? nameSyncStates.Synced
        : nameSyncStates.Cached,
  }
}

/** Scope adapter I/O to the editor operation without discarding the account signal. */
function operationRequest(
  config: AccountKeyResourceOpenInput,
  options?: ResourceOperationOptions,
): ApiServiceRequest {
  return {
    ...config.request,
    abortSignal: options?.signal ?? config.request.abortSignal,
  }
}

/** Funding alone needs fresh balances; independent requests can run together. */
async function fundingDetail(
  config: AccountKeyResourceOpenInput,
  id: string,
  options?: ResourceOperationOptions,
): Promise<FundingDetail> {
  const request = operationRequest(config, options)
  const [keys, poolTokens] = await Promise.all([
    fetchKeys(request),
    fetchTokenPool(request),
  ])
  const key = keys.find(
    (key) => String(key.id) === id && key.status !== DAHL_KEY_STATUSES.Revoked,
  )
  if (!key) throw new AccountKeyResourceError({ code: failures.NotFound })
  return { key, poolTokens, ...(await cachedName(request, key.id)) }
}

const fundingEditor = (
  detail: FundingDetail,
  direction: DahlKeyTransfer["direction"],
): AccountKeyResourceEditorDefinition<UpdateCommand> => ({
  fields: [
    {
      fieldId: fields.TransferDirection,
      type: RESOURCE_FIELD_TYPES.Text,
      readOnly: true,
    },
    {
      fieldId: fields.TransferAmount,
      type: RESOURCE_FIELD_TYPES.Text,
      required: true,
    },
    {
      fieldId: fields.PoolTokens,
      type: RESOURCE_FIELD_TYPES.Number,
      readOnly: true,
    },
    {
      fieldId: fields.KeyTokens,
      type: RESOURCE_FIELD_TYPES.Number,
      readOnly: true,
    },
    {
      fieldId: fields.KeyMask,
      type: RESOURCE_FIELD_TYPES.Text,
      readOnly: true,
    },
  ],
  initialValues: {
    [fields.TransferDirection]: direction,
    [fields.TransferAmount]: "",
    [fields.PoolTokens]: detail.poolTokens,
    [fields.KeyTokens]: detail.key.available_tokens,
    [fields.KeyMask]: detail.key.masked,
  },
  validate: (values) => {
    const amount = parseDahlTokenAmount(values[fields.TransferAmount])
    return values[fields.TransferDirection] === direction &&
      amount !== null &&
      amount <=
        (direction === editActions.Allocate
          ? detail.poolTokens
          : detail.key.available_tokens) &&
      Number.isSafeInteger(detail.key.available_tokens + amount)
      ? { valid: true }
      : {
          valid: false,
          issues: [
            {
              fieldId: fields.TransferAmount,
              code: RESOURCE_FIELD_ISSUE_CODES.OutOfRange,
            },
          ],
        }
  },
  buildCommand: (values) => ({
    kind: TRANSFER_COMMAND_KIND,
    baseline: detail.key,
    transfer: {
      direction,
      amount: parseDahlTokenAmount(values[fields.TransferAmount])!,
    },
  }),
})

export const dahlKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.DAHL,
  inventorySecretAvailability: secretAvailability.Recoverable,
  // New native keys have no tokens; automatic creation must not promise a usable key.
  defaultCreation: "requires-input",
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: DAHL_KEY_SCOPE,
      routeKey: DAHL_KEY_SCOPE,
      displayName: "Dahl",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => DAHL_KEY_SCOPE,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (item: NamedKey) => String(item.key.id),
  locatorFromDetail: (detail: Detail) =>
    String("kind" in detail ? detail.keyId : detail.key.id),
  list: async (config) => {
    const keys = await fetchKeys(config.request)
    const items = (await namedKeys(config.request, keys)).filter(
      (item) => item.key.status !== DAHL_KEY_STATUSES.Revoked,
    )
    return { items, total: items.length }
  },
  get: (config, _scope, id, options): Promise<Detail> =>
    fundingDetail(config, id, options),
  getEditDetail: async (
    config,
    scope,
    id,
    options,
    intent,
  ): Promise<Detail> => {
    if (intent?.action !== editActions.Rename)
      return fundingDetail(config, id, options)
    if (
      !Number.isSafeInteger(Number(id)) ||
      Number(id) <= 0 ||
      String(Number(id)) !== id
    )
      throw new AccountKeyResourceError({ code: failures.ValidationFailed })
    const ref = {
      accountId: config.account.id,
      siteType: SITE_TYPES.DAHL,
      scopeKey: scope.scopeKey,
      resourceId: id,
    }
    const snapshot =
      intent.snapshot ?? facts(await fundingDetail(config, id, options), ref)
    if (!snapshot.actions.canUpdate)
      throw new AccountKeyResourceError({ code: failures.NotFound })
    return {
      kind: editActions.Rename,
      keyId: Number(id),
      facts: snapshot,
      ...(await cachedName(config.request, Number(id))),
    }
  },
  runtimeKey: {
    resolve: async (config, ref, options) => {
      const key = (await fetchKeys(operationRequest(config, options))).find(
        (key) => String(key.id) === ref.resourceId,
      )
      return key?.token && key.status !== DAHL_KEY_STATUSES.Revoked
        ? { kind: "resolved", secret: key.token }
        : { kind: "unavailable" }
    },
  },
  toListFacts: facts,
  toDetailFacts: (detail: Detail, ref) => facts(detail, ref),
  createEditor: async (_config, _scope, _options, _inventory, intent) => ({
    fields: [nameField],
    initialValues: { [fields.Name]: intent?.nameHint ?? "" },
    validate: (values) => nameValidation(values[fields.Name]),
    buildCommand: (values) => String(values[fields.Name] ?? "").trim(),
  }),
  editEditor: (_config, _scope, detail, intent) =>
    "kind" in detail
      ? {
          mutationKind: ACCOUNT_KEY_RESOURCE_LOCAL_METADATA,
          fields: [
            nameField,
            {
              fieldId: fields.NameSync,
              type: RESOURCE_FIELD_TYPES.Text,
              readOnly: true,
            },
          ],
          initialValues: {
            [fields.Name]: detail.name,
            [fields.NameSync]: detail.nameSync,
            [fields.TransferDirection]: editActions.Rename,
          },
          validate: (values) => nameValidation(values[fields.Name]),
          buildCommand: (values) => ({
            kind: editActions.Rename,
            name: String(values[fields.Name] ?? "").trim(),
          }),
        }
      : fundingEditor(
          detail,
          intent?.action === editActions.Return
            ? editActions.Return
            : editActions.Allocate,
        ),
  create: (config, scope, name, options) =>
    runNativeResourceMutation({
      request: operationRequest(config, options),
      mapFailure: mapAccountKeyResourceFailure,
      execute: async (request) => {
        const poolTokens = await fetchTokenPool(request)
        const key = await createKey(request)
        if (name) await saveDahlKeyName(dahlKeyNameOwner(request), key.id, name)
        const detail: FundingDetail = {
          ...(await namedKeys(request, [key]))[0]!,
          poolTokens,
        }
        return {
          detail,
          ...(key.token
            ? {
                createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
                  ref: {
                    accountId: config.account.id,
                    siteType: SITE_TYPES.DAHL,
                    scopeKey: scope.scopeKey,
                    resourceId: String(key.id),
                  },
                  displayName: keyDisplayName(key.id, name),
                  secret: key.token,
                  secretAvailability: secretAvailability.Recoverable,
                  credential: {
                    accountName: config.account.name ?? "Dahl",
                    apiType: API_TYPES.OPENAI_COMPATIBLE,
                    baseUrl: toProtocolRoot(
                      API_TYPES.OPENAI_COMPATIBLE,
                      `${DAHL_WEB_ORIGIN}/v1`,
                    )!,
                    tagIds: [],
                  },
                }),
              }
            : {}),
        }
      },
    }),
  update: async (config, _scope, detail, command, options) => {
    if (command.kind === editActions.Rename) {
      if (!("kind" in detail))
        throw new AccountKeyResourceError({ code: failures.ValidationFailed })
      await saveDahlKeyName(
        dahlKeyNameOwner(config.request),
        detail.keyId,
        command.name,
      )
      scheduleDahlKeyNameSync(config.request, detail.keyId)
      return {
        certainty: "applied",
        value: {
          ...detail,
          name: command.name,
          nameSync: nameSyncStates.Pending,
        },
      }
    }
    if ("kind" in detail)
      throw new AccountKeyResourceError({ code: failures.ValidationFailed })
    return runNativeResourceMutation({
      request: operationRequest(config, options),
      mapFailure: mapAccountKeyResourceFailure,
      execute: async (request) => ({
        key: await transferKeyTokens(
          request,
          command.baseline,
          command.transfer,
        ),
        poolTokens: await fetchTokenPool(request),
        name: detail.name,
        nameSync: detail.nameSync,
      }),
    })
  },
  delete: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: operationRequest(config, options),
      mapFailure: mapAccountKeyResourceFailure,
      execute: async (request) => {
        await revokeKey(request, id)
        const owner = dahlKeyNameOwner(request)
        await saveDahlKeyName(owner, Number(id), "")
        if ((await syncDahlKeyNames(request, [Number(id)])).connected)
          await removeDahlKeyName(owner, id)
      },
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
