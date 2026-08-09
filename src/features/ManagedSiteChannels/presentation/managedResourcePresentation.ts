import type { TFunction } from "i18next"

import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_EDITABLE_FIELD_IDS,
} from "~/constants/axonHub"
import type {
  ManagedResourceRef,
  ResourceDisplayFact,
  ResourceDisplayFacts,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import type { ManagedChannelsRowViewModel } from "./contracts"
import {
  MANAGED_RESOURCE_CHANNEL_TYPE_FALLBACK_LABEL_RESOLVER,
  MANAGED_RESOURCE_CHANNEL_TYPE_LABEL_RESOLVERS,
  MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER,
  MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS,
  type ManagedResourceTextResolver,
} from "./managedResourceFieldPolicy"

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

const BOOLEAN_LABEL_RESOLVERS = {
  true: (t: TFunction) => t("common:status.enabled"),
  false: (t: TFunction) => t("common:status.disabled"),
} as const satisfies Record<"true" | "false", ManagedResourceTextResolver>

const SECRET_STATE_LABEL_RESOLVERS = {
  available: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.available"),
  masked: (t: TFunction) => t("managedSiteChannels:editor.secret.state.masked"),
  unavailable: (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.unavailable"),
  "permission-hidden": (t: TFunction) =>
    t("managedSiteChannels:editor.secret.state.permissionHidden"),
} as const

const safeFieldIds = new Set<string>(AXON_HUB_EDITABLE_FIELD_IDS)

const safeSearchFieldIds = new Set<string>([
  AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
  AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
  AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
  AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
  AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
])

const refIdentity = (ref: ManagedResourceRef) =>
  JSON.stringify([ref.siteType, ref.kind, ref.scopeKey, ref.resourceId])

const safeCell = (
  fact: ResourceDisplayFact,
  t: TFunction,
  allowedFieldIds: ReadonlySet<string>,
  allowSecretFacts: boolean,
) => {
  if (!allowedFieldIds.has(fact.fieldId)) return null
  if (fact.kind === "secret") {
    if (!allowSecretFacts) return null
    return {
      kind: "text" as const,
      value: SECRET_STATE_LABEL_RESOLVERS[fact.state](t),
      sortValue: fact.state,
    }
  }
  if (fact.kind === "list") {
    return {
      kind: "groups" as const,
      values: [...fact.value],
      sortValue: fact.value.join("\u0000"),
    }
  }
  const value =
    fact.kind === "boolean"
      ? BOOLEAN_LABEL_RESOLVERS[String(fact.value) as "true" | "false"](t)
      : String(fact.value)
  const displayValue =
    fact.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.TYPE
      ? resolveOptionLabel(
          MANAGED_RESOURCE_CHANNEL_TYPE_LABEL_RESOLVERS,
          value,
          MANAGED_RESOURCE_CHANNEL_TYPE_FALLBACK_LABEL_RESOLVER,
          t,
        )
      : value
  return {
    kind: "text" as const,
    value: displayValue,
    sortValue:
      typeof fact.value === "boolean" ? Number(fact.value) : fact.value,
  }
}

const safeSearchValue = (
  fact: ResourceDisplayFact,
  allowedSearchFieldIds: ReadonlySet<string>,
) => {
  if (!allowedSearchFieldIds.has(fact.fieldId) || fact.kind === "secret")
    return null
  if (fact.kind === "list") return fact.value.join(" ")
  return String(fact.value)
}

/** Maps adapter facts to the finite, display-safe shared table contract. */
export function createManagedResourcePresentationMapper({
  resolveLabel = identityTranslation,
  fieldIds,
}: { resolveLabel?: TFunction; fieldIds?: readonly string[] } = {}) {
  const allowedFieldIds = new Set(fieldIds ?? safeFieldIds)
  const allowedSearchFieldIds = new Set(fieldIds ?? safeSearchFieldIds)
  const allowSecretFacts = fieldIds !== undefined
  const identities = new Map<string, { rowKey: string; testToken: string }>()
  const refs = new Map<string, ManagedResourceRef>()
  let sequence = 0

  const identityFor = (ref: ManagedResourceRef) => {
    const key = refIdentity(ref)
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
        status: {
          kind: "status",
          value: resolveOptionLabel(
            MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS,
            facts.status,
            MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER,
            resolveLabel,
          ),
          sortValue: facts.status,
          tone:
            facts.status === "enabled"
              ? "success"
              : facts.status === "unknown"
                ? "warning"
                : "default",
        },
      }
      for (const fact of facts.fields) {
        if (fact.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.STATUS) continue
        const cell = safeCell(
          fact,
          resolveLabel,
          allowedFieldIds,
          allowSecretFacts,
        )
        if (cell) cells[fact.fieldId] = cell
      }
      const baseURLFact = facts.fields.find(
        (fact) =>
          fact.fieldId === AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL &&
          fact.kind === "text",
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
        baseURL: baseURLFact?.kind === "text" ? baseURLFact.value : "",
        searchText,
        cells,
        capabilities: {
          canView: true,
          canEdit: facts.actions.canUpdate,
          canDelete: facts.actions.canDelete,
        },
      }
    },
    accept(facts: readonly ResourceDisplayFacts[]) {
      const acceptedKeys = new Set(facts.map((item) => refIdentity(item.ref)))
      for (const [key, identity] of identities) {
        if (!acceptedKeys.has(key)) {
          identities.delete(key)
          refs.delete(identity.rowKey)
        }
      }
      return facts.map((item) => this.map(item))
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
