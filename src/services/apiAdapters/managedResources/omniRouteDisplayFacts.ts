import {
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS as fields,
  OMNIROUTE_PRIORITY_RANGE,
} from "~/constants/omniroute"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  OMNIROUTE_SECRET_STATES,
  type OmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"

export const toSecretState = (
  state: OmniRouteSanitizedConnection["secretState"],
): (typeof MANAGED_RESOURCE_SECRET_STATES)[keyof typeof MANAGED_RESOURCE_SECRET_STATES] => {
  switch (state) {
    case OMNIROUTE_SECRET_STATES.Available:
      return MANAGED_RESOURCE_SECRET_STATES.Available
    case OMNIROUTE_SECRET_STATES.Masked:
      return MANAGED_RESOURCE_SECRET_STATES.Masked
    default:
      return MANAGED_RESOURCE_SECRET_STATES.Unavailable
  }
}

const displayedProvider = (sanitized: OmniRouteSanitizedConnection): string =>
  sanitized.nodePrefix
    ? `${sanitized.provider} (${sanitized.nodePrefix})`
    : sanitized.provider

/**
 * The gateway's routing rank, or null when the row reports none. The update
 * route only accepts `1..100_000`, so a row outside that range is treated as
 * "no rank to show" instead of being echoed back as a value the user could
 * never save.
 */
const connectionPriority = (
  sanitized: OmniRouteSanitizedConnection,
): number | null =>
  sanitized.priority !== null &&
  sanitized.priority >= OMNIROUTE_PRIORITY_RANGE.min &&
  sanitized.priority <= OMNIROUTE_PRIORITY_RANGE.max
    ? sanitized.priority
    : null

/** The rank the editor starts from; the number control has no empty state. */
export const editablePriority = (
  sanitized: OmniRouteSanitizedConnection,
): number => connectionPriority(sanitized) ?? OMNIROUTE_PRIORITY_RANGE.min

export const toFacts = (
  sanitized: OmniRouteSanitizedConnection,
  ref: ManagedResourceRef,
): ResourceDisplayFacts => {
  const status = sanitized.isActive
    ? MANAGED_RESOURCE_STATUSES.Enabled
    : MANAGED_RESOURCE_STATUSES.Disabled
  const rank = connectionPriority(sanitized)
  const facts: ResourceDisplayFact[] = [
    {
      fieldId: fields.Name,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.name,
    },
    {
      fieldId: fields.Provider,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: displayedProvider(sanitized),
    },
    {
      fieldId: fields.Status,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: status,
    },
    {
      fieldId: fields.BaseUrl,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.baseUrl,
    },
    {
      fieldId: fields.Key,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret,
      state: toSecretState(sanitized.secretState),
    },
    {
      fieldId: fields.DefaultModel,
      kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      value: sanitized.defaultModel,
    },
    // A prefix only exists once a dedicated provider node backs the connection,
    // so a connection without one has no row to show rather than an empty one.
    ...(sanitized.nodePrefix
      ? [
          {
            fieldId: fields.Prefix,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.nodePrefix,
          } satisfies ResourceDisplayFact,
        ]
      : []),
    ...(rank === null
      ? []
      : [
          {
            fieldId: fields.Priority,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Number,
            value: rank,
          } satisfies ResourceDisplayFact,
        ]),
    // Before the gateway's first test there is no state to report.
    ...(sanitized.testStatus
      ? [
          {
            fieldId: fields.TestStatus,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.testStatus,
          } satisfies ResourceDisplayFact,
        ]
      : []),
    ...(sanitized.lastError
      ? [
          {
            fieldId: fields.LastError,
            kind: MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
            value: sanitized.lastError,
          } satisfies ResourceDisplayFact,
        ]
      : []),
  ]

  return {
    keyCleanupBaseUrls: [sanitized.baseUrl],
    ref,
    displayName: sanitized.name,
    status,
    fields: facts,
    searchValues: [
      sanitized.provider,
      sanitized.nodePrefix,
      sanitized.nodeName,
      sanitized.baseUrl,
      sanitized.defaultModel,
    ].filter(Boolean),
    actions: { canUpdate: true, canDelete: true },
  }
}
