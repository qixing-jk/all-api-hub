import { SITE_TYPES } from "~/constants/siteType"
import {
  isSub2ApiManagedResourcePlatform,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/sub2api"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { toFacts } from "~/services/apiAdapters/managedResources/sub2api/displayFacts"
import {
  createEditor,
  createSub2ApiChannelImportProjection,
  editEditor,
  validateValues,
} from "~/services/apiAdapters/managedResources/sub2api/editorProjection"
import {
  type Sub2ApiCreateCommand,
  type Sub2ApiNativeConfig,
} from "~/services/apiAdapters/managedResources/sub2api/nativeContracts"
import {
  mapFailure,
  openConfig,
} from "~/services/apiAdapters/managedResources/sub2api/nativeRuntime"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations/contracts"
import {
  getSub2ApiApiKeyAccount,
  InvalidSub2ApiResourceIdError,
  listSub2ApiApiKeyAccounts,
  parseSub2ApiResourceId,
  searchSub2ApiApiKeyAccounts,
  type Sub2ApiApiKeyAccountUpdateInput,
} from "~/services/managedSites/providers/sub2api"
import {
  createSub2ApiManagedAccountMutation,
  deleteSub2ApiManagedAccountMutation,
  updateSub2ApiManagedAccountMutation,
} from "~/services/managedSites/providers/sub2api/sub2apiMutations"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"

const sub2ApiNativeDefinition = {
  siteType: SITE_TYPES.SUB2API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createSub2ApiChannelImportProjection,
      validate: (values: EditableResourceProjection) =>
        validateValues(values, { create: true }),
      sourceFieldIds: {
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name]: "name",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform]: "channelType",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status]: "enabled",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl]: "baseUrl",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key]: "credential",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models]: "models",
        [SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes]: "notes",
      } as const,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig,
  scopeKey: (config: Sub2ApiNativeConfig) => config.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    try {
      return parseSub2ApiResourceId(resourceId)
    } catch (error) {
      if (!(error instanceof InvalidSub2ApiResourceIdError)) throw error
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
  },
  locatorFromListItem: (item: Sub2ApiAdminApiKeyAccount) => item.id,
  locatorFromDetail: (detail: Sub2ApiAdminApiKeyAccount) => detail.id,
  list: async (
    nativeConfig: Sub2ApiNativeConfig,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    const search = query?.search?.trim()
    const page = search
      ? await searchSub2ApiApiKeyAccounts(nativeConfig.config, search, {
          signal: options?.signal,
        })
      : await listSub2ApiApiKeyAccounts(nativeConfig.config, {
          signal: options?.signal,
        })
    const items = page.items.filter(
      (item) =>
        item.type === "apikey" &&
        isSub2ApiManagedResourcePlatform(item.platform),
    )
    return { items, total: items.length }
  },
  get: (
    nativeConfig: Sub2ApiNativeConfig,
    locator: number,
    options?: ResourceOperationOptions,
  ) =>
    getSub2ApiApiKeyAccount(nativeConfig.config, locator, {
      signal: options?.signal,
    }),
  toListFacts: (item: Sub2ApiAdminApiKeyAccount, ref: ManagedResourceRef) =>
    toFacts(item, ref, false),
  toDetailFacts: (detail: Sub2ApiAdminApiKeyAccount, ref: ManagedResourceRef) =>
    toFacts(detail, ref, true),
  createEditor: async () => createEditor(),
  editEditor,
  create: (
    nativeConfig: Sub2ApiNativeConfig,
    command: Sub2ApiCreateCommand,
    options?: ResourceOperationOptions,
  ) =>
    createSub2ApiManagedAccountMutation(
      nativeConfig.config,
      command.input,
      command.desiredStatus,
      { signal: options?.signal },
    ),
  update: async (
    nativeConfig: Sub2ApiNativeConfig,
    detail: Sub2ApiAdminApiKeyAccount,
    command: Sub2ApiApiKeyAccountUpdateInput,
    options?: ResourceOperationOptions,
  ) =>
    Object.keys(command).length === 0
      ? {
          outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
          data: detail,
          confirmedEffects: [],
        }
      : await updateSub2ApiManagedAccountMutation(
          nativeConfig.config,
          detail.id,
          command,
          { signal: options?.signal },
        ),
  delete: (
    nativeConfig: Sub2ApiNativeConfig,
    locator: number,
    options?: ResourceOperationOptions,
  ) =>
    deleteSub2ApiManagedAccountMutation(nativeConfig.config, locator, {
      signal: options?.signal,
    }),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}
export const sub2ApiManagedResourceRegistration = defineNativeResourceKind(
  sub2ApiNativeDefinition,
)
