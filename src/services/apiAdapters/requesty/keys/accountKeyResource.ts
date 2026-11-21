import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAccountCredentialIdentity,
  type AccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentity"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import {
  REQUESTY_API_BASE_URL,
  REQUESTY_DISPLAY_NAME,
} from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import {
  ASSET_KINDS,
  BUDGET_LIMIT_STATES,
  BUDGET_PERIODS,
  BUDGET_WINDOW_KINDS,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import { keyBudgetFact } from "~/services/apiAdapters/accountKeyResources/budgetFacts"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import { keyExpiryDisplayFact } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_PERMISSION_ROLES,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES as creationPolicies,
  type AccountKeyResourceOpenInput,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { NATIVE_RESOURCE_MUTATION_CERTAINTIES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  createRequestyApiKey,
  deleteRequestyApiKey,
  fetchRequestyApiKey,
  fetchRequestyApiKeys,
  RequestyMutationReadbackError,
  updateRequestyApiKeyExpiry,
  updateRequestyApiKeyLimit,
  type RequestyApiKey,
} from "~/services/apiService/requesty"
import { REQUESTY_KEY_PERMISSIONS } from "~/services/apiService/requesty/constants"
import { ApiError } from "~/services/apiTransport/errors"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { maskSecretForDisplay, normalizeToMs } from "~/utils/core/formatters"

import { createRequestyKeyEditor, editRequestyKeyEditor } from "./keyEditor"
import { REQUESTY_KEY_FIELDS } from "./keyResourceFields"

/**
 * One listed key plus the role the account holds on it.
 *
 * Requesty exposes the calling key through the literal `self` route, so the
 * account's own credential is only identifiable after that extra read.
 */
type RequestyKeyRow = {
  key: RequestyApiKey
  accountCredentialIdentity: AccountCredentialIdentity
}

/** Reads the id of the key the account authenticates with; null when unknown. */
const readSelfKeyId = async (
  request: Parameters<typeof fetchRequestyApiKey>[0],
): Promise<string | null> => {
  try {
    return (await fetchRequestyApiKey(request, "self")).id
  } catch {
    // A management key without read scope may reject `self`; the inventory
    // still renders, only the credential marker is omitted.
    return null
  }
}

const toRow = (
  key: RequestyApiKey,
  selfKeyId: string | null,
): RequestyKeyRow => ({
  key,
  accountCredentialIdentity: resolveAccountCredentialIdentity({
    resourceIdentity: { resourceId: key.id, credentialResourceId: selfKeyId },
  }),
})

const createdSecret = (
  account: AccountKeyResourceOpenInput["account"],
  scopeKey: string,
  key: RequestyApiKey,
  plaintextKey: string,
) =>
  createAccountKeyResourceCreatedRuntimeSecret({
    ref: {
      accountId: account.id,
      siteType: SITE_TYPES.REQUESTY,
      scopeKey,
      resourceId: key.id,
    },
    displayName: key.name,
    secret: plaintextKey,
    credential: {
      accountName: account.name ?? REQUESTY_DISPLAY_NAME,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: toProtocolRoot(
        API_TYPES.OPENAI_COMPATIBLE,
        REQUESTY_API_BASE_URL,
      )!,
      tagIds: [],
    },
  })

const facts = (
  row: RequestyKeyRow,
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => {
  const key = row.key
  const expiresAtMs = key.expiresAt ? normalizeToMs(key.expiresAt) : null
  return {
    ref,
    displayName: key.name,
    // Requesty returns the UUID only; there is no masked prefix to show.
    maskedLabel: maskSecretForDisplay(key.id),
    status:
      expiresAtMs !== null && expiresAtMs <= Date.now()
        ? ACCOUNT_KEY_RESOURCE_STATUSES.Expired
        : ACCOUNT_KEY_RESOURCE_STATUSES.Enabled,
    accountCredentialIdentity: row.accountCredentialIdentity,
    detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
    displayFacts: [
      {
        // Management access outranks spend facts: it decides what this key can
        // do to the rest of the organization, not only how much it may spend.
        fieldId: REQUESTY_KEY_FIELDS.Permissions,
        kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Permission,
        role: ACCOUNT_KEY_PERMISSION_ROLES.Manage,
        granted: key.permissions.manage !== REQUESTY_KEY_PERMISSIONS.None,
      },
      keyBudgetFact(ref, context, {
        fieldId: REQUESTY_KEY_FIELDS.MonthlyLimit,
        operation: "api-keys/monthly-budget",
        scope: {
          models: { kind: SCOPE_SELECTION_KINDS.All },
          groups: { kind: SCOPE_SELECTION_KINDS.All },
        },
        asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        limitState:
          key.monthlyLimit === 0
            ? BUDGET_LIMIT_STATES.Unlimited
            : BUDGET_LIMIT_STATES.Finite,
        limit: key.monthlyLimit,
        used: key.monthlySpend,
        window: {
          kind: BUDGET_WINDOW_KINDS.Periodic,
          period: BUDGET_PERIODS.Month,
        },
      }),
      keyExpiryDisplayFact(REQUESTY_KEY_FIELDS.ExpiresAt, key.expiresAt ?? ""),
    ],
    runtimeSecret: undefined,
    runtimeKey: {
      // A manage key can also call inference, but it must not stand in for the
      // account's inference credential: exporting or selecting it would hand
      // management authority to clients that only need completions.
      inference:
        key.permissions.manage === REQUESTY_KEY_PERMISSIONS.None &&
        key.permissions.completions === REQUESTY_KEY_PERMISSIONS.Write,
      modelAccess: {
        groups: null,
        allowedModelIds: null,
        suggestedModelIds: [],
      },
      createdAt: normalizeToMs(key.createdAt) ?? undefined,
    },
    fields: [
      {
        fieldId: REQUESTY_KEY_FIELDS.ExpiresAt,
        kind: "text",
        value: key.expiresAt ?? "",
      },
    ],
    searchValues: [key.id, key.name, ...Object.values(key.labels)],
    actions: {
      // Requesty has no name-update endpoint and no enable/disable route; the
      // native console only offers delete.
      canUpdate: true,
      canDelete: true,
      canRotate: false,
    },
  }
}

/** A rejected write is a definitive 4xx; anything else stays uncertain. */
const classifyMutationFailure = (error: unknown) => {
  if (error instanceof RequestyMutationReadbackError)
    return NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied
  const status = error instanceof ApiError ? error.statusCode : undefined
  const rejected =
    status !== undefined && status >= 400 && status < 500 && status !== 408
  return rejected
    ? NATIVE_RESOURCE_MUTATION_CERTAINTIES.NotApplied
    : NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied
}

export const requestyAccountKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.REQUESTY,
  requiresFreshUpdateDetail: () => false,
  // Plaintext appears only in the create response; Requesty documents no
  // reveal endpoint and the console warns the key cannot be shown again.
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: creationPolicies.EditorDefaults,
  openConfig: async (input) => ({
    account: input.account,
    request: input.request,
  }),
  listScopes: async () => [
    {
      scopeKey: "default",
      routeKey: "default",
      displayName: REQUESTY_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "default",
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (row: RequestyKeyRow) => row.key.id,
  locatorFromDetail: (key: RequestyApiKey) => key.id,
  list: async (config) => {
    const keys = await fetchRequestyApiKeys(config.request)
    const selfKeyId = await readSelfKeyId(config.request)
    return {
      items: keys.map((key) => toRow(key, selfKeyId)),
      total: keys.length,
    }
  },
  get: (config, _scope, id) => fetchRequestyApiKey(config.request, id),
  toListFacts: (row, ref, context) => facts(row, ref, context),
  // Detail reads are per-key and carry no credential correlation; the listed
  // row already owns that marker.
  toDetailFacts: (key, ref, context) => facts(toRow(key, null), ref, context),
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    createRequestyKeyEditor(intent?.nameHint),
  editEditor: (_config, _scope, detail: RequestyApiKey) =>
    editRequestyKeyEditor(detail),
  create: async (config, scope, command, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    try {
      const { key, plaintextKey } = await createRequestyApiKey(request, {
        name: command.name,
        ...(command.monthlyLimit !== undefined
          ? { monthlyLimit: command.monthlyLimit }
          : {}),
        ...(command.managePermission !== undefined
          ? { managePermission: command.managePermission }
          : {}),
      })
      return {
        certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
        value: {
          detail: key,
          createdSecret: createdSecret(
            config.account,
            scope.scopeKey,
            key,
            plaintextKey,
          ),
        },
      }
    } catch (error) {
      return {
        certainty: classifyMutationFailure(error),
        failure: error,
      }
    }
  },
  update: async (config, _scope, state, command, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    const id = state.current.id
    let hasAppliedWrite = false
    try {
      let updated = state.current
      if (command.monthlyLimit !== undefined) {
        updated = await updateRequestyApiKeyLimit(
          request,
          id,
          command.monthlyLimit,
        )
        hasAppliedWrite = true
      }
      if (command.expiresAt !== undefined) {
        updated = await updateRequestyApiKeyExpiry(
          request,
          id,
          command.expiresAt === "" ? undefined : command.expiresAt,
        )
      }
      return {
        certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
        value: updated,
      }
    } catch (error) {
      return {
        certainty: hasAppliedWrite
          ? NATIVE_RESOURCE_MUTATION_CERTAINTIES.PossiblyApplied
          : classifyMutationFailure(error),
        failure: error,
      }
    }
  },
  delete: async (config, _scope, id, options) => {
    const request = {
      ...config.request,
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    }
    try {
      await deleteRequestyApiKey(request, id)
      return {
        certainty: NATIVE_RESOURCE_MUTATION_CERTAINTIES.Applied,
        value: undefined,
      }
    } catch (error) {
      return {
        certainty: classifyMutationFailure(error),
        failure: error,
      }
    }
  },
  mapFailure: mapAccountKeyResourceFailure,
})
