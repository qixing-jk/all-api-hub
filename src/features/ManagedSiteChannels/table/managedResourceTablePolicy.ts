import type { TFunction } from "i18next"

import { type ManagedSiteType } from "~/constants/siteType"
import { SUB2API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/sub2api"
import {
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPolicy"
import type {
  ManagedChannelsColumn,
  ManagedChannelsSorting,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import {
  MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS,
  MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS,
  MANAGED_CHANNELS_COLUMN_FACET_KINDS,
  MANAGED_CHANNELS_COLUMN_IDS,
  MANAGED_CHANNELS_COLUMN_RENDERERS,
  MANAGED_CHANNELS_ROUTE_FILTER_KINDS,
  MANAGED_CHANNELS_ROUTE_QUERY_KEYS,
  MANAGED_CHANNELS_SORT_DIRECTIONS,
  MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import { managedSitePresentationDefinitions } from "~/features/ManagedSiteChannels/presentation/managedSitePresentationRegistry"
import {
  CANONICAL_NATIVE_CHANNEL_FIELD_IDS,
  defaultNativeTablePresentationPolicy,
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type NativeTablePresentationPolicy,
  type NumericChannelTableFieldIds,
} from "~/features/ManagedSiteChannels/table/managedResourceTablePresentation"
import { type ManagedResourceProductPolicy } from "~/services/accountSiteDefinitions/contracts"

const nativeTablePresentationPolicies: Partial<
  Record<ManagedSiteType, NativeTablePresentationPolicy>
> = Object.fromEntries(
  managedSitePresentationDefinitions.map((definition) => [
    definition.siteType,
    definition.table,
  ]),
)

const getNativeTablePresentationPolicy = (siteType: ManagedSiteType) =>
  nativeTablePresentationPolicies[siteType] ??
  defaultNativeTablePresentationPolicy

export const getManagedResourcePresentationSemantics = (
  siteType: ManagedSiteType,
) => getNativeTablePresentationPolicy(siteType).semantics

export const getDefaultManagedResourceSorting = (
  siteType: ManagedSiteType,
): ManagedChannelsSorting => [
  ...getNativeTablePresentationPolicy(siteType).defaultSorting,
]

const createValueColumn = (
  visibility: Readonly<Record<string, boolean>>,
  id: string,
  label: string,
  fieldId: string,
  options: Partial<ManagedChannelsColumn> = {},
): ManagedChannelsColumn => ({
  id,
  label,
  renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Value,
  accessor: { kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Cell, key: fieldId },
  canHide: true,
  defaultVisible: true,
  visible: visibility[id] !== false,
  sort: {
    accessor: {
      kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.CellSortValue,
      key: fieldId,
    },
    defaultDirection: MANAGED_CHANNELS_SORT_DIRECTIONS.Ascending,
    missing: MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS.Last,
  },
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Common },
  ...options,
})

const selectionColumn = {
  id: MANAGED_CHANNELS_COLUMN_IDS.Select,
  label: "",
  renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Select,
  canHide: false,
  defaultVisible: true,
  visible: true,
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Common },
} as const satisfies ManagedChannelsColumn

const createActionsColumn = (t: TFunction) =>
  ({
    id: MANAGED_CHANNELS_COLUMN_IDS.Actions,
    label: t("managedSiteChannels:table.columns.actions"),
    renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Actions,
    canHide: false,
    defaultVisible: true,
    visible: true,
    size: 60,
    extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Common },
  }) as const satisfies ManagedChannelsColumn

const createChannelColumn = (
  t: TFunction,
  id: string,
  size: number,
): ManagedChannelsColumn => ({
  id,
  label: t("managedSiteChannels:table.columns.name"),
  renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Channel,
  accessor: { kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Name },
  canHide: false,
  defaultVisible: true,
  visible: true,
  sort: {
    accessor: { kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.Name },
    defaultDirection: MANAGED_CHANNELS_SORT_DIRECTIONS.Ascending,
    missing: MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS.Last,
  },
  size,
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Common },
})

type ColumnBuilderOptions = {
  t: TFunction
  siteType: ManagedSiteType
  policy: ManagedResourceProductPolicy
  visibility: Readonly<Record<string, boolean>>
}

const createNumericChannelColumns = (
  { t, siteType, policy, visibility }: ColumnBuilderOptions,
  fields: NumericChannelTableFieldIds,
): ManagedChannelsColumn[] => {
  const fieldLabels: Readonly<Record<string, string>> = {
    [fields.Id]: t("managedSiteChannels:table.columns.id"),
    [fields.Type]: t("managedSiteChannels:table.columns.type"),
    [fields.ModelCount]: t("managedSiteChannels:table.columns.models"),
    [fields.Groups]: t("managedSiteChannels:table.columns.group"),
    [fields.Status]: t("managedSiteChannels:table.columns.status"),
    [fields.Priority]: t("managedSiteChannels:table.columns.priority"),
    [fields.Weight]: t("managedSiteChannels:table.columns.weight"),
  }
  return [
    selectionColumn,
    ...policy.tableFieldIds.flatMap((fieldId) => {
      if (fieldId === fields.Name) {
        return [createChannelColumn(t, MANAGED_CHANNELS_COLUMN_IDS.Name, 300)]
      }
      // The channel cell already shows the Base URL below the name.
      if (fieldId === fields.BaseUrl) return []
      return [
        createValueColumn(
          visibility,
          fieldId,
          fieldLabels[fieldId] ?? fieldId,
          fieldId === fields.Status
            ? MANAGED_CHANNELS_COLUMN_IDS.Status
            : fieldId,
          {
            ...(fieldId === fields.Status
              ? {
                  facet: {
                    kind: MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status,
                  },
                }
              : {}),
            ...(fieldId === fields.Id &&
            getNativeTablePresentationPolicy(siteType)
              .supportsNumericChannelDeepLink
              ? {
                  routeFilter: {
                    kind: MANAGED_CHANNELS_ROUTE_FILTER_KINDS.Exact,
                    queryKey: MANAGED_CHANNELS_ROUTE_QUERY_KEYS.ChannelId,
                  },
                }
              : {}),
            size: fieldId === fields.Id ? 45 : 90,
          },
        ),
      ]
    }),
    createActionsColumn(t),
  ]
}

