import { AXON_HUB_CHANNEL_FIELD_IDS } from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedResourceRef,
  type ResourceListQuery,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  axonCredentialRecords,
  getAxonHubCredentialCandidates,
  isRegularAxonHubChannelType,
  sanitizeAxonHubEditorDetail,
} from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import {
  detailFacts,
  toFacts,
  toListFacts,
} from "~/services/apiAdapters/managedResources/axonHubDisplayFacts"
import {
  type AxonHubCreateCommand,
  type AxonHubNativeChannelPatch,
} from "~/services/apiAdapters/managedResources/axonHubEditorContracts"
import { createAxonHubChannelImportProjection } from "~/services/apiAdapters/managedResources/axonHubEditorFields"
import {
  createAxonHubCreateProjection,
  createAxonHubEditProjection,
  validateAxonHubCreateProjection,
} from "~/services/apiAdapters/managedResources/axonHubEditorProjection"
import { type AxonHubNativeResourceOperations } from "~/services/apiAdapters/managedResources/axonHubNativeContracts"
import { openAxonHubNativeResourceOperations } from "~/services/apiAdapters/managedResources/axonHubNativeOperations"
import {
  createNativeFailure,
  mapFailure,
} from "~/services/apiAdapters/managedResources/axonHubNativeRuntime"
import { resolveCredentialPatch } from "~/services/apiAdapters/managedResources/credentialListEditor"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import type { AxonHubChannel } from "~/types/axonHub"

const axonHubNativeDefinition = {
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      project: createAxonHubChannelImportProjection,
      validate: (values: EditableResourceProjection) =>
        validateAxonHubCreateProjection(values),
      sourceFieldIds: {
        [AXON_HUB_CHANNEL_FIELD_IDS.NAME]: "name",
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: "channelType",
        [AXON_HUB_CHANNEL_FIELD_IDS.STATUS]: "enabled",
        [AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL]: "baseUrl",
        [AXON_HUB_CHANNEL_FIELD_IDS.KEY]: "credential",
        [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS]: "models",
        [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: "models",
        [AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL]: "models",
      } as const,
    },
  ],
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  openConfig: openAxonHubNativeResourceOperations,
  scopeKey: (operations: AxonHubNativeResourceOperations) =>
    operations.scopeKey,
  encodeLocator: (locator: string) => locator,
  decodeLocator: (resourceId: string) => resourceId,
  locatorFromListItem: (item: AxonHubChannel) => item.id,
  locatorFromDetail: (detail: AxonHubChannel) => detail.id,
  list: (
    operations: AxonHubNativeResourceOperations,
    query?: ResourceListQuery,
    options?: ResourceOperationOptions,
  ) => operations.list(query, options),
  get: (
    operations: AxonHubNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) =>
    operations.get(
      {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: operations.scopeKey,
        resourceId: locator,
      },
      options,
    ),
  toListFacts,
  toDetailFacts: (detail: AxonHubChannel, ref: ManagedResourceRef) =>
    toFacts(detail, ref, detailFacts(detail)),
  toMutationFacts: toListFacts,
  createEditor: async () => createAxonHubCreateProjection(),
  editEditor: (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => {
    const ref = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey: operations.scopeKey,
      resourceId: detail.id,
    }
    return createAxonHubEditProjection(detail, {
      loadSecret: (fieldId, options) => {
        if (fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.KEY)
          throw createNativeFailure("unexpected")
        return operations.loadSecret(ref, options)
      },
      reloadDetail: (options) => operations.get(ref, options),
    })
  },
  sanitizeEditDetail: sanitizeAxonHubEditorDetail,
  keyCleanup: async (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
  ) => {
    if (!isRegularAxonHubChannelType(String(detail.type)))
      throw new ManagedResourceError({ code: "unavailable" })
    const keys = getAxonHubCredentialCandidates(detail)
    if (!keys.length) throw new ManagedResourceError({ code: "unavailable" })
    return {
      baseUrls: [detail.baseURL ?? ""],
      keys,
      // AxonHub's apiKeys input replaces the complete credential list.
      remove: async (
        indices: readonly number[],
        options?: ResourceOperationOptions,
      ) => {
        const latest = await operations.get(
          {
            siteType: SITE_TYPES.AXON_HUB,
            kind: MANAGED_RESOURCE_KINDS.Channel,
            scopeKey: operations.scopeKey,
            resourceId: detail.id,
          },
          options,
        )
        if (
          JSON.stringify(getAxonHubCredentialCandidates(latest)) !==
          JSON.stringify(keys)
        )
          throw new ManagedResourceError({ code: "resource_changed" })
        return operations.update(
          latest,
          {
            credentials: {
              ...latest.credentials,
              apiKey: undefined,
              apiKeys: keys.filter((_, index) => !indices.includes(index)),
            },
          },
          options,
        )
      },
    }
  },
  create: async (
    operations: AxonHubNativeResourceOperations,
    command: AxonHubCreateCommand,
    options?: ResourceOperationOptions,
  ) => {
    if (command.credentialPatch)
      command.input.credentials = {
        apiKeys: (
          await resolveCredentialPatch(command.credentialPatch, [])
        ).map(({ key }) => key),
      }
    return operations.create(command.input, command.desiredStatus, options)
  },
  update: async (
    operations: AxonHubNativeResourceOperations,
    detail: AxonHubChannel,
    command: AxonHubNativeChannelPatch,
    options?: ResourceOperationOptions,
  ) => {
    const { credentialPatch, ...patch } = command
    // AxonHub replaces apiKeys as a whole; reject stale membership before writing.
    // https://github.com/looplj/axonhub/blob/d061ac7df6aef0c5ec6cdfa9dc5002546a1c5a57/internal/server/gql/ent.graphql
    if (credentialPatch) {
      if (
        !isRegularAxonHubChannelType(String(detail.type)) ||
        detail.credentials == null
      )
        throw new ManagedResourceError({ code: "permission_denied" })
      patch.credentials = {
        ...detail.credentials,
        apiKey: undefined,
        apiKeys: (
          await resolveCredentialPatch(
            credentialPatch,
            axonCredentialRecords(detail),
          )
        ).map(({ key }) => key),
      }
    } else if (
      patch.credentials &&
      getAxonHubCredentialCandidates(detail).length > 1
    ) {
      throw new ManagedResourceError({ code: "resource_changed" })
    }
    return operations.update(detail, patch, options)
  },
  delete: (
    operations: AxonHubNativeResourceOperations,
    locator: string,
    options?: ResourceOperationOptions,
  ) =>
    operations.delete(
      {
        siteType: SITE_TYPES.AXON_HUB,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        scopeKey: operations.scopeKey,
        resourceId: locator,
      },
      options,
    ),
  mapFailure,
}

export const axonHubManagedResourceRegistration = defineNativeResourceKind(
  axonHubNativeDefinition,
)
