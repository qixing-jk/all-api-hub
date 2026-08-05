import type { TFunction } from "i18next"

import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  isAxonHubModelAutoSyncSupported,
} from "~/constants/axonHub"
import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import {
  defineResourceEditorFieldPolicy,
  resolveResourceFieldPolicy,
  type ResourceEditorFieldPolicy,
  type ResourceFieldPresentation,
  type ResourceFieldTextResolver,
} from "~/features/ResourceEditor/resourceFieldPolicy"
import {
  MANAGED_RESOURCE_KINDS,
  type ManagedResourceKind,
} from "~/services/accountSiteDefinitions/contracts"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/managedResourceNative"

export const MANAGED_RESOURCE_EDITOR_MODES = {
  Create: "create",
  Edit: "edit",
} as const

export type ManagedResourceEditorMode =
  (typeof MANAGED_RESOURCE_EDITOR_MODES)[keyof typeof MANAGED_RESOURCE_EDITOR_MODES]

export const MANAGED_RESOURCE_COMMON_CHANNEL_FIELD_IDS = {
  Name: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
  Type: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
  Status: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
  BaseUrl: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
  Secret: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
  Models: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
} as const

export const MANAGED_RESOURCE_SECTIONS = {
  Basic: "basic",
  Connection: "connection",
  Models: "models",
  Sync: "sync",
  Routing: "routing",
  Metadata: "metadata",
  Advanced: "advanced",
} as const

export type ManagedResourceSection =
  (typeof MANAGED_RESOURCE_SECTIONS)[keyof typeof MANAGED_RESOURCE_SECTIONS]

const MANAGED_RESOURCE_FIELD_RENDERERS = {
  Text: "text",
  Textarea: "textarea",
  Number: "number",
  Boolean: "boolean",
  Select: "select",
  MultiSelect: "multi-select",
  Secret: "secret",
  DateTime: "date-time",
} as const

export type ManagedResourceFieldPresentation =
  ResourceFieldPresentation<ManagedResourceSection>
export type ManagedResourceTextResolver = ResourceFieldTextResolver
export type ManagedResourceEditorFieldPolicy =
  ResourceEditorFieldPolicy<ManagedResourceSection>

type ManagedResourceFieldPolicyDefinition = {
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
}

/** Defines static frontend-owned presentation without accepting Adapter layout metadata. */
export function defineManagedResourceFieldPolicy<
  TDefinition extends ManagedResourceFieldPolicyDefinition,
>(definition: TDefinition): TDefinition {
  defineResourceEditorFieldPolicy(definition.modes.create)
  defineResourceEditorFieldPolicy(definition.modes.edit)
  return definition
}

