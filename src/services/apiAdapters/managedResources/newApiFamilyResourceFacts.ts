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

import type { NewApiFamilyChannelFields } from "./newApiFamilyChannelFields"

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

type NativeChannelStatusCodes = {
  readonly Enable: number
  readonly ManuallyDisabled: number
  readonly AutoDisabled: number
}

const statusToDisplay = (
  status: NewApiFamilyChannelFields["status"],
  codes: NativeChannelStatusCodes,
): ResourceDisplayFacts["status"] => {
  if (status === codes.Enable) return MANAGED_RESOURCE_STATUSES.Enabled
  if (status === codes.ManuallyDisabled) {
    return MANAGED_RESOURCE_STATUSES.ManuallyDisabled
  }
  if (status === codes.AutoDisabled) {
    return MANAGED_RESOURCE_STATUSES.AutoDisabled
  }
  return MANAGED_RESOURCE_STATUSES.Unknown
}

const secretState = (
  key: NewApiFamilyChannelFields["key"],
  emptyState: ResourceSecretState,
) => {
  if (hasUsableManagedSiteChannelKey(key)) {
    return MANAGED_RESOURCE_SECRET_STATES.Available
  }
  return key?.trim() ? MANAGED_RESOURCE_SECRET_STATES.Masked : emptyState
}

/** Builds display facts from the native fields shared by these provider editors. */
export function createNewApiFamilyResourceFacts(policy: {
  fields: NewApiFamilyResourceFieldIds
  typeNames: Readonly<Record<number, string>>
  statusCodes: NativeChannelStatusCodes
  emptyInventorySecretState: ResourceSecretState
}) {
  const getSearchData = (channel: NewApiFamilyChannelFields) => {
    const models = parseNewApiResourceList(channel.models)
    const groups = parseNewApiResourceList(channel.group)
    const rawType = String(channel.type)
    const typeLabel = policy.typeNames[Number(channel.type)] ?? rawType
    return {
      models,
      groups,
      typeLabel,
      searchValues: [
        channel.name,
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
    channel: NewApiFamilyChannelFields,
    ref: ManagedResourceRef,
    options: { inventory: boolean },
  ): ResourceDisplayFacts => {
    const { models, groups, searchValues } = getSearchData(channel)
    const rawType = String(channel.type)
    const status = statusToDisplay(channel.status, policy.statusCodes)
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
