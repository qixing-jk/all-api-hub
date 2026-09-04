import type { TFunction } from "i18next"

import { AXON_HUB_CHANNEL_FIELD_IDS } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/claudeCodeHub"
import { NEW_API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/newApi"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { SUB2API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/sub2api"
import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceProductPolicy,
} from "~/services/accountSiteDefinitions/contracts"

import type { ManagedChannelsColumn, ManagedChannelsSorting } from "./contracts"
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
} from "./contracts"
import {
  getManagedResourceFieldPolicy,
  getManagedResourceFieldValuePresentation,
  MANAGED_RESOURCE_EDITOR_MODES,
} from "./managedResourceFieldPolicy"
import {
  DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
  type ManagedResourcePresentationSemantics,
} from "./managedResourcePresentation"

type NativeTablePresentationPolicy = {
  semantics: ManagedResourcePresentationSemantics
  defaultSorting: ManagedChannelsSorting
  columnLayout: NativeTableColumnLayout
}

const NATIVE_TABLE_COLUMN_LAYOUTS = {
  Canonical: "canonical",
  NewApi: "new-api",
  Sub2Api: "sub2api",
} as const

type NativeTableColumnLayout =
  (typeof NATIVE_TABLE_COLUMN_LAYOUTS)[keyof typeof NATIVE_TABLE_COLUMN_LAYOUTS]

const CANONICAL_NATIVE_CHANNEL_FIELD_IDS = {
  Type: "type",
  Status: "status",
  BaseUrl: "baseURL",
  Models: "supportedModels",
  Tags: "tags",
} as const

const defaultNativeTablePresentationPolicy: NativeTablePresentationPolicy = {
  semantics: DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
  defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Identifier, desc: true }],
  columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
}

const requireFieldValuePresentation = (
  siteType: ManagedSiteType,
  fieldId: string,
) => {
  const presentation = getManagedResourceFieldValuePresentation(
    siteType,
    MANAGED_RESOURCE_KINDS.Channel,
    fieldId,
  )
  if (!presentation)
    throw new Error("missing managed resource field vocabulary")
  return presentation
}

const nativeTablePresentationPolicies: Partial<
  Record<ManagedSiteType, NativeTablePresentationPolicy>
> = {
  [SITE_TYPES.AXON_HUB]: {
    semantics: {
      baseUrlFieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
      statusFieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
      fieldValuePresentations: {
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: requireFieldValuePresentation(
          SITE_TYPES.AXON_HUB,
          AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
        ),
      },
    },
    defaultSorting: [
      { id: MANAGED_CHANNELS_COLUMN_IDS.Identifier, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
  [SITE_TYPES.NEW_API]: {
    semantics: {
      baseUrlFieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            SITE_TYPES.NEW_API,
            NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
    },
    defaultSorting: [{ id: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NewApi,
  },
  [SITE_TYPES.SUB2API]: {
    semantics: {
      baseUrlFieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Status,
    },
    defaultSorting: [
      { id: SUB2API_MANAGED_RESOURCE_FIELD_IDS.Name, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Sub2Api,
  },
  [SITE_TYPES.CLAUDE_CODE_HUB]: {
    semantics: {
      baseUrlFieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            SITE_TYPES.CLAUDE_CODE_HUB,
            CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
    },
    defaultSorting: [
      { id: MANAGED_CHANNELS_COLUMN_IDS.Identifier, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
}

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
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon },
  ...options,
})

const selectionColumn = {
  id: MANAGED_CHANNELS_COLUMN_IDS.Select,
  label: "",
  renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Select,
  canHide: false,
  defaultVisible: true,
  visible: true,
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon },
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
    extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon },
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
  extension: { kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon },
})

type ColumnBuilderOptions = {
  t: TFunction
  siteType: ManagedSiteType
  policy: ManagedResourceProductPolicy
  visibility: Readonly<Record<string, boolean>>
}

const createNewApiColumns = ({
  t,
  policy,
  visibility,
}: ColumnBuilderOptions): ManagedChannelsColumn[] => {
  const fieldLabels: Readonly<Record<string, string>> = {
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id]: t(
      "managedSiteChannels:table.columns.id",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Type]: t(
      "managedSiteChannels:table.columns.type",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.ModelCount]: t(
      "managedSiteChannels:table.columns.models",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Groups]: t(
      "managedSiteChannels:table.columns.group",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status]: t(
      "managedSiteChannels:table.columns.status",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Priority]: t(
      "managedSiteChannels:table.columns.priority",
    ),
    [NEW_API_MANAGED_RESOURCE_FIELD_IDS.Weight]: t(
      "managedSiteChannels:table.columns.weight",
    ),
  }
  return [
    selectionColumn,
    ...policy.tableFieldIds.flatMap((fieldId) => {
      if (fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name) {
        return [createChannelColumn(t, MANAGED_CHANNELS_COLUMN_IDS.Name, 300)]
      }
      // The channel cell already shows the Base URL below the name.
      if (fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.BaseUrl) return []
      return [
        createValueColumn(
          visibility,
          fieldId,
          fieldLabels[fieldId] ?? fieldId,
          fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status
            ? MANAGED_CHANNELS_COLUMN_IDS.Status
            : fieldId,
          {
            ...(fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status
              ? {
                  facet: {
                    kind: MANAGED_CHANNELS_COLUMN_FACET_KINDS.Status,
                  },
                }
              : {}),
            ...(fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id
              ? {
                  routeFilter: {
                    kind: MANAGED_CHANNELS_ROUTE_FILTER_KINDS.Exact,
                    queryKey: MANAGED_CHANNELS_ROUTE_QUERY_KEYS.ChannelId,
                  },
                }
              : {}),
            size: fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id ? 45 : 90,
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

const createCanonicalColumns = ({
  t,
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
    {
      id: MANAGED_CHANNELS_COLUMN_IDS.Identifier,
      label: t("managedSiteChannels:table.columns.id"),
      renderer: MANAGED_CHANNELS_COLUMN_RENDERERS.Identifier,
      accessor: {
        kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifier,
      },
      canHide: true,
      defaultVisible: true,
      visible: visibility[MANAGED_CHANNELS_COLUMN_IDS.Identifier] !== false,
      sort: {
        accessor: {
          kind: MANAGED_CHANNELS_COLUMN_ACCESSOR_KINDS.DisplayIdentifierSort,
        },
        defaultDirection: MANAGED_CHANNELS_SORT_DIRECTIONS.Descending,
        missing: MANAGED_CHANNELS_SORT_MISSING_PLACEMENTS.Last,
      },
      size: 40,
      extension: {
        kind: MANAGED_CHANNELS_COLUMN_EXTENSION_KINDS.LegacyCommon,
      },
    },
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
            t("managedSiteChannels:table.columns.models"),
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
      .map((fieldId) => valueColumn(fieldId, fieldId, fieldId)),
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
  switch (getNativeTablePresentationPolicy(siteType).columnLayout) {
    case NATIVE_TABLE_COLUMN_LAYOUTS.NewApi:
      return createNewApiColumns(options)
    case NATIVE_TABLE_COLUMN_LAYOUTS.Sub2Api:
      return createSub2ApiColumns(options)
    default:
      // Canonical compatibility registrations get neutral columns only.
      return createCanonicalColumns(options)
  }
}
