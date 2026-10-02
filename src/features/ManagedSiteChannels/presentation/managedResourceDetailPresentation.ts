import type { TFunction } from "i18next"

import type { ManagedSiteType } from "~/constants/siteType"
import type {
  ManagedResourceKind,
  ManagedResourceProductPolicy,
} from "~/services/accountSiteDefinitions/contracts"

import {
  MANAGED_CHANNELS_CELL_KINDS,
  MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS,
  type ManagedChannelsCell,
  type ManagedChannelsColumn,
  type ManagedChannelsRowViewModel,
} from "./contracts"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "./managedResourceFieldPolicy"
import { getManagedResourcePresentationSemantics } from "./managedResourceTablePolicy"

export type ManagedResourceDetailField = {
  label: string
  value: ManagedChannelsCell
}

/**
 * Fields the workspace accepts for display: the table's columns plus every field
 * the product policy declares for the detail view.
 *
 * Reading both from one projection is what lets a declared detail field render at
 * all — the accepted row is the only place the workspace keeps resource values.
 */
export const createManagedResourceDisplayFieldIds = (
  policy: Pick<
    ManagedResourceProductPolicy,
    "tableFieldIds" | "detailFieldIds"
  >,
): readonly string[] => [
  ...new Set([...policy.tableFieldIds, ...policy.detailFieldIds]),
]

/**
 * Builds the label vocabulary shared by the detail rows.
 *
 * The editor's field policy owns translated field vocabulary, so a field with a
 * control wins; the site's presentation semantics label the rows that have no
 * control at all (a gateway-reported status, a read-only mirror). A detail field
 * with neither falls back to the label of the column that renders the same field,
 * and a field with no label anywhere is left unrendered rather than exposed as a
 * raw field id.
 */
export const createManagedResourceDetailLabels = (
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
  columns: readonly ManagedChannelsColumn[],
  t: TFunction,
): ReadonlyMap<string, string> => {
  const labels = new Map<string, string>()
  for (const column of columns) {
    if (!column.label) continue
    labels.set(
      column.accessor?.kind === MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Cell
        ? column.accessor.key
        : column.id,
      column.label,
    )
  }
  for (const mode of [
    MANAGED_RESOURCE_EDITOR_MODES.Edit,
    MANAGED_RESOURCE_EDITOR_MODES.Create,
  ]) {
    for (const field of getManagedResourceFieldPolicy(siteType, kind, mode)
      ?.fields ?? []) {
      labels.set(field.fieldId, field.resolveLabel(t))
    }
  }
  for (const [fieldId, resolveLabel] of Object.entries(
    getManagedResourcePresentationSemantics(siteType).detailFieldLabels ?? {},
  )) {
    labels.set(fieldId, resolveLabel(t))
  }
  return labels
}

/**
 * Whether the cell carries anything to show. An empty text or list says nothing
 * about the channel, while a false toggle, a zero rank and a masked key all do.
 */
const hasDetailValue = (cell: ManagedChannelsCell): boolean =>
  cell.kind === MANAGED_CHANNELS_CELL_KINDS.Groups
    ? cell.values.length > 0
    : cell.kind !== MANAGED_CHANNELS_CELL_KINDS.Text ||
      cell.value.trim().length > 0

/**
 * Renders the declared detail fields that the accepted row actually carries.
 *
 * A field the gateway leaves empty is dropped rather than rendered as a
 * placeholder, so the detail view lists what the channel has instead of padding
 * itself out with rows that only say "not available".
 */
export const buildManagedResourceDetailFields = (
  row: ManagedChannelsRowViewModel,
  fieldIds: readonly string[],
  labels: ReadonlyMap<string, string>,
): ManagedResourceDetailField[] =>
  fieldIds.flatMap((fieldId) => {
    const value = row.cells[fieldId]
    const label = labels.get(fieldId)
    return value && label && hasDetailValue(value) ? [{ label, value }] : []
  })
