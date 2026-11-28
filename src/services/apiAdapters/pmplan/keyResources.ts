import { SITE_TYPES } from "~/constants/siteType"
import {
  createAccountKeyResourceCreatedRuntimeSecret,
  createUnattributedAccountCreatedRuntimeSecret,
} from "~/services/accounts/keys/createdRuntimeSecret"
import { PMPLAN_DISPLAY_NAME } from "~/services/accountSiteDefinitions/identifiers"
import { readEdgeKeyMask } from "~/services/accountTokens/keyMaskEvidence"
import type {
  AccountKeyFactContext,
  AccountKeyResourceProviderFacts,
} from "~/services/apiAdapters/accountKeyResources/definition"
import {
  keyExpiryDisplayFact,
  keyLastUsedDisplayFacts,
} from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_DEFAULT_CREATION_POLICIES,
  ACCOUNT_KEY_DETAIL_AVAILABILITIES,
  ACCOUNT_KEY_DISPLAY_FACT_KINDS,
  ACCOUNT_KEY_RESOURCE_STATUSES,
  ACCOUNT_KEY_RESTRICTION_ROLES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/resourceNative"
import { runNativeResourceMutation } from "~/services/apiAdapters/nativeResources/mutation"
import { withPmplanSession } from "~/services/apiService/pmplan"
import { PMPLAN_KEY_STATUSES } from "~/services/apiService/pmplan/constants"
import { getPmplanOrigin } from "~/services/apiService/pmplan/deployment"
import {
  createPmplanKey,
  fetchPmplanKeys,
  revokePmplanKey,
  updatePmplanKeyModels,
} from "~/services/apiService/pmplan/keys"
import type { PmplanKey } from "~/services/apiService/pmplan/keys"
import { fetchPmplanModels } from "~/services/apiService/pmplan/models"
import { API_TYPES } from "~/services/verification/aiApiVerification"

import { createPmplanKeyEditor, editPmplanKeyEditor } from "./keyEditor"
import { PMPLAN_KEY_EDITOR_FIELDS } from "./keyResourceFields"

const ACCOUNT_SCOPE_KEY = "account"

type PmplanKeyDetail = PmplanKey & { availableModels?: string[] }
const canEdit = (key: PmplanKey) =>
  key.status === PMPLAN_KEY_STATUSES.Active &&
  (key.expires_at === null || Date.parse(key.expires_at) > Date.now())
const modelRestriction = (key: PmplanKey) =>
  JSON.stringify(key.all_models ? [] : [...key.models].sort())

const unavailable = () => {
  throw new AccountKeyResourceError({
    code: RESOURCE_FAILURE_CODES.Unavailable,
  })
}
const facts = (
  key: PmplanKey,
  ref: AccountKeyResourceRef,
  context: AccountKeyFactContext,
): AccountKeyResourceProviderFacts => ({
  ref,
  displayName: `${PMPLAN_DISPLAY_NAME} #${key.id}`,
  maskedLabel: key.key_prefix,
  // Native create/readback confirms that key_prefix preserves the leading secret bytes.
  keyMask: readEdgeKeyMask(key.key_prefix),
  runtimeSecret: undefined,
  status:
    key.status === PMPLAN_KEY_STATUSES.Revoked
      ? ACCOUNT_KEY_RESOURCE_STATUSES.Disabled
      : key.status === PMPLAN_KEY_STATUSES.Expired ||
          (key.expires_at !== null && Date.parse(key.expires_at) <= Date.now())
        ? ACCOUNT_KEY_RESOURCE_STATUSES.Expired
        : key.status === PMPLAN_KEY_STATUSES.Active
          ? ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
          : ACCOUNT_KEY_RESOURCE_STATUSES.Unknown,
  detailAvailability: ACCOUNT_KEY_DETAIL_AVAILABILITIES.Complete,
  runtimeKey: {
    baseUrl: `${context.authority}/v1`,
    ...(key.created_at ? { createdAt: Date.parse(key.created_at) } : {}),
    modelAccess: {
      groups: [],
      allowedModelIds: key.all_models ? null : key.models,
      suggestedModelIds: [],
    },
  },
  fields: [],
  displayFacts: [
    {
      fieldId: PMPLAN_KEY_EDITOR_FIELDS.Models,
      kind: ACCOUNT_KEY_DISPLAY_FACT_KINDS.Restriction,
      role: ACCOUNT_KEY_RESTRICTION_ROLES.Models,
      value: key.all_models ? [] : key.models,
    },
    keyExpiryDisplayFact(PMPLAN_KEY_EDITOR_FIELDS.Expiry, key.expires_at ?? ""),
    ...keyLastUsedDisplayFacts(
      key.last_used_at ? Date.parse(key.last_used_at) : undefined,
    ),
  ],
  actions: {
    canUpdate: canEdit(key),
    canDelete: false,
    canRevoke: key.status === PMPLAN_KEY_STATUSES.Active,
    canRotate: false,
  },
})

