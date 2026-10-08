import { OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/omniroute"
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
import { toFacts } from "~/services/apiAdapters/managedResources/omniRouteDisplayFacts"
import {
  createEditor,
  createImportProjection,
  editEditor,
  validateCreateValues,
} from "~/services/apiAdapters/managedResources/omniRouteEditorProjection"
import {
  type OmniRouteNativeCreateCommand,
  type OmniRouteNativeResourceOperations,
  type OmniRouteNativeUpdateCommand,
} from "~/services/apiAdapters/managedResources/omniRouteNativeContracts"
import { openOmniRouteNativeResourceOperations } from "~/services/apiAdapters/managedResources/omniRouteNativeOperations"
import { mapFailure } from "~/services/apiAdapters/managedResources/omniRouteNativeRuntime"
import { type OmniRouteSanitizedConnection } from "~/services/apiService/omniroute/redaction"

const definition = {
  siteType: SITE_TYPES.OMNIROUTE,
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
        [fields.DefaultModel]: "models",
      } as const,
    },
  ],
  capabilities: {
    // The gateway has no text search; the workspace filters its walked
    // inventory locally so the shared search box still narrows the table.
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openOmniRouteNativeResourceOperations,
  scopeKey: (operations: OmniRouteNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: string) => locator,
  decodeLocator: (resourceId: string) => {
    if (!resourceId) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return resourceId
  },
  locatorFromListItem: (item: OmniRouteSanitizedConnection) => item.id,
  locatorFromDetail: (detail: OmniRouteSanitizedConnection) => detail.id,
  list: async (
    operations: OmniRouteNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => await operations.list(query, options),
  get: (
    operations: OmniRouteNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: async (operations: OmniRouteNativeResourceOperations) =>
    createEditor(operations),
  editEditor: (
    operations: OmniRouteNativeResourceOperations,
    detail: OmniRouteSanitizedConnection,
  ) => editEditor(operations, detail),
  create: async (
    operations: OmniRouteNativeResourceOperations,
    command: OmniRouteNativeCreateCommand,
    options?: ResourceOperationOptions,
  ) => await operations.create(command, options),
  update: async (
    operations: OmniRouteNativeResourceOperations,
    detail: OmniRouteSanitizedConnection,
    command: OmniRouteNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ) => await operations.update(detail, command, options),
  delete: async (
    operations: OmniRouteNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) => await operations.delete(locator, options),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}

export const omniRouteManagedResourceRegistration =
  defineNativeResourceKind(definition)
