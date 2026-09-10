import type { TFunction } from "i18next"

import {
  MANAGED_RESOURCE_SECRET_STATES,
  MANAGED_RESOURCE_STATUSES,
  type ResourceDisplayFacts,
  type ResourceSecretState,
} from "~/services/apiAdapters/contracts/managedResourceNative"

import type {
  ManagedChannelsCell,
  ManagedChannelsCellTone,
  ManagedChannelsRowViewModel,
} from "./contracts"
import {
  MANAGED_CHANNELS_CELL_KINDS,
  MANAGED_CHANNELS_CELL_TONES,
} from "./contracts"

type ManagedResourceTextResolver = (t: TFunction) => string

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

/** Safe native values retained independently of the current UI language. */
export type ManagedResourceCellData =
  | Exclude<ManagedChannelsCell, { kind: "status" }>
  | { kind: "status"; value: string; sortValue: string | number }
  | { kind: "boolean"; value: boolean; sortValue: number }
  | {
      kind: "secret"
      state: ResourceSecretState
      sortValue: ResourceSecretState
    }

export type ManagedResourceRowData = Omit<
  ManagedChannelsRowViewModel,
  "cells"
> & {
  cells: Record<string, ManagedResourceCellData>
}

const presentCell = (
  cell: ManagedResourceCellData,
  t: TFunction,
  valuePresentation:
    | NonNullable<
        ManagedResourcePresentationSemantics["fieldValuePresentations"]
      >[string]
    | undefined,
): ManagedChannelsCell => {
  switch (cell.kind) {
    case "status":
      return {
        ...cell,
        value: resolveOptionLabel(
          MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS,
          String(cell.sortValue),
          MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER,
          t,
        ),
        tone:
          MANAGED_RESOURCE_STATUS_TONES[
            cell.sortValue as ResourceDisplayFacts["status"]
          ] ?? MANAGED_CHANNELS_CELL_TONES.Warning,
      }
    case "boolean":
      return {
        kind: MANAGED_CHANNELS_CELL_KINDS.Text,
        value:
          BOOLEAN_LABEL_RESOLVERS[String(cell.value) as "true" | "false"](t),
        sortValue: cell.sortValue,
      }
    case "secret":
      return {
        kind: MANAGED_CHANNELS_CELL_KINDS.Text,
        value: SECRET_STATE_LABEL_RESOLVERS[cell.state](t),
        sortValue: cell.sortValue,
      }
    case "text":
      return {
        ...cell,
        value: valuePresentation
          ? resolveOptionLabel(
              valuePresentation.optionLabelResolvers,
              cell.value,
              valuePresentation.resolveOptionFallback ?? (() => cell.value),
              t,
            )
          : cell.value,
      }
    case "groups":
      return cell
  }
}

/** Derives translated table/detail cells without mutating accepted resource data. */
export function presentManagedResourceRow(
  row: ManagedResourceRowData,
  t: TFunction,
  semantics: ManagedResourcePresentationSemantics = DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
): ManagedChannelsRowViewModel {
  return {
    ...row,
    cells: Object.fromEntries(
      Object.entries(row.cells).map(([fieldId, cell]) => [
        fieldId,
        presentCell(cell, t, semantics.fieldValuePresentations?.[fieldId]),
      ]),
    ),
  }
}