export const pmplanKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.PMPLAN,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: ACCOUNT_KEY_DEFAULT_CREATION_POLICIES.EditorDefaults,
  requiresFreshUpdateDetail: () => true,
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: ACCOUNT_SCOPE_KEY,
      routeKey: ACCOUNT_SCOPE_KEY,
      displayName: PMPLAN_DISPLAY_NAME,
      isDefault: true,
    },
  ],
  defaultScopeKey: () => ACCOUNT_SCOPE_KEY,
  encodeLocator: (id: number) => String(id),
  decodeLocator: (id: string) => Number(id),
  locatorFromListItem: (key: PmplanKey) => key.id,
  locatorFromDetail: (key: PmplanKeyDetail) => key.id,
  list: async (config, _scope, _query, options) => {
    const items = await withPmplanSession(
      config.request,
      fetchPmplanKeys,
      options?.signal,
    )
    return { items, total: items.length }
  },
  get: async (config, _scope, id, options) =>
    (
      await withPmplanSession(config.request, fetchPmplanKeys, options?.signal)
    ).find((key) => key.id === id) ?? unavailable(),
  toListFacts: facts,
  toDetailFacts: facts,
  createEditor: async (config, _scope, options) =>
    createPmplanKeyEditor(
      (
        await withPmplanSession(
          config.request,
          fetchPmplanModels,
          options?.signal,
        )
      ).map((model) => model.name),
    ),
  getEditDetail: (config, _scope, id, options) =>
    withPmplanSession(
      config.request,
      async (request) => {
        const key =
          (await fetchPmplanKeys(request)).find((item) => item.id === id) ??
          unavailable()
        return {
          ...key,
          availableModels: (await fetchPmplanModels(request)).map(
            (model) => model.name,
          ),
        }
      },
      options?.signal,
    ),
  editEditor: (_config, _scope, detail: PmplanKeyDetail) =>
    canEdit(detail)
      ? editPmplanKeyEditor(detail, detail.availableModels ?? [])
      : unavailable(),
  update: (config, _scope, { baseline, current }, command, options) =>
    runNativeResourceMutation({
      request: config.request,
      mapFailure: mapAccountKeyResourceFailure,
      execute: (request) =>
        withPmplanSession(
          request,
          (request) => {
            if (
              !canEdit(current) ||
              modelRestriction(baseline) !== modelRestriction(current)
            )
              throw new AccountKeyResourceError({
                code: RESOURCE_FAILURE_CODES.ResourceChanged,
              })
            return updatePmplanKeyModels(request, current.id, command)
          },
          options?.signal,
        ),
    }),
  delete: unavailable,
  create: (config, scope, command, options) =>
    runNativeResourceMutation({
      request: config.request,
      mapFailure: mapAccountKeyResourceFailure,
      execute: (request) => {
        let accepted:
          | {
              detail: null
              createdSecret: ReturnType<
                typeof createUnattributedAccountCreatedRuntimeSecret
              >
            }
          | undefined
        return withPmplanSession(
          request,
          async (request) => {
            const result = await createPmplanKey(request, command)
            const secretEvidence = {
              displayName: `${PMPLAN_DISPLAY_NAME} #${result.id}`,
              secret: result.key,
              credential: {
                accountName: config.account.name ?? PMPLAN_DISPLAY_NAME,
                apiType: API_TYPES.OPENAI_COMPATIBLE,
                baseUrl: `${getPmplanOrigin(request.baseUrl)}/v1`,
                tagIds: [],
              },
            }
            // Preserve the only plaintext response before cancellable readback.
            accepted = {
              detail: null,
              createdSecret: createUnattributedAccountCreatedRuntimeSecret({
                accountId: config.account.id,
                ...secretEvidence,
              }),
            }
            const detail =
              (await fetchPmplanKeys(request).catch(() => [])).find(
                (key) => key.id === result.id,
              ) ?? null
            if (!detail) return accepted
            const createdSecret = createAccountKeyResourceCreatedRuntimeSecret({
              ref: {
                accountId: config.account.id,
                siteType: SITE_TYPES.PMPLAN,
                scopeKey: scope.scopeKey,
                resourceId: String(result.id),
              },
              ...secretEvidence,
            })
            return { detail, createdSecret }
          },
          options?.signal,
        ).catch((error) => {
          if (accepted) return accepted
          throw error
        })
      },
    }),
  revoke: (config, _scope, id, options) =>
    runNativeResourceMutation({
      request: config.request,
      mapFailure: mapAccountKeyResourceFailure,
      execute: (request) =>
        withPmplanSession(
          request,
          (request) => revokePmplanKey(request, id),
          options?.signal,
        ),
    }),
  mapFailure: mapAccountKeyResourceFailure,
})
