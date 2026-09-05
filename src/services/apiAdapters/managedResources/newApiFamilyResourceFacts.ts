import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
  type ResourceSecretState,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { parseNewApiResourceList } from "~/services/apiAdapters/managedResources/newApiResourceUtils"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { CHANNEL_STATUS } from "~/types/newApi"

type NewApiFamilyResourceFieldIds = {
  readonly Id: string
  readonly Name: string
  readonly Type: string
  readonly Status: string
  readonly BaseUrl: string
  readonly Key: string
  readonly Models: string
  readonly ModelCount: string
  readonly Groups: string
  readonly Priority: string
  readonly Weight: string
}

const statusToDisplay = (
  status: ManagedSiteChannel["status"],
): ResourceDisplayFacts["status"] => {
  if (status === CHANNEL_STATUS.Enable) return MANAGED_RESOURCE_STATUSES.Enabled
  if (status === CHANNEL_STATUS.ManuallyDisabled) {
    return MANAGED_RESOURCE_STATUSES.ManuallyDisabled
  }
  if (status === CHANNEL_STATUS.AutoDisabled) {
    return MANAGED_RESOURCE_STATUSES.AutoDisabled
  }
  return MANAGED_RESOURCE_STATUSES.Unknown
}

const secretState = (
  key: ManagedSiteChannel["key"],
  emptyState: ResourceSecretState,
) => {
  if (hasUsableManagedSiteChannelKey(key)) {
    return MANAGED_RESOURCE_SECRET_STATES.Available
  }
  return key?.trim() ? MANAGED_RESOURCE_SECRET_STATES.Masked : emptyState
}

/** Builds provider-owned facts and search values for New API-shaped channels. */
export function createNewApiFamilyResourceFacts(policy: {
  fields: NewApiFamilyResourceFieldIds
  typeNames: Readonly<Record<number, string>>
  emptyInventorySecretState: ResourceSecretState
}) {
  const getSearchData = (channel: ManagedSiteChannel) => {
    const models = parseNewApiResourceList(channel.models)
    const groups = parseNewApiResourceList(channel.group)
    const rawType = String(channel.type)
    const typeLabel = policy.typeNames[Number(channel.type)] ?? rawType
    return {
      models,
      groups,
      typeLabel,
      searchValues: [
        String(channel.id),
        rawType,
        typeLabel,
        channel.base_url ?? "",
        ...models,
        ...groups,
      ],
    }
  }

  const toFacts = (
    channel: ManagedSiteChannel,
    ref: ManagedResourceRef,
    options: { inventory: boolean },
  ): ResourceDisplayFacts => {
    const { models, groups, searchValues } = getSearchData(channel)
    const rawType = String(channel.type)
    const status = statusToDisplay(channel.status)
    const emptySecretState = options.inventory
      ? policy.emptyInventorySecretState
      : MANAGED_RESOURCE_SECRET_STATES.Unavailable
    const fields: ResourceDisplayFact[] = [
      {
        fieldId: policy.fields.Id,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.id,
      },
      {
        fieldId: policy.fields.Name,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: channel.name,
      },
      {
        fieldId: policy.fields.Type,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: rawType,
      },
      {
        fieldId: policy.fields.Status,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: status,
      },
      {
        fieldId: policy.fields.BaseUrl,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
        value: channel.base_url ?? "",
      },
      {
        fieldId: policy.fields.Key,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
        state: secretState(channel.key, emptySecretState),
      },
      {
        fieldId: policy.fields.Models,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
        value: models,
      },
      {
        fieldId: policy.fields.ModelCount,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: models.length,
      },
      {
        fieldId: policy.fields.Groups,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
        value: groups,
      },
      {
        fieldId: policy.fields.Priority,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.priority,
      },
      {
        fieldId: policy.fields.Weight,
        kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
        value: channel.weight,
      },
    ]
    return {
      ref,
      displayName: channel.name || `Channel ${channel.id}`,
      status,
      fields,
      searchValues,
      actions: {
        canUpdate: true,
        canDelete: true,
        channel: {
          channelId: channel.id,
          channelType: channel.type,
          canSyncModels: true,
          canOpenModelSync: true,
          canConfigureModelFilters: true,
        },
      },
    }
  }

  return { getSearchData, toFacts }
}
