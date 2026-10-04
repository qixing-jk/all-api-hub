import type { TFunction } from "i18next"

import { AXON_HUB_CHANNEL_FIELD_IDS } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/claudeCodeHub"
import { DONE_HUB_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/doneHub"
import { GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/gptLoad"
import { NEW_API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/newApi"
import { OCTOPUS_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/octopus"
import {
  OMNIROUTE_CONNECTION_TEST_STATUSES,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/omniroute"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { SUB2API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/sub2api"
import { VELOERA_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/veloera"
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
  numericChannelFieldIds?: NumericChannelTableFieldIds
  supportsNumericChannelDeepLink?: boolean
}

const NATIVE_TABLE_COLUMN_LAYOUTS = {
  Canonical: "canonical",
  NumericChannel: "numeric-channel",
  Sub2Api: "sub2api",
} as const

type NativeTableColumnLayout =
  (typeof NATIVE_TABLE_COLUMN_LAYOUTS)[keyof typeof NATIVE_TABLE_COLUMN_LAYOUTS]

type NumericChannelTableFieldIds = {
  readonly Id: string
  readonly Name: string
  readonly Type: string
  readonly Status: string
  readonly BaseUrl: string
  readonly ModelCount: string
  readonly Groups: string
  readonly Priority: string
  readonly Weight: string
}

const CANONICAL_NATIVE_CHANNEL_FIELD_IDS = {
  Type: "type",
  Status: "status",
  BaseUrl: "baseURL",
  Models: "supportedModels",
  Tags: "tags",
} as const

const defaultNativeTablePresentationPolicy: NativeTablePresentationPolicy = {
  semantics: DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
  defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
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
  [SITE_TYPES.CLI_PROXY_API]: {
    semantics: {
      ...DEFAULT_MANAGED_RESOURCE_PRESENTATION_SEMANTICS,
      fieldValuePresentations: {
        type: requireFieldValuePresentation(SITE_TYPES.CLI_PROXY_API, "type"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
  [SITE_TYPES.OCTOPUS]: {
    semantics: {
      baseUrlFieldId: OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            SITE_TYPES.OCTOPUS,
            OCTOPUS_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
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
      detailFieldLabels: {
        // The manual model list is a read-only mirror of the model selector, so
        // the editor offers no control and this is its only label source.
        [AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS]: (t) =>
          t("managedSiteChannels:editor.fields.manualModels.label"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
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
      detailFieldLabels: {
        // The gateway records this reason itself when it disables a channel, and
        // its own list shows the same string in the status tooltip.
        [NEW_API_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [{ id: NEW_API_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: NEW_API_MANAGED_RESOURCE_FIELD_IDS,
    supportsNumericChannelDeepLink: true,
  },
  [SITE_TYPES.VELOERA]: {
    semantics: {
      baseUrlFieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            SITE_TYPES.VELOERA,
            VELOERA_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
      detailFieldLabels: {
        [VELOERA_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [{ id: VELOERA_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: VELOERA_MANAGED_RESOURCE_FIELD_IDS,
  },
  [SITE_TYPES.DONE_HUB]: {
    semantics: {
      baseUrlFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            SITE_TYPES.DONE_HUB,
            DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
      detailFieldLabels: {
        [DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.StatusReason]: (t) =>
          t("managedSiteChannels:editor.fields.channelStatusReason.label"),
      },
    },
    defaultSorting: [
      { id: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS.Id, desc: true },
    ],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.NumericChannel,
    numericChannelFieldIds: DONE_HUB_MANAGED_RESOURCE_FIELD_IDS,
    supportsNumericChannelDeepLink: true,
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
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
  [SITE_TYPES.OMNIROUTE]: {
    semantics: {
      baseUrlFieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.Status,
      // Provider values are gateway slugs, so the raw id is the label. No
      // translated vocabulary is invented for them.
      fieldValuePresentations: {
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus]: {
          optionLabelResolvers: {
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Active]: (t) =>
              t("managedSiteChannels:editor.options.omnirouteTestStatus.ok"),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Error]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.failed",
              ),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Unavailable]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.unsupported",
              ),
            [OMNIROUTE_CONNECTION_TEST_STATUSES.Unknown]: (t) =>
              t(
                "managedSiteChannels:editor.options.omnirouteTestStatus.pending",
              ),
          },
          // A state the gateway adds later stays visible as it reported itself.
        },
      },
      detailFieldLabels: {
        // The gateway's connection test has no editor control, so its labels are
        // declared here rather than on a field the editor would render.
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus]: (t) =>
          t("managedSiteChannels:editor.fields.omnirouteTestStatus.label"),
        [OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.LastError]: (t) =>
          t("managedSiteChannels:editor.fields.omnirouteLastError.label"),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
  [SITE_TYPES.GPT_LOAD]: {
    semantics: {
      baseUrlFieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: GPT_LOAD_MANAGED_RESOURCE_FIELD_IDS.Status,
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
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
