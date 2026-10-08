import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
} from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getCredentialState } from "~/services/apiAdapters/managedResources/axonHubCredentialProjection"
import type { AxonHubChannel } from "~/types/axonHub"

const toStatus = (status: string): ResourceDisplayFacts["status"] => {
  switch (status) {
    case AXON_HUB_CHANNEL_STATUS.ENABLED:
      return MANAGED_RESOURCE_STATUSES.Enabled
    case AXON_HUB_CHANNEL_STATUS.DISABLED:
      return MANAGED_RESOURCE_STATUSES.Disabled
    case AXON_HUB_CHANNEL_STATUS.ARCHIVED:
      return MANAGED_RESOURCE_STATUSES.Archived
    case MANAGED_RESOURCE_STATUSES.AutoDisabled:
      return MANAGED_RESOURCE_STATUSES.AutoDisabled
    default:
      return MANAGED_RESOURCE_STATUSES.Unknown
  }
}

export const detailFacts = (
  channel: AxonHubChannel,
): readonly ResourceDisplayFact[] => [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.name,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: String(channel.type),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.baseURL ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: String(channel.status),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
    state: getCredentialState(channel),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.supportedModels ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.manualModels ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.defaultTestModel ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Boolean,
    value: channel.autoSyncSupportedModels ?? false,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.autoSyncModelPattern ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
    value: channel.tags ?? [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
    value: channel.orderingWeight ?? 0,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.remark ?? "",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
    value: channel.settings?.extraModelPrefix ?? "",
  },
]

export const toFacts = (
  channel: AxonHubChannel,
  ref: ManagedResourceRef,
  fields: readonly ResourceDisplayFact[],
  searchValues?: readonly string[],
): ResourceDisplayFacts => {
  const status = toStatus(channel.status)
  const supportedState = status !== MANAGED_RESOURCE_STATUSES.Unknown
  return {
    keyCleanupBaseUrls: [channel.baseURL ?? ""],
    ref,
    displayName: channel.name,
    status,
    fields,
    ...(searchValues?.length ? { searchValues } : {}),
    actions: { canUpdate: supportedState, canDelete: supportedState },
  }
}

export const toListFacts = (
  channel: AxonHubChannel,
  ref: ManagedResourceRef,
) => {
  const selectedFieldIds = new Set(
    getAccountSiteDefinition(SITE_TYPES.AXON_HUB)?.managedResource
      ?.tableFieldIds ?? [],
  )
  const modelNames = Array.from(
    new Set(
      [...(channel.supportedModels ?? []), ...(channel.manualModels ?? [])]
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  )
  return toFacts(
    channel,
    ref,
    detailFacts(channel)
      .filter((fact) => selectedFieldIds.has(fact.fieldId))
      .map((fact) =>
        fact.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS
          ? ({
              fieldId: fact.fieldId,
              kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
              value: modelNames.length,
            } satisfies ResourceDisplayFact)
          : fact,
      ),
    modelNames,
  )
}
