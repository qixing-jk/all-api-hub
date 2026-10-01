import type { AccountSiteType } from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS } from "~/services/accounts/runtimeKeyModelAccess"
import { defineAccountKeyResourceCapability } from "~/services/apiAdapters/accountKeyResources/factory"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import {
  RESOURCE_DISPLAY_FACT_KINDS,
  RESOURCE_FIELD_ISSUE_CODES,
  RESOURCE_FIELD_TYPES,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  createKimiKey,
  deleteKimiKey,
  fetchKimiKeys,
  fetchKimiProjects,
  renameKimiKey,
} from "~/services/apiService/kimiOpenPlatform"
import {
  isMaskedKimiSecret,
  type KimiApiKey,
} from "~/services/apiService/kimiOpenPlatform/parsing"
import { ensureKimiAuthState } from "~/services/apiService/kimiOpenPlatform/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { resolveKimiOpenPlatformDeployment } from "~/services/kimiOpenPlatform/deployments"
import { API_TYPES } from "~/services/verification/aiApiVerification"

type KeyRecord = KimiApiKey & { baseUrl: string }

type Config = {
  account: { id: string; name?: string; siteType: AccountSiteType }
  request: ApiServiceRequest
  baseUrl: string
}

type Command = { name: string }

const nameOf = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const editor = (name = "") => ({
  fields: [
    {
      fieldId: "name",
      type: RESOURCE_FIELD_TYPES.Text,
      required: true as const,
    },
  ],
  initialValues: { name },
  validate(values: { name?: unknown }) {
    return nameOf(values.name)
      ? ({ valid: true } as const)
      : {
          valid: false as const,
          issues: [
            { fieldId: "name", code: RESOURCE_FIELD_ISSUE_CODES.Required },
          ],
        }
  },
  buildCommand(values: { name?: unknown }): Command {
    const name = nameOf(values.name)
    if (!name || name.length > 32) throw new Error("invalid_kimi_key_name")
    return { name }
  },
})

const withBase = (request: ApiServiceRequest, key: KimiApiKey): KeyRecord => ({
  ...key,
  baseUrl:
    resolveKimiOpenPlatformDeployment(request.baseUrl)?.openaiBaseUrl ?? "",
})

/** One capability definition per site type; the protocol is shared. */
export function createKimiOpenPlatformKeyResources(siteType: AccountSiteType) {
  return defineAccountKeyResourceCapability({
    siteType,
    inventorySecretAvailability:
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly,
    defaultCreation: "editor-defaults",
    openConfig: async (input): Promise<Config> => {
      await ensureKimiAuthState(input.request)
      return {
        account: input.account,
        request: input.request,
        baseUrl:
          resolveKimiOpenPlatformDeployment(input.request.baseUrl)
            ?.openaiBaseUrl ?? "",
      }
    },
    listScopes: async (config) =>
      (await fetchKimiProjects(config.request)).map((project) => ({
        scopeKey: project.id,
        routeKey: project.id,
        displayName: project.name,
        isDefault: project.is_default === true,
      })),
    defaultScopeKey: (_config, scopes) =>
      scopes.find((scope) => scope.isDefault)?.scopeKey ??
      scopes[0]?.scopeKey ??
      "",
    runtimeKey: {
      resolve: async () => ({
        kind: "unavailable",
        failure: { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable },
      }),
    },
    encodeLocator: (id: string) => id,
    decodeLocator: (id: string) => id,
    locatorFromListItem: (key: KeyRecord) => key.key,
    locatorFromDetail: (key: KeyRecord) => key.key,
    list: async (config, scope) => {
      const items = (await fetchKimiKeys(config.request))
        .filter((key) => key.project_id === scope.scopeKey)
        .map((key) => withBase(config.request, key))
      return { items, total: items.length }
    },
    get: async (config, scope, id) => {
      const key = (await fetchKimiKeys(config.request)).find(
        (item) => item.key === id && item.project_id === scope.scopeKey,
      )
      if (!key) throw new Error("kimi_key_not_found")
      return withBase(config.request, key)
    },
    toListFacts: (key, ref) => ({
      ref,
      displayName: key.name || key.key,
      maskedLabel: isMaskedKimiSecret(key.auth) ? key.auth : key.key,
      status: "enabled" as const,
      runtimeKey: {
        modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
        baseUrl: key.baseUrl,
        ...(key.created_at
          ? { createdAt: Date.parse(key.created_at) || undefined }
          : {}),
      },
      fields: [
        {
          fieldId: "project",
          kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
          value: key.project_name || key.project_id,
        },
        {
          fieldId: "key",
          kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
          value: key.auth,
        },
      ],
      searchValues: [key.name, key.key, key.auth],
      actions: { canUpdate: true, canDelete: true },
    }),
    toDetailFacts: (key, ref) => ({
      ref,
      displayName: key.name || key.key,
      maskedLabel: isMaskedKimiSecret(key.auth) ? key.auth : key.key,
      status: "enabled" as const,
      runtimeKey: {
        modelAccess: UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
        baseUrl: key.baseUrl,
      },
      fields: [
        {
          fieldId: "project",
          kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
          value: key.project_name || key.project_id,
        },
        {
          fieldId: "key",
          kind: RESOURCE_DISPLAY_FACT_KINDS.Text,
          value: key.auth,
        },
      ],
      actions: { canUpdate: true, canDelete: true },
    }),
    createEditor: async (_config, _scope, _options, _inventory, intent) =>
      editor(intent?.nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
    editEditor: (_config, _scope, detail) => editor(detail.name),
    create: async (config, scope, command) => {
      const created = await createKimiKey(
        config.request,
        scope.scopeKey,
        command.name,
      )
      const detail = withBase(config.request, {
        ...created,
        project_name: scope.displayName,
      })
      return {
        certainty: "applied" as const,
        value: {
          detail,
          createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
            ref: {
              accountId: config.account.id,
              siteType,
              scopeKey: scope.scopeKey,
              resourceId: created.key,
            },
            displayName: created.name,
            secret: created.auth,
            credential: {
              accountName: config.account.name ?? "Kimi",
              apiType: API_TYPES.OPENAI_COMPATIBLE,
              baseUrl: detail.baseUrl,
              siteType,
              tagIds: [],
            },
          }),
        },
      }
    },
    update: async (config, scope, detail, command) => {
      if (command.name === detail.name)
        return { certainty: "applied" as const, value: detail }
      await renameKimiKey(
        config.request,
        scope.scopeKey,
        detail.key,
        command.name,
      )
      return {
        certainty: "applied" as const,
        value: { ...detail, name: command.name },
      }
    },
    delete: async (config, scope, id) => {
      await deleteKimiKey(config.request, scope.scopeKey, id)
      return { certainty: "applied" as const, value: undefined }
    },
    mapFailure: (error: unknown) => ({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
      message: error instanceof Error ? error.message : undefined,
    }),
  })
}