const createSub2ApiColumns = ({
  t,
  siteType,
  policy,
  visibility,
}: ColumnBuilderOptions): ManagedChannelsColumn[] => {
  const fieldPolicy = getManagedResourceFieldPolicy(
    siteType,
    policy.primaryKind,
    MANAGED_RESOURCE_EDITOR_MODES.Edit,
  )
  const labels = new Map(
    fieldPolicy?.fields.map((field) => [field.fieldId, field.resolveLabel(t)]),
  )
  return [
    selectionColumn,
    createChannelColumn(t, SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name, 240),
    ...policy.tableFieldIds.flatMap((fieldId) => {
      if (fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name) return []
      const options =
        fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status
          ? { facet: { kind: MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status } }
          : fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl
            ? { size: 260 }
            : fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Platform
              ? { size: 110 }
              : { size: 120 }
      return [
        createValueColumn(
          visibility,
          fieldId,
          labels.get(fieldId) ?? fieldId,
          fieldId,
          options,
        ),
      ]
    }),
    createActionsColumn(t),
  ]
}

/**
 * Resolves the label of a native column that has no canonical equivalent.
 *
 * The editor's field policy is the only owner of translated field vocabulary,
 * so a table field without an entry there has no honest label at all; the
 * column is refused instead of rendering the raw field id as its header.
 */
const requireFieldLabel = (
  siteType: ManagedSiteType,
  policy: ManagedResourceProductPolicy,
  fieldId: string,
) => {
  for (const mode of [
    MANAGED_RESOURCE_EDITOR_MODES.Edit,
    MANAGED_RESOURCE_EDITOR_MODES.Create,
  ]) {
    const field = getManagedResourceFieldPolicy(
      siteType,
      policy.primaryKind,
      mode,
    )?.fields.find((candidate) => candidate.fieldId === fieldId)
    if (field) return field.resolveLabel
  }
  throw new Error("missing managed resource field label")
}

const createCanonicalColumns = ({
  t,
  siteType,
  policy,
  visibility,
}: ColumnBuilderOptions): ManagedChannelsColumn[] => {
  const hasField = (fieldId: string) => policy.tableFieldIds.includes(fieldId)
  const valueColumn = (
    id: string,
    label: string,
    fieldId: string,
    options?: Partial<ManagedChannelsColumn>,
  ) => createValueColumn(visibility, id, label, fieldId, options)
  return [
    selectionColumn,
    createChannelColumn(t, MANAGED_CHANNELS_COLUMN_IDS.Name, 300),
    ...(hasField(CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Type)
      ? [
          valueColumn(
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Type,
            t("managedSiteChannels:table.columns.type"),
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Type,
          ),
        ]
      : []),
    ...(hasField(CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Models)
      ? [
          valueColumn(
            MANAGED_CHANNELS_COLUMN_IDS.Models,
            t("channelDialog:fields.models.label"),
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Models,
          ),
        ]
      : []),
    ...(hasField(CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Status)
      ? [
          valueColumn(
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Status,
            t("managedSiteChannels:table.columns.status"),
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Status,
            { facet: { kind: MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status } },
          ),
        ]
      : []),
    ...(hasField(CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Tags)
      ? [
          valueColumn(
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Tags,
            t("managedSiteChannels:editor.fields.tags.label"),
            CANONICAL_NATIVE_CHANNEL_FIELD_IDS.Tags,
            {
              extension: {
                kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.Native,
                namespace: policy.primaryKind,
              },
            },
          ),
        ]
      : []),
    ...policy.tableFieldIds
      .filter(
        (fieldId) =>
          fieldId !== MANAGED_CHANNELS_COLUMN_IDS.Name &&
          !Object.values(CANONICAL_NATIVE_CHANNEL_FIELD_IDS).includes(
            fieldId as (typeof CANONICAL_NATIVE_CHANNEL_FIELD_IDS)[keyof typeof CANONICAL_NATIVE_CHANNEL_FIELD_IDS],
          ),
      )
      .map((fieldId) =>
        valueColumn(
          fieldId,
          requireFieldLabel(siteType, policy, fieldId)(t),
          fieldId,
        ),
      ),
    createActionsColumn(t),
  ]
}

/** Builds provider-owned native columns outside route orchestration. */
export const createManagedResourceColumns = (
  t: TFunction,
  siteType: ManagedSiteType,
  policy: ManagedResourceProductPolicy,
  visibility: Readonly<Record<string, boolean>>,
): ManagedChannelsColumn[] => {
  const options = { t, siteType, policy, visibility }
  const presentationPolicy = getNativeTablePresentationPolicy(siteType)
  switch (presentationPolicy.columnLayout) {
    case NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel:
      if (!presentationPolicy.numericChannelFieldIds) {
        throw new Error("missing numeric channel table field ids")
      }
      return createNumericChannelColumns(
        options,
        presentationPolicy.numericChannelFieldIds,
      )
    case NATIVE_TABLE_COLUMN_LAYOUTS.Sub2Api:
      return createSub2ApiColumns(options)
    default:
      // Providers using canonical fields share the neutral column layout.
      return createCanonicalColumns(options)
  }
}
