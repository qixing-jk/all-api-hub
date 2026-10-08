import {
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields,
  OctopusOutboundTypeNames,
} from "~/constants/octopus"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS as facts,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES as statuses,
  type ManagedResourceRef,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  octopusModels,
  octopusSecretState,
} from "~/services/apiAdapters/managedResources/octopusEditor"
import {
  OCTOPUS_CHANNEL_DETAIL_AVAILABILITY,
  type OctopusChannel,
} from "~/types/octopus"

export const toFacts = (
  detail: OctopusChannel,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const summary =
    detail.detailAvailability === OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary
  const models = octopusModels(detail.model)
  const status = detail.enabled ? statuses.Enabled : statuses.Disabled
  const baseUrl = detail.base_urls[0]?.url ?? ""
  return {
    ref,
    displayName: detail.name,
    keyCleanupBaseUrls: detail.base_urls.map((entry) => entry.url),
    status,
    fields: [
      { fieldId: fields.Name, kind: facts.Text, value: detail.name },
      ...(summary
        ? []
        : [
            {
              fieldId: fields.Type,
              kind: facts.Text,
              value: String(detail.type),
            },
          ]),
      { fieldId: fields.Status, kind: facts.Text, value: status },
      { fieldId: fields.BaseUrl, kind: facts.Text, value: baseUrl },
      {
        fieldId: fields.Key,
        kind: facts.Secret,
        state: summary
          ? MANAGED_RESOURCE_SECRET_STATES.PermissionHidden
          : octopusSecretState(detail),
      },
      { fieldId: fields.Models, kind: facts.List, value: models },
    ],
    searchValues: [
      detail.name,
      ...(summary
        ? []
        : [String(detail.type), OctopusOutboundTypeNames[detail.type] ?? ""]),
      baseUrl,
      ...models,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
