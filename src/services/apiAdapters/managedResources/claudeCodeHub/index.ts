import { CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { toFacts } from "~/services/apiAdapters/managedResources/claudeCodeHub/displayFacts"
import {
  createEditor,
  createImportProjection,
  editEditor,
  validateValues,
} from "~/services/apiAdapters/managedResources/claudeCodeHub/editorProjection"
import {
  type ClaudeCodeHubNativeResourceOperations,
  type ClaudeCodeHubNativeUpdateCommand,
} from "~/services/apiAdapters/managedResources/claudeCodeHub/nativeContracts"
import { openClaudeCodeHubNativeResourceOperations } from "~/services/apiAdapters/managedResources/claudeCodeHub/nativeOperations"
import { mapFailure } from "~/services/apiAdapters/managedResources/claudeCodeHub/nativeRuntime"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import type {
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
} from "~/types/claudeCodeHub"

const definition = {
  siteType: SITE_TYPES.CLAUDE_CODE_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createImportProjection,
      validate: validateValues,
      sourceFieldIds: {
        [fields.Name]: "name",
        [fields.Type]: "channelType",
        [fields.Status]: "enabled",
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
  openConfig: openClaudeCodeHubNativeResourceOperations,
  scopeKey: (operations: ClaudeCodeHubNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: number) => String(locator),
  decodeLocator: (resourceId: string) => {
    const locator = Number(resourceId)
    if (!Number.isSafeInteger(locator) || locator <= 0) {
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    }
    return locator
  },
  locatorFromListItem: (item: ClaudeCodeHubProviderDisplay) => item.id,
  locatorFromDetail: (detail: ClaudeCodeHubProviderDisplay) => detail.id,
  list: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => {
    return await operations.list(query, options)
  },
  get: (
    operations: ClaudeCodeHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.get(locator, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  toMutationFacts: toFacts,
  createEditor: async () => createEditor(),
  editEditor,
  create: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    command: ClaudeCodeHubProviderCreatePayload,
    options?: ResourceOperationOptions,
  ) => operations.create(command, options),
  update: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    detail: ClaudeCodeHubProviderDisplay,
    command: ClaudeCodeHubNativeUpdateCommand,
    options?: ResourceOperationOptions,
  ) => operations.update(detail, command, options),
  delete: async (
    operations: ClaudeCodeHubNativeResourceOperations,
    locator: number,
    options?: ResourceOperationOptions,
  ) => operations.delete(locator, options),
  scalarKeyCleanup: "single" as const,
  mapFailure,
}

export const claudeCodeHubManagedResourceRegistration =
  defineNativeResourceKind(definition)
