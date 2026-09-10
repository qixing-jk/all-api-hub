import {
  MANAGED_RESOURCE_DISPLAY_FACT_KINDS,
  type ManagedResourceChannelActionFacts,
  type ManagedResourceRef,
  type ResourceDisplayFact,
  type ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"

import {
  MANAGED_CHANNELS_CELL_KINDS,
  MANAGED_CHANNELS_COLUMN_IDS,
} from "../presentation/contracts"
import {
  DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
  type ManagedResourceCellData,
  type ManagedResourcePresentationSemantics,
  type ManagedResourceRowData,
} from "../presentation/managedResourcePresentation"

const normalizeChannelActions = (
  value: ManagedResourceChannelActionFacts | undefined,
): ManagedResourceChannelActionFacts | undefined => {
  if (
    !value ||
    (typeof value.channelType !== "string" &&
      typeof value.channelType !== "number")
  ) {
    return undefined
  }

  return {
    channelType: value.channelType,
    canSyncModels: value.canSyncModels === true,
    canOpenModelSync: value.canOpenModelSync === true,
    canConfigureModelFilters: value.canConfigureModelFilters === true,
  }
}

const safeCell = (
  fact: ResourceDisplayFact,
  allowedFieldIds: ReadonlySet<string>,
): ManagedResourceCellData | null => {
  if (!allowedFieldIds.has(fact.fieldId)) return null
  switch (fact.kind) {
    case MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Secret:
      return { kind: "secret", state: fact.state, sortValue: fact.state }
    case MANAGED_RESOURCE_DISPLAY_FACT_KINDS.Boolean:
      return {
        kind: "boolean",
        value: fact.value,
        sortValue: Number(fact.value),
      }
    case MANAGED_RESOURCE_DISPLAY_FACT_KINDS.List:
      return {
        kind: MANAGED_CHANNELS_CELL_KINDS.Groups,
        values: [...fact.value],
        sortValue: fact.value.join("\u0000"),
      }
    default:
      return {
        kind: MANAGED_CHANNELS_CELL_KINDS.Text,
        value: String(fact.value),
        sortValue: fact.value,
      }
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

/** Owns opaque row identities and accepts only product-approved display data. */
export function createManagedResourceRowMapper({
  fieldIds,
  semantics = DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
}: {
  fieldIds?: readonly string[]
  semantics?: ManagedResourcePresentationSemantics
} = {}) {
  const allowedFieldIds = new Set(fieldIds ?? [])
  const allowedSearchFieldIds = new Set(fieldIds ?? [])
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
    map(facts: ResourceDisplayFacts): ManagedResourceRowData {
      const identity = identityFor(facts.ref)
      const cells: ManagedResourceRowData["cells"] = {
        [MANAGED_CHANNELS_COLUMN_IDS.Status]: {
          kind: MANAGED_CHANNELS_CELL_KINDS.Status,
          value: facts.status,
          sortValue: facts.status,
        },
      }
      for (const fact of facts.fields) {
        if (fact.fieldId === semantics.statusFieldId) continue
        const cell = safeCell(fact, allowedFieldIds)
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
