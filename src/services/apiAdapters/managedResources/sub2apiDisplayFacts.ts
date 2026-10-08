import {
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"

export const normalizeList = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value))

const statusToDisplay = (
  status: Sub2ApiAdminApiKeyAccount["status"],
): ResourceDisplayFacts["status"] => {
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Active)
    return MANAGED_RESOURCE_STATUSES.Enabled
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive)
    return MANAGED_RESOURCE_STATUSES.Disabled
  if (status === SUB2API_MANAGED_RESOURCE_STATUS.Error)
    return MANAGED_RESOURCE_STATUSES.AutoDisabled
  return MANAGED_RESOURCE_STATUSES.Unknown
}

export const getBaseUrl = (account: Sub2ApiAdminApiKeyAccount) =>
  typeof account.credentials?.base_url === "string"
    ? account.credentials.base_url
    : ""

export const getModelMapping = (account: Sub2ApiAdminApiKeyAccount) => {
  const mapping = account.credentials?.model_mapping
  if (!isRecord(mapping)) return {}
  return Object.fromEntries(
    Object.entries(mapping).flatMap(([model, target]) => {
      const normalizedModel = model.trim()
      return normalizedModel && typeof target === "string" && target.trim()
        ? [[normalizedModel, target.trim()]]
        : []
    }),
  )
}

export const getModelWhitelist = (account: Sub2ApiAdminApiKeyAccount) =>
  Object.keys(getModelMapping(account))

export const hasSavedKey = (account: Sub2ApiAdminApiKeyAccount) =>
  account.credentials_status?.has_api_key === true

const baseFacts = (
  account: Sub2ApiAdminApiKeyAccount,
  normalizedStatus: ResourceDisplayFacts["status"],
): ResourceDisplayFact[] => {
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: account.name,
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: normalizedStatus,
    },
    {
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: hasSavedKey(account)
        ? MANAGED_RESOURCE_SECRET_STATES.Available
        : MANAGED_RESOURCE_SECRET_STATES.Unavailable,
    },
  ]
  const baseUrl = getBaseUrl(account)
  if (baseUrl) {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: baseUrl,
    })
  }
  if (typeof account.concurrency === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: account.concurrency,
    })
  }
  if (typeof account.priority === "number") {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
      value: account.priority,
    })
  }
  const models = getModelWhitelist(account)
  if (models.length > 0) {
    facts.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List,
      value: models,
    })
  }
  return facts
}

export const toFacts = (
  account: Sub2ApiAdminApiKeyAccount,
  ref: ManagedResourceRef,
  includeNotes: boolean,
): ResourceDisplayFacts => {
  const normalizedStatus = statusToDisplay(account.status)
  const fields = baseFacts(account, normalizedStatus)
  if (includeNotes && typeof account.notes === "string" && account.notes) {
    fields.push({
      fieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Notes,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: account.notes,
    })
  }
  return {
    keyCleanupBaseUrls: [getBaseUrl(account)],
    ref,
    displayName: account.name || `Sub2API account ${account.id}`,
    status: normalizedStatus,
    fields,
    searchValues: [
      account.platform,
      SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[account.platform],
      getBaseUrl(account),
      ...getModelWhitelist(account),
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}
