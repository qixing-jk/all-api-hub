import { SITE_TYPES } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/keys/runtimeKeyModelAccess"
import { FREEMODEL_OPENAI_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { mapAccountKeyResourceFailure } from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import {
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  createKey,
  deleteKey,
  fetchKeys,
  type FreeModelKey,
} from "~/services/apiService/freemodel"
import { API_TYPES } from "~/services/verification/aiApiVerification"

/** Universal key creation uses the same name-only definition in real and local sessions. */
export function createFreeModelKeyEditor(
  nameHint?: string,
): AccountKeyResourceEditorDefinition<{ name: string }> {
  return {
    fields: [
      { fieldId: "name", type: RESOURCE_FIELD_TYPES.Text, required: true },
    ],
    initialValues: {
      name: nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME,
    },
    validate: (values) => {
      if (typeof values.name !== "string" || !values.name.trim())
        return {
          valid: false,
          issues: [
            { fieldId: "name", code: RESOURCE_FIELD_ISSUE_CODES.Required },
          ],
        }
      return { valid: true }
    },
    buildCommand: (values) => ({ name: String(values.name).trim() }),
  }
}

const facts = (key: FreeModelKey, ref: AccountKeyResourceRef) => ({
  ref,
  displayName: key.name,
  // Match the official console mask (index-CDUNPcwU.js, verified 2026-10-04).
  maskedLabel: `fe_oa_••••••••••••${key.suffix}`,
  status: "enabled" as const,
  runtimeKey: {
    modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
    baseUrl: FREEMODEL_OPENAI_BASE_URL,
  },
  fields: [],
  actions: { canUpdate: false, canDelete: true },
})

const unsupported = () =>
  new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
  })

export const freeModelKeyResources = defineAccountKeyResourceCapability({
  siteType: SITE_TYPES.FREEMODEL,
  inventorySecretAvailability:
    INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
  defaultCreation: "editor-defaults",
  openConfig: async (input) => input,
  listScopes: async () => [
    {
      scopeKey: "default",
      routeKey: "default",
      displayName: "FreeModel",
      isDefault: true,
    },
  ],
  defaultScopeKey: () => "default",
  runtimeKey: {
    resolve: async () => ({
      kind: "unavailable",
      failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable },
    }),
  },
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => id,
  locatorFromListItem: (key: FreeModelKey) => String(key.id),
  locatorFromDetail: (key: FreeModelKey) => String(key.id),
  list: async (config) => {
    const items = await fetchKeys(config.request)
    return { items, total: items.length }
  },
  get: async (config, _scope, id) => {
    const key = (await fetchKeys(config.request)).find(
      (key) => String(key.id) === id,
    )
    if (!key)
      throw new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound,
      })
    return key
  },
  toListFacts: facts,
  toDetailFacts: facts,
  // Universal keys are created by name, matching the website's key contract.
  createEditor: async (_config, _scope, _options, _inventory, intent) =>
    createFreeModelKeyEditor(intent?.nameHint),
  editEditor: () => {
    throw unsupported()
  },
  create: async (config, scope, command, options) => {
    const { key, secret } = await createKey(
      {
        ...config.request,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      },
      command.name,
    )
    return {
      certainty: "applied",
      value: {
        detail: key,
        createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
          ref: {
            accountId: config.account.id,
            siteType: SITE_TYPES.FREEMODEL,
            scopeKey: scope.scopeKey,
            resourceId: String(key.id),
          },
          displayName: key.name,
          secret,
          credential: {
            accountName: config.account.name ?? "FreeModel",
            apiType: API_TYPES.OPENAI_COMPATIBLE,
            baseUrl: toProtocolRoot(
              API_TYPES.OPENAI_COMPATIBLE,
              FREEMODEL_OPENAI_BASE_URL,
            )!,
            // Start with the documented default; the saved profile remains editable.
            tagIds: [],
          },
        }),
      },
    }
  },
  update: async () => {
    throw unsupported()
  },
  delete: async (config, _scope, id) => {
    await deleteKey(config.request, id)
    return { certainty: "applied", value: undefined }
  },
  mapFailure: mapAccountKeyResourceFailure,
})
