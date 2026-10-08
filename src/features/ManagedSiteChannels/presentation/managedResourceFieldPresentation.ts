import type { TFunction } from "i18next"

import { type ManagedSiteType } from "~/constants/siteType"
import {
  defineResourceEditorFieldPolicy,
  type ResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
  type ResourceFieldTextResolver,
} from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { type ManagedResourceKind } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_STATUSES,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/managedResourceNative"

export const MANAGED_RESOURCE_EDITOR_MODES = {
  Create: "create",
  Edit: "edit",
} as const

export type ManagedResourceEditorMode =
  (typeof MANAGED_RESOURCE_EDITOR_MODES)[keyof typeof MANAGED_RESOURCE_EDITOR_MODES]

export const MANAGED_RESOURCE_CHANNEL_FIELD_ROLES = {
  Name: "name",
  Type: "type",
  Status: "status",
  BaseUrl: "base-url",
  Secret: "secret",
  SuggestedText: "suggested-text",
  StringMapping: "string-mapping",
  Timestamp: "timestamp",
  ModelSummary: "model-summary",
  Models: "models",
} as const

export type ManagedResourceChannelFieldRole =
  (typeof MANAGED_RESOURCE_CHANNEL_FIELD_ROLES)[keyof typeof MANAGED_RESOURCE_CHANNEL_FIELD_ROLES]

export const MANAGED_RESOURCE_SECTIONS = {
  Basic: "basic",
  Connection: "connection",
  Models: "models",
  Sync: "sync",
  Routing: "routing",
  Metadata: "metadata",
  Advanced: "advanced",
  Compatibility: "compatibility",
  Requests: "requests",
} as const

export type ManagedResourceSection =
  (typeof MANAGED_RESOURCE_SECTIONS)[keyof typeof MANAGED_RESOURCE_SECTIONS]

export const MANAGED_RESOURCE_FIELD_RENDERERS = MANAGED_RESOURCE_FIELD_TYPES

export type ManagedResourceFieldPresentation =
  ResourceFieldPresentation<ManagedResourceSection> & {
    resolveCredentialListHelp?: ManagedResourceTextResolver
    /** Selects an existing channel control without coupling it to a provider field ID. */
    channelFieldRole?: ManagedResourceChannelFieldRole
    /** Identifies a native resource type without changing its editor control. */
    resourceType?: boolean
    advancedControl?: "string-map" | "json" | "model-input" | "model-list"
    suggestionSourceFieldId?: string
    mapKeysTargetFieldId?: string
    resolveReadOnlyHelp?: ManagedResourceTextResolver
    suggestionFieldId?: string
    disableWithFieldIds?: readonly string[]
    isConfigured?: (
      values: import("~/services/apiAdapters/contracts/resourceNative").EditableResourceProjection,
    ) => boolean
  }

export type ManagedResourceTextResolver = ResourceFieldTextResolver

export type ManagedResourceEditorFieldPolicy = Omit<
  ResourceEditorFieldPolicy<ManagedResourceSection>,
  "fields"
> & {
  fields: readonly ManagedResourceFieldPresentation[]
}

export type ManagedResourceFieldPolicyDefinition = {
  siteType: ManagedSiteType
  kind: ManagedResourceKind
  modes: Readonly<
    Record<ManagedResourceEditorMode, ManagedResourceEditorFieldPolicy>
  >
}

export const MANAGED_RESOURCE_SECTION_ORDER: Readonly<
  Record<ManagedResourceSection, number>
> = {
  basic: 0,
  connection: 1,
  models: 2,
  sync: 3,
  routing: 4,
  metadata: 5,
  advanced: 6,
  compatibility: 7,
  requests: 10,
}

/** Validates frontend field definitions for both editor modes. */
export function defineManagedResourceFieldPolicy<
  TDefinition extends ManagedResourceFieldPolicyDefinition,
>(definition: TDefinition): TDefinition {
  defineResourceEditorFieldPolicy(
    definition.modes[MANAGED_RESOURCE_EDITOR_MODES.Create],
  )
  defineResourceEditorFieldPolicy(
    definition.modes[MANAGED_RESOURCE_EDITOR_MODES.Edit],
  )
  return definition
}

export const resolveUnsupportedResourceType = (t: TFunction) =>
  t("managedSiteChannels:editor.options.channelType.unsupported")

export const resolveNativeTypeSlug = (t: TFunction, value?: string) =>
  value?.trim() || resolveUnsupportedResourceType(t)

export const managedResourceStatusFallbackLabelResolver = (t: TFunction) =>
  t("managedSiteChannels:editor.options.status.unknown")

const MANAGED_RESOURCE_UNKNOWN_OPTION_LABEL_RESOLVER = (t: TFunction) =>
  t("managedSiteChannels:editor.options.unknown")

