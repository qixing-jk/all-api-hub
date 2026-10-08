import { GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/gptLoad"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type GptLoadGroupDetail } from "~/services/apiAdapters/managedResources/gptLoad/nativeContracts"
import { GPT_LOAD_SECRET_STATES } from "~/services/apiService/gptLoad/redaction"

const toSecretState = (
  state:
    | (typeof GPT_LOAD_SECRET_STATES)[keyof typeof GPT_LOAD_SECRET_STATES]
    | (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES],
): (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES] => {
  switch (state) {
    case GPT_LOAD_SECRET_STATES.Available:
    case MANAGED_RESOURCE_SECRET_STATES.Available:
      return MANAGED_RESOURCE_SECRET_STATES.Available
    case GPT_LOAD_SECRET_STATES.Masked:
    case MANAGED_RESOURCE_SECRET_STATES.Masked:
      return MANAGED_RESOURCE_SECRET_STATES.Masked
    default:
      return MANAGED_RESOURCE_SECRET_STATES.Unavailable
  }
}

export const toFacts = (
  detail: GptLoadGroupDetail,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const sanitized = detail.group
  const status = sanitized.enabled
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.name,
    },
    {
      fieldId: fields.Provider,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.channelName || sanitized.channelId,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.baseUrl,
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: [...detail.models],
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: toSecretState(sanitized.secretState),
    },
    {
      fieldId: fields.PriceMultiplier,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.priceMultiplier,
    },
    ...(sanitized.weight === null
      ? []
      : [
          {
            fieldId: fields.Weight,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
            value: sanitized.weight,
          } satisfies ResourceDisplayFact,
        ]),
  ]

  return {
    keyCleanupBaseUrls: [sanitized.baseUrl],
    ref,
    displayName: sanitized.name,
    status,
    fields: facts,
    searchValues: [
      sanitized.channelId,
      sanitized.channelName,
      sanitized.baseUrl,
      ...sanitized.models,
    ].filter(Boolean),
    actions: { canUpdate: true, canDelete: true },
  }
}
