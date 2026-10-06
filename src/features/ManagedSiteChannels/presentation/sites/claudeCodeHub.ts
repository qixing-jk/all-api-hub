import {
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  ClaudeCodeHubProviderTypeNames,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"

import { MANAGED_CHANNELS_COLUMN_IDS } from "../contracts"
import {
  createNativeChannelFields,
  defineManagedResourceFieldPolicy,
  MANAGED_RESOURCE_EDITOR_MODES,
  MANAGED_RESOURCE_FIELD_RENDERERS,
  MANAGED_RESOURCE_SECTIONS,
  requireFieldValuePresentation,
  type ManagedResourceFieldPresentation,
  type ManagedResourceTextResolver,
} from "../managedResourceFieldPresentation"
import {
  NATIVE_TABLE_COLUMN_LAYOUTS,
  type ManagedSitePresentationDefinition,
} from "../managedResourceTablePresentation"

const claudeCodeHubTypeOptionLabelResolvers = Object.fromEntries(
  Object.entries(ClaudeCodeHubProviderTypeNames).map(([value, label]) => [
    value,
    () => label,
  ]),
) satisfies Readonly<Record<string, ManagedResourceTextResolver>>

const claudeCodeHubFields = [
  ...createNativeChannelFields(
    CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS,
    claudeCodeHubTypeOptionLabelResolvers,
  ),
  {
    fieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.GroupTag,
    section: MANAGED_RESOURCE_SECTIONS.Models,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.groups.label"),
    resolveHelp: (t) => t("channelDialog:fields.groups.hint"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Text,
  },
  {
    fieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Priority,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 10,
    resolveLabel: (t) => t("channelDialog:fields.priority.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
  {
    fieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Weight,
    section: MANAGED_RESOURCE_SECTIONS.Routing,
    order: 20,
    resolveLabel: (t) => t("channelDialog:fields.weight.label"),
    renderer: MANAGED_RESOURCE_FIELD_RENDERERS.Number,
  },
] as const satisfies readonly ManagedResourceFieldPresentation[]

const claudeCodeHubManagedResourceFieldPolicy =
  defineManagedResourceFieldPolicy({
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    modes: {
      [MANAGED_RESOURCE_EDITOR_MODES.Create]: {
        fields: claudeCodeHubFields,
        hiddenFields: [],
      },
      [MANAGED_RESOURCE_EDITOR_MODES.Edit]: {
        fields: claudeCodeHubFields,
        hiddenFields: [],
      },
    },
  })

export const claudeCodeHubPresentation = {
  siteType: claudeCodeHubManagedResourceFieldPolicy.siteType,
  fieldPolicies: [claudeCodeHubManagedResourceFieldPolicy],
  table: {
    semantics: {
      baseUrlFieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.BaseUrl,
      statusFieldId: CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
      fieldValuePresentations: {
        [CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type]:
          requireFieldValuePresentation(
            claudeCodeHubManagedResourceFieldPolicy,
            CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
          ),
      },
    },
    defaultSorting: [{ id: MANAGED_CHANNELS_COLUMN_IDS.Name, desc: false }],
    columnLayout: NATIVE_TABLE_COLUMN_LAYOUTS.Canonical,
  },
} satisfies ManagedSitePresentationDefinition
