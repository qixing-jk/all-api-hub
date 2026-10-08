import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeNames,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
} from "~/constants/claudeCodeHub"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type {
  ClaudeCodeHubAllowedModel,
  ClaudeCodeHubProviderDisplay,
} from "~/types/claudeCodeHub"
import { normalizeList } from "~/utils/core/string"

export const normalizeClaudeCodeHubAllowedModels = (
  allowedModels?: ClaudeCodeHubAllowedModel[] | null,
): string[] =>
  normalizeList(
    (allowedModels ?? []).flatMap((item) => {
      if (typeof item === "string") return [item]
      if (item?.matchType && item.matchType !== "exact") return []
      return item?.pattern ? [item.pattern] : []
    }),
  )

export const nonExactAllowedModels = (
  allowedModels?: ClaudeCodeHubAllowedModel[] | null,
): ClaudeCodeHubAllowedModel[] =>
  (allowedModels ?? []).filter(
    (item) =>
      typeof item !== "string" && item?.matchType && item.matchType !== "exact",
  )

export const toExactAllowedModels = (
  models: readonly string[],
): ClaudeCodeHubAllowedModel[] =>
  normalizeList(models).map((pattern) => ({ matchType: "exact", pattern }))

export const providerType = (detail: ClaudeCodeHubProviderDisplay) =>
  detail.providerType?.trim() || CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE

const providerTypeLabel = (detail: ClaudeCodeHubProviderDisplay) =>
  ClaudeCodeHubProviderTypeNames[
    providerType(detail) as keyof typeof ClaudeCodeHubProviderTypeNames
  ] ?? providerType(detail)

const resourceStatus = (
  detail: ClaudeCodeHubProviderDisplay,
): ResourceDisplayFacts["status"] =>
  detail.isEnabled === false
    ? MANAGED_RESOURCE_STATUSES.Disabled
    : MANAGED_RESOURCE_STATUSES.Enabled

export const secretState = (detail: ClaudeCodeHubProviderDisplay) => {
  if (hasUsableManagedSiteChannelKey(detail.key)) {
    return MANAGED_RESOURCE_SECRET_STATES.Available
  }
  return detail.maskedKey?.trim() || detail.key?.trim()
    ? MANAGED_RESOURCE_SECRET_STATES.Masked
    : MANAGED_RESOURCE_SECRET_STATES.Unavailable
}

export const toFacts = (
  detail: ClaudeCodeHubProviderDisplay,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const models = normalizeClaudeCodeHubAllowedModels(detail.allowedModels)
  const status = resourceStatus(detail)
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.name || `Provider ${detail.id}`,
    },
    {
      fieldId: fields.Type,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: providerType(detail),
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.url ?? "",
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: secretState(detail),
    },
    {
      fieldId: fields.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: models,
    },
    {
      fieldId: fields.GroupTag,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: detail.groupTag?.trim() || "default",
    },
    {
      fieldId: fields.Priority,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: detail.priority ?? 0,
    },
    {
      fieldId: fields.Weight,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: Number.isFinite(detail.weight) ? Math.max(1, detail.weight!) : 1,
    },
  ]

  return {
    keyCleanupBaseUrls: [detail.url ?? ""],
    ref,
    displayName: detail.name || `Provider ${detail.id}`,
    status,
    fields: facts,
    searchValues: [
      providerType(detail),
      providerTypeLabel(detail),
      detail.url ?? "",
      detail.groupTag ?? "",
      ...models,
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
