import { GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/gptLoad"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { toFacts } from "~/services/apiAdapters/managedResources/gptLoad/displayFacts"
import {
  createEditor,
  createImportProjection,
  editEditor,
  validateCreateValues,
} from "~/services/apiAdapters/managedResources/gptLoad/editorProjection"
import {
  type GptLoadGroupDetail,
  type GptLoadGroupEditorCommand,
  type GptLoadNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/gptLoad/nativeContracts"
import { openGptLoadNativeResourceOperations } from "~/services/apiAdapters/managedResources/gptLoad/nativeOperations"
import { mapFailure } from "~/services/apiAdapters/managedResources/gptLoad/nativeRuntime"

const definition = {
  siteType: SITE_TYPES.GPT_LOAD,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createImportProjection,
      validate: validateCreateValues,
      sourceFieldIds: {
        [fields.Name]: "name",
        [fields.Provider]: "channelType",
        [fields.BaseUrl]: "baseUrl",
        [fields.Key]: "credential",
        [fields.Models]: "models",
      } as const,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openGptLoadNativeResourceOperations,
  scopeKey: (operations: GptLoadNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    const parsed = Number(resourceId)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return parsed
  },
  locatorFromListItem: (item: GptLoadGroupDetail) => item.group.id,
  locatorFromDetail: (detail: GptLoadGroupDetail) => detail.group.id,
  list: async (
    operations: GptLoadNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => await operations.list(query, options),
  get: (
    operations: GptLoadNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: (
    operations: GptLoadNativeResourceOperations,
    options?: ResourceOperationOptions,
  ) => createEditor(operations, options),
  editEditor: (
    operations: GptLoadNativeResourceOperations,
    detail: GptLoadGroupDetail,
    options?: ResourceOperationOptions,
  ) => editEditor(operations, detail, options),
  create: async (
    operations: GptLoadNativeResourceOperations,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ) => await operations.create(command, options),
  update: async (
    operations: GptLoadNativeResourceOperations,
    detail: GptLoadGroupDetail,
    command: GptLoadGroupEditorCommand,
    options?: ResourceOperationOptions,
  ) => await operations.update(detail, command, options),
  delete: async (
    operations: GptLoadNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => await operations.delete(locator, options),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}

export const gptLoadManagedResourceRegistration =
  defineNativeResourceKind(definition)