export const MANAGED_RESOURCE_CHANNEL_TYPE_LABEL_RESOLVERS = {
  [AXON_HUB_CHANNEL_TYPE.OPENAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openai"),
  [AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openaiResponses"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropic"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_AWS]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropicAws"),
  [AXON_HUB_CHANNEL_TYPE.ANTHROPIC_GCP]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.anthropicGcp"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI_OPENAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.geminiOpenai"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.gemini"),
  [AXON_HUB_CHANNEL_TYPE.GEMINI_VERTEX]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.geminiVertex"),
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.deepseek"),
  [AXON_HUB_CHANNEL_TYPE.DEEPSEEK_ANTHROPIC]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.deepseekAnthropic"),
  [AXON_HUB_CHANNEL_TYPE.OPENROUTER]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.openrouter"),
  [AXON_HUB_CHANNEL_TYPE.XAI]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.xai"),
  [AXON_HUB_CHANNEL_TYPE.SILICONFLOW]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.siliconflow"),
  [AXON_HUB_CHANNEL_TYPE.VOLCENGINE]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.volcengine"),
  [AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.githubCopilot"),
  [AXON_HUB_CHANNEL_TYPE.CLAUDECODE]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.claudeCode"),
  [AXON_HUB_CHANNEL_TYPE.NANOGPT]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.nanogpt"),
  [AXON_HUB_CHANNEL_TYPE.OLLAMA]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.channelType.ollama"),
} as const

export const MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS = {
  [AXON_HUB_CHANNEL_STATUS.ENABLED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.enabled"),
  [AXON_HUB_CHANNEL_STATUS.DISABLED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.disabled"),
  [AXON_HUB_CHANNEL_STATUS.ARCHIVED]: (t: TFunction) =>
    t("managedSiteChannels:editor.options.status.archived"),
} as const

export const MANAGED_RESOURCE_CHANNEL_TYPE_FALLBACK_LABEL_RESOLVER = (
  t: TFunction,
) => t("managedSiteChannels:editor.options.channelType.unsupported")

export const MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER = (t: TFunction) =>
  t("managedSiteChannels:editor.options.status.unknown")

const MANAGED_RESOURCE_UNKNOWN_OPTION_LABEL_RESOLVER = (t: TFunction) =>
  t("managedSiteChannels:editor.options.unknown")

const axonHubFields = [
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.name.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.type.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    optionLabelResolvers: MANAGED_RESOURCE_CHANNEL_TYPE_LABEL_RESOLVERS,
    resolveOptionFallback:
      MANAGED_RESOURCE_CHANNEL_TYPE_FALLBACK_LABEL_RESOLVER,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
    section: MANAGED_RESOURCE_SECTIONS.Basic,
    order: 30,
    resolveLabel: (t) => t("channelDialog:fields.status.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
    optionLabelResolvers: MANAGED_RESOURCE_STATUS_LABEL_RESOLVERS,
    resolveOptionFallback: MANAGED_RESOURCE_STATUS_FALLBACK_LABEL_RESOLVER,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.baseUrl.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    section: MANAGED_RESOURCE_SECTIONS.Connection,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.key.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Secret,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.models.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.supportedModels.help"),
    customValuesMirrorFieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 30,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.defaultTestModel.placeholder"),
    optionSourceFieldIds: [AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS],
    autoSelectFirstOption: true,
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Select,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    section: MANAGED_RESOURCE_SECTIONS.Sync,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncSupportedModels.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncSupportedModels.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Boolean,
    visibleWhen: (values) =>
      isAxonHubModelAutoSyncSupported(values[AXON_HUB_CHANNEL_FIELD_IDS.TYPE]),
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    section: MANAGED_RESOURCE_SECTIONS.Sync,
    order: 20,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.autoSyncModelPattern.placeholder"),
    issueLabelResolvers: {
      invalid_value: (t) =>
        t("managedSiteChannels:editor.fields.autoSyncModelPattern.invalid"),
    },
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
    visibleWhen: (values) =>
      isAxonHubModelAutoSyncSupported(
        values[AXON_HUB_CHANNEL_FIELD_IDS.TYPE],
      ) &&
      values[AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS] === true,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.orderingWeight.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.orderingWeight.help"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    section: MANAGED_RESOURCE_SECTIONS.Metadata,
    order: 10,
    resolveLabel: (t) => t("managedSiteChannels:editor.fields.tags.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.tags.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.tags.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.MultiSelect,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK,
    section: MANAGED_RESOURCE_SECTIONS.Metadata,
    order: 20,
    resolveLabel: (t) => t("managedSiteChannels:editor.fields.remark.label"),
    resolveHelp: (t) => t("managedSiteChannels:editor.fields.remark.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.remark.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Textarea,
    rows: 3,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
    section: MANAGED_RESOURCE_SECTIONS.Advanced,
    order: 10,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.label"),
    resolveHelp: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.help"),
    resolvePlaceholder: (t) =>
      t("managedSiteChannels:editor.fields.extraModelPrefix.placeholder"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const axonHubManagedResourceFieldPolicy = defineManagedResourceFieldPolicy({
  siteType: SITE_TYPES.AXON_HUB,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  modes: {
    create: {
      fields: axonHubFields,
      hiddenFields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
          reason: "read-only",
        },
      ],
    },
    edit: {
      fields: axonHubFields,
      hiddenFields: [
        {
          fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
          reason: "read-only",
        },
      ],
    },
  },
})

const registryKey = (siteType: ManagedSiteType, kind: ManagedResourceKind) =>
  `${siteType}:${kind}`

/** Creates an isolated static policy registry for production or test registrations. */
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
    get(
      siteType: ManagedSiteType,
      kind: ManagedResourceKind,
      mode: ManagedResourceEditorMode,
    ) {
      return definitionsByKey.get(registryKey(siteType, kind))?.modes[mode]
    },
  }
}

const managedResourceFieldPolicyRegistry =
  createManagedResourceFieldPolicyRegistry([axonHubManagedResourceFieldPolicy])

export const getManagedResourceFieldPolicy = (
  siteType: ManagedSiteType,
  kind: ManagedResourceKind,
  mode: ManagedResourceEditorMode,
) => managedResourceFieldPolicyRegistry.get(siteType, kind, mode)

/** Correlates fact-only descriptors with frontend-owned presentation metadata. */
export function resolveManagedResourceFieldPolicy(
  descriptors: readonly ResourceFieldDescriptor[],
  policy: ManagedResourceEditorFieldPolicy,
) {
  try {
    return resolveResourceFieldPolicy(
      descriptors,
      policy,
      MANAGED_RESOURCE_SECTION_ORDER,
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "resource field policy mismatch"
    ) {
      throw new Error("managed resource field policy mismatch")
    }
    throw error
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
    ? resolver(t)
    : MANAGED_RESOURCE_UNKNOWN_OPTION_LABEL_RESOLVER(t)
}
