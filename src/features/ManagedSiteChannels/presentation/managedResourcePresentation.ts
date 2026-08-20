import type { TFunction } from "i18next"

import type {
  ManagedResourceChannelActionFacts,
  ManagedResourceRef,
  ResourceDisplayFact,
  ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import { getManagedResourceRefKey } from "../utils/managedResource"
import type {
  ManagedChannelsCellTone,
  ManagedChannelsRowViewModel,
} from "./contracts"
import {
  MANAGED_CHANNELS_CELL_KINDS,
  MANAGED_CHANNELS_CELL_TONES,
  MANAGED_CHANNELS_COLUMN_IDS,
} from "./contracts"

type ManagedResourceTextResolver = (t: TFunction) => string

const identityTranslation = ((key: string) => key) as TFunction

const resolveOptionLabel = (
  labels: Readonly<Record<string, ManagedResourceTextResolver>>,
  value: string,
  fallback: ManagedResourceTextResolver,
  t: TFunction,
) =>
  (Object.prototype.hasOwnProperty.call(labels, value)
    ? labels[value]
    : fallback)(t)

const MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS = {
  [MANAGED_RESOURCE_STATUSES.Enabled]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.enabled"),
  [MANAGED_RESOURCE_STATUSES.Disabled]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.disabled"),
  [MANAGED_RESOURCE_STATUSES.ManuallyDisabled]: (t: TFunction) =>
    t("managedSiteChannels:statusLabels.manualPause"),
  [MANAGED_RESOURCE_STATUSES.Archived]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.archived"),
  [MANAGED_RESOURCE_STATUSES.AutoDisabled]: (t: TFunction) =>
    t("managedSiteChannels:statusLabels.autoDisabled"),
  [MANAGED_RESOURCE_STATUSES.Unknown]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.unknown"),
} as const satisfies Record<
  ResourceDisplayFacts["status"],
  ManagedResourceTextResolver
>

const MANAGED_RESOURCE_STATUS_TONES = {
  [MANAGED_RESOURCE_STATUSES.Enabled]: MANAGED_CHANNELS_CELL_TONES.Success,
  [MANAGED_RESOURCE_STATUSES.Disabled]: MANAGED_CHANNELS_CELL_TONES.Default,
  [MANAGED_RESOURCE_STATUSES.ManuallyDisabled]:
    MANAGED_CHANNELS_CELL_TONES.Warning,
  [MANAGED_RESOURCE_STATUSES.Archived]: MANAGED_CHANNELS_CELL_TONES.Default,
  [MANAGED_RESOURCE_STATUSES.AutoDisabled]: MANAGED_CHANNELS_CELL_TONES.Warning,
  [MANAGED_RESOURCE_STATUSES.Unknown]: MANAGED_CHANNELS_CELL_TONES.Warning,
} as const satisfies Record<
  ResourceDisplayFacts["status"],
  ManagedChannelsCellTone
>

const MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER = (t: TFunction) =>
  t("managedSiteChannels:editor.options.status.unknown")

const BOOLEAN_LABEL_RESOLVERS = {
  true: (t: TFunction) => t("common:status.enabled"),
  false: (t: TFunction) => t("common:status.disabled"),
} as const satisfies Record<"true" | "false", ManagedResourceTextResolver>

const SECRET_STATE_LABEL_RESOLVERS = {
  [MANAGED_RESOURCE_SECRET_STATES.Available]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.available"),
  [MANAGED_RESOURCE_SECRET_STATES.Masked]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.masked"),
  [MANAGED_RESOURCE_SECRET_STATES.Unavailable]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.unavailable"),
  [MANAGED_RESOURCE_SECRET_STATES.PermissionHidden]: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.permissionHidden"),
} as const

export type ManagedResourcePresentationSemantics = {
  /** Field that supplies the shared row base URL. */
  baseUrlFieldId?: string
  /** Detail fact superseded by the normalized top-level status fact. */
  statusFieldId?: string
  /** Provider-owned display vocabulary for protocol-valued fields. */
  fieldValuePresentations?: Readonly<
    Record<
      string,
      {
        optionLabelResolvers: Readonly<
          Record<string, ManagedResourceTextResolver>
        >
        resolveOptionFallback?: ManagedResourceTextResolver
      }
    >
  >
}

export const DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS = {
  baseUrlFieldId: "baseURL",
  statusFieldId: "status",
} as const satisfies ManagedResourcePresentationSemantics

const normalizeChannelActions = (
  value: ManagedResourceChannelActionFacts | undefined,
): ManagedResourceChannelActionFacts | undefined => {
  if (
    !value ||
    !Number.isSafeInteger(value.channelId) ||
    value.channelId <= 0 ||
    (typeof value.channelType !== "string" &&
      typeof value.channelType !== "number")
  ) {
    return undefined
  }

  return {
    channelId: value.channelId,
    channelType: value.channelType,
    canSyncModels: value.canSyncModels === true,
    canOpenModelSync: value.canOpenModelSync === true,
    canConfigureModelFilters: value.canConfigureModelFilters === true,
  }
}

const safeCell = (
  fact: ResourceDisplayFact,
  t: TFunction,
  allowedFieldIds: ReadonlySet<string>,
  allowSecretFacts: boolean,
  fieldValuePresentations:
    | ManagedResourcePresentationSemantics["fieldValuePresentations"]
    | undefined,
) => {
  if (!allowedFieldIds.has(fact.fieldId)) return null
  if (fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret) {
    if (!allowSecretFacts) return null
    return {
      kind: MANAGED_CHANNELS_CELL_KINDS.Text,
      value: SECRET_STATE_LABEL_RESOLVERS[fact.state](t),
      sortValue: fact.state,
    }
  }
  if (fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List) {
    return {
      kind: MANAGED_CHANNELS_CELL_KINDS.Groups,
      values: [...fact.value],
      sortValue: fact.value.join("\u0000"),
    }
  }
  const value =
    fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Boolean
      ? BOOLEAN_LABEL_RESOLVERS[String(fact.value) as "true" | "false"](t)
      : String(fact.value)
  const valuePresentation = fieldValuePresentations?.[fact.fieldId]
  const displayValue = valuePresentation
    ? resolveOptionLabel(
        valuePresentation.optionLabelResolvers,
        value,
        valuePresentation.resolveOptionFallback ?? (() => value),
        t,
      )
    : value
  return {
    kind: MANAGED_CHANNELS_CELL_KINDS.Text,
    value: displayValue,
    sortValue:
      fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Boolean
        ? Number(fact.value)
        : fact.value,
  }
}

const safeSearchValue = (
  fact: ResourceDisplayFact,
  allowedSearchFieldIds: ReadonlySet<string>,
) => {
  if (
    !allowedSearchFieldIds.has(fact.fieldId) ||
    fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret
  )
    return null
  if (fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List)
    return fact.value.join(" ")
  return String(fact.value)
}

/** Maps adapter facts to the finite, display-safe shared table contract. */
export function createManagedResourcePresentationMapper({
  resolveLabel = identityTranslation,
  fieldIds,
  semantics = DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
}: {
  resolveLabel?: TFunction
  fieldIds?: readonly string[]
  semantics?: ManagedResourcePresentationSemantics
} = {}) {
  const allowedFieldIds = new Set(fieldIds ?? [])
  const allowedSearchFieldIds = new Set(fieldIds ?? [])
  const allowSecretFacts = fieldIds !== undefined
  const identities = new Map<string, { rowKey: string; testToken: string }>()
  const refs = new Map<string, ManagedResourceRef>()
  let sequence = 0

  const identityFor = (ref: ManagedResourceRef) => {
    const key = getManagedResourceRefKey(ref)
    let identity = identities.get(key)
    if (!identity) {
      sequence += 1
      identity = {
        rowKey: `resource-row-${sequence}`,
        testToken: `resource-${sequence}`,
      }
      identities.set(key, identity)
    }
    refs.set(identity.rowKey, ref)
    return identity
  }

  return {
    map(facts: ResourceDisplayFacts): ManagedChannelsRowViewModel {
      const identity = identityFor(facts.ref)
      const cells: ManagedChannelsRowViewModel["cells"] = {
        [MANAGED_CHANNELS_COLUMN_IDS.Status]: {
          kind: MANAGED_CHANNELS_CELL_KINDS.Status,
          value: resolveOptionLabel(
            MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS,
            facts.status,
            MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER,
            resolveLabel,
          ),
          sortValue: facts.status,
          tone:
            MANAGED_RESOURCE_STATUS_TONES[
              facts.status as ResourceDisplayFacts["status"]
            ] ?? MANAGED_CHANNELS_CELL_TONES.Warning,
        },
      }
      for (const fact of facts.fields) {
        if (fact.fieldId === semantics.statusFieldId) continue
        const cell = safeCell(
          fact,
          resolveLabel,
          allowedFieldIds,
          allowSecretFacts,
          semantics.fieldValuePresentations,
        )
        if (cell) cells[fact.fieldId] = cell
      }
      const baseURLFact = facts.fields.find(
        (fact) =>
          fact.fieldId === semantics.baseUrlFieldId &&
          fact.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text,
      )
      const searchText = [
        facts.displayName,
        facts.status,
        ...(facts.searchValues ?? []),
        ...facts.fields
          .map((fact) => safeSearchValue(fact, allowedSearchFieldIds))
          .filter((value): value is string => Boolean(value)),
      ].join(" ")
      return {
        ...identity,
        displayIdentifier: "",
        displayIdentifierSort: facts.displayName,
        name: facts.displayName,
        baseURL:
          baseURLFact?.kind === MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Text
            ? baseURLFact.value
            : "",
        searchText,
        cells,
        capabilities: {
          canView: true,
          canEdit: facts.actions.canUpdate,
          canDelete: facts.actions.canDelete,
        },
        channelActions: normalizeChannelActions(facts.actions.channel),
      }
    },
    accept(facts: readonly ResourceDisplayFacts[]) {
      const acceptedKeys = new Set(
        facts.map((item) => getManagedResourceRefKey(item.ref)),
      )
      for (const [key, identity] of identities) {
        if (!acceptedKeys.has(key)) {
          identities.delete(key)
          refs.delete(identity.rowKey)
        }
      }
      return facts.map((item) => this.map(item))
    },
    remove(rowKeys: readonly string[]) {
      for (const rowKey of rowKeys) {
        const ref = refs.get(rowKey)
        refs.delete(rowKey)
        if (ref) identities.delete(getManagedResourceRefKey(ref))
      }
    },
    resolveRef(rowKey: string) {
      return refs.get(rowKey)
    },
    reset() {
      identities.clear()
      refs.clear()
    },
  }
}