export const createStatusOptionLabelResolvers = (codes: {
  readonly Unknown: number
  readonly Enable: number
  readonly ManuallyDisabled: number
  readonly AutoDisabled: number
}) =>
  ({
    [String(codes.Unknown)]: (t: TFunction) =>
      t("managedSiteChannels:statusLabels.unknown"),
    [String(codes.Enable)]: (t: TFunction) =>
      t("managedSiteChannels:statusLabels.enabled"),
    [String(codes.ManuallyDisabled)]: (t: TFunction) =>
      t("managedSiteChannels:statusLabels.manualPause"),
    [String(codes.AutoDisabled)]: (t: TFunction) =>
      t("managedSiteChannels:statusLabels.autoDisabled"),
  }) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

export type NewApiFamilyFieldIds = {
  Name: string
  Type: string
  Status: string
  BaseUrl: string
  Key: string
  Models: string
  Groups: string
  Priority: string
  Weight: string
}

export const createNewApiFamilyFields = (
  fieldIds: NewApiFamilyFieldIds,
  typeOptionLabelResolvers: Readonly<
    Record<string, ManagedResourceTextResolver>
  >,
  statusOptionLabelResolvers: Readonly<
    Record<string, ManagedResourceTextResolver>
  >,
) =>
  [
    {
      fieldId: fieldIds.Name,
      section: MANAGED_RESOURCE_SECTIONS.Basic,
      order: 10,
      resolveLabel: (t) => t("channelDialog:fields.name.label"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
    },
    {
      fieldId: fieldIds.Type,
      section: MANAGED_RESOURCE_SECTIONS.Basic,
      order: 20,
      resolveLabel: (t) => t("channelDialog:fields.type.label"),
      optionLabelResolvers: typeOptionLabelResolvers,
      resolveOptionFallback: resolveUnsupportedResourceType,
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
    },
    {
      fieldId: fieldIds.Status,
      section: MANAGED_RESOURCE_SECTIONS.Basic,
      order: 30,
      resolveLabel: (t) => t("channelDialog:fields.status.label"),
      optionLabelResolvers: statusOptionLabelResolvers,
      resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
    },
    {
      fieldId: fieldIds.BaseUrl,
      section: MANAGED_RESOURCE_SECTIONS.Connection,
      order: 10,
      resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
    },
    {
      fieldId: fieldIds.Key,
      section: MANAGED_RESOURCE_SECTIONS.Connection,
      order: 20,
      resolveLabel: (t) => t("channelDialog:fields.key.label"),
      resolveHelp: (t) =>
        t("managedSiteChannels:editor.secret.keepExistingHint"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
    },
    {
      fieldId: fieldIds.Models,
      section: MANAGED_RESOURCE_SECTIONS.Models,
      order: 10,
      resolveLabel: (t) => t("channelDialog:fields.models.label"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
      channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
    },
    {
      fieldId: fieldIds.Groups,
      section: MANAGED_RESOURCE_SECTIONS.Models,
      order: 20,
      resolveLabel: (t) => t("channelDialog:fields.groups.label"),
      resolveHelp: (t) => t("channelDialog:fields.groups.hint"),
      resolvePlaceholder: (t) => t("channelDialog:fields.groups.placeholder"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    },
    {
      fieldId: fieldIds.Priority,
      section: MANAGED_RESOURCE_SECTIONS.Routing,
      order: 10,
      resolveLabel: (t) => t("channelDialog:fields.priority.label"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
    },
    {
      fieldId: fieldIds.Weight,
      section: MANAGED_RESOURCE_SECTIONS.Routing,
      order: 20,
      resolveLabel: (t) => t("channelDialog:fields.weight.label"),
      renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
    },
  ] satisfies readonly ManagedResourceFieldPresentation[]

export const nativeChannelStatusOptionLabelResolvers = {
  [MANAGED_RESOURCE_STATUSES.Enabled]: (t: TFunction) =>
    t("common:status.enabled"),
  [MANAGED_RESOURCE_STATUSES.Disabled]: (t: TFunction) =>
    t("common:status.disabled"),
} as const satisfies Readonly<Record<string, ManagedResourceTextResolver>>

export const createNativeChannelFields = (
  fields: {
    readonly Name: string
    readonly Type: string
    readonly Status: string
    readonly BaseUrl: string
    readonly Key: string
    readonly Models: string
  },
  typeOptionLabelResolvers: Readonly<
    Record<string, ManagedResourceTextResolver>
  >,
): readonly ManagedResourceFieldPresentation[] => [
  {
    fieldId: fields.Name,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Name,
  },
  {
    fieldId: fields.Type,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.type.label"),
    optionLabelResolvers: typeOptionLabelResolvers,
    resolveOptionFallback: resolveUnsupportedResourceType,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Type,
  },
  {
    fieldId: fields.Status,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    optionLabelResolvers: nativeChannelStatusOptionLabelResolvers,
    resolveOptionFallback: managedResourceStatusFallbackLabelResolver,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Status,
  },
  {
    fieldId: fields.BaseUrl,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.BaseUrl,
  },
  {
    fieldId: fields.Key,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.secret.keepExistingHint"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Secret,
  },
  {
    fieldId: fields.Models,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
    channelFieldRole: MANAGED_RESOURCE_CHANNEL_FIELD_ROLES.Models,
  },
]

const registryKey = (siteType: ManagedSiteType, kind: ManagedResourceKind) =>
  `${siteType}:${kind}`

/** Builds an isolated registry and rejects duplicate site and resource definitions. */
export function createManagedResourceFieldPolicyRegistry(
  definitions: readonly ManagedResourceFieldPolicyDefinition[],
) {
  const definitionsByKey = new Map<
    string,
    ManagedResourceFieldPolicyDefinition
  >()
  for (const definition of definitions) {
    const key = registryKey(definition.siteType, definition.kind)
    if (definitionsByKey.has(key)) {
      throw new Error("duplicate managed resource field policy")
    }
    definitionsByKey.set(key, definition)
  }
  return {
    getDefinition(siteType: ManagedSiteType, kind: ManagedResourceKind) {
      return definitionsByKey.get(registryKey(siteType, kind))
    },
    get(
      siteType: ManagedSiteType,
      kind: ManagedResourceKind,
      mode: ManagedResourceEditorMode,
    ) {
      return definitionsByKey.get(registryKey(siteType, kind))?.modes[mode]
    },
  }
}

export const getManagedResourceFieldOptionLabel = (
  presentation: ManagedResourceFieldPresentation,
  value: string,
  t: TFunction,
) => {
  const resolver =
    presentation.optionLabelResolvers &&
    Object.prototype.hasOwnProperty.call(
      presentation.optionLabelResolvers,
      value,
    )
      ? presentation.optionLabelResolvers[value]
      : presentation.resolveOptionFallback
  return resolver
    ? resolver(t, value)
    : MANAGED_RESOURCE_UNKNOWN_OPTION_LABEL_RESOLVER(t)
}

/** Adapts scalar and collection credential controls to native capability descriptors. */
export function adaptManagedCredentialPolicy(
  descriptors: readonly ResourceFieldDescriptor[],
  policy: ManagedResourceEditorFieldPolicy,
): ManagedResourceEditorFieldPolicy {
  return {
    ...policy,
    fields: policy.fields
      .filter(
        (field) =>
          field.fieldId !== "multiKeyMode" ||
          descriptors.some(
            (descriptor) => descriptor.fieldId === field.fieldId,
          ),
      )
      .map((field) =>
        descriptors.some(
          (descriptor) =>
            descriptor.fieldId === field.fieldId &&
            descriptor.type === "secret-list",
        ) && field.channelFieldRole === "secret"
          ? {
              ...field,
              renderer: "secret-list",
              resolveHelp: descriptors.some(
                (descriptor) =>
                  descriptor.fieldId === field.fieldId &&
                  descriptor.type === "secret-list" &&
                  descriptor.savedEntries.length > 0,
              )
                ? field.resolveCredentialListHelp ?? field.resolveHelp
                : field.resolveHelp,
              resolveNullableOptionLabel: undefined,
              compactSecretRows: true,
              resolveEntrySummary: (t, fields) =>
                !descriptors.some(
                  (descriptor) =>
                    descriptor.fieldId === field.fieldId &&
                    descriptor.type === "secret-list" &&
                    descriptor.entryFields.some(
                      (attribute) => attribute.fieldId === "enabled",
                    ),
                )
                  ? ""
                  : fields.enabled === "false"
                    ? t("common:status.disabled")
                    : t("common:status.enabled"),
              resolveEntryDescription: (t, fields) =>
                fields.enabled === "false" && fields.reason
                  ? t("ui:secretList.previousDisableReason", {
                      reason: fields.reason,
                    })
                  : "",
              entryFields: [
                {
                  fieldId: "enabled",
                  resolveLabel: (t) => t("ui:secretList.enableKey"),
                },
                {
                  fieldId: "remark",
                  resolveLabel: (t) =>
                    t("managedSiteChannels:editor.fields.remark.label"),
                },
                {
                  fieldId: "name",
                  resolveLabel: (t) => t("channelDialog:fields.name.label"),
                },
              ],
            }
          : field,
      ),
  }
}

/** Uses one field definition's vocabulary in editor, table, and detail presentation. */
export function getFieldValuePresentationFromDefinition(
  definition: ManagedResourceFieldPolicyDefinition | undefined,
  fieldId: string,
) {
  const field =
    definition?.modes.edit.fields.find((field) => field.fieldId === fieldId) ??
    definition?.modes.create.fields.find((field) => field.fieldId === fieldId)
  if (!field?.optionLabelResolvers && !field?.resolveOptionFallback)
    return undefined
  return {
    optionLabelResolvers: field.optionLabelResolvers ?? {},
    ...(field.resolveOptionFallback
      ? { resolveOptionFallback: field.resolveOptionFallback }
      : {}),
  }
}
/** Requires a configured field vocabulary for table presentation. */
export function requireFieldValuePresentation(
  definition: ManagedResourceFieldPolicyDefinition,
  fieldId: string,
) {
  const presentation = getFieldValuePresentationFromDefinition(
    definition,
    fieldId,
  )
  if (!presentation)
    throw new Error("missing managed resource field vocabulary")
  return presentation
}
