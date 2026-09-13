import type { TFunction } from "i18next"

import {
  NEW_API_MANAGED_RESOURCE_FIELD_IDS as F,
  supportsNewApiUpstreamModelCheck,
} from "~/constants/newApi"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"

import type {
  ManagedResourceEditorFieldPolicy,
  ManagedResourceFieldPresentation,
} from "./managedResourceFieldPolicy"

/** New API field layout; generic controls remain independent of provider IDs. */
export const newApiAdvancedFields: readonly ManagedResourceFieldPresentation[] =
  [
    {
      resolveReadOnlyHelp: (t) =>
        t("managedSiteChannels:editor.advanced.invalidExisting"),
      fieldId: F.UpstreamCheck,
      renderer: "boolean",
      section: "sync",
      order: 10,
      resolveLabel: (t) => t("managedSiteChannels:editor.advanced.check.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.check.help"),
      disabledWhen: (v) =>
        !supportsNewApiUpstreamModelCheck(v[F.Type]) &&
        v[F.UpstreamCheck] !== true,
      resolveDisabledHelp: (t) =>
        t("managedSiteChannels:editor.advanced.unsupportedDetection"),
      disableWithFieldIds: [F.UpstreamAutoSync],
    },
    {
      resolveReadOnlyHelp: (t) =>
        t("managedSiteChannels:editor.advanced.invalidExisting"),
      fieldId: F.UpstreamAutoSync,
      renderer: "boolean",
      section: "sync",
      order: 20,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.autoSync.label"),
      resolveHelp: (t) =>
        t("managedSiteChannels:editor.advanced.autoSync.help"),
      disabledWhen: (v) =>
        v[F.UpstreamCheck] !== true ||
        !supportsNewApiUpstreamModelCheck(v[F.Type]),
    },
    {
      resolveReadOnlyHelp: (t) =>
        t("managedSiteChannels:editor.advanced.invalidExisting"),
      fieldId: F.UpstreamIgnoredModels,
      renderer: "multi-select",
      section: "sync",
      order: 30,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.ignored.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.ignored.help"),
      disabledWhen: (v) => !supportsNewApiUpstreamModelCheck(v[F.Type]),
    },
    {
      fieldId: F.UpstreamLastCheck,
      renderer: "number",
      section: "sync",
      order: 40,
      resolveLabel: (t) => t("managedSiteChannels:editor.advanced.lastCheck"),
      channelFieldRole: "timestamp",
      inlineGroup: "detection-summary",
      isConfigured: () => false,
    },
    {
      fieldId: F.UpstreamDetectedModels,
      renderer: "multi-select",
      section: "sync",
      order: 50,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.detectedModels"),
      channelFieldRole: "model-summary",
      inlineGroup: "detection-summary",
      isConfigured: () => false,
    },
    {
      fieldId: F.UpstreamRemovedModels,
      renderer: "multi-select",
      section: "sync",
      order: 60,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.removedModels"),
      channelFieldRole: "model-summary",
      inlineGroup: "detection-summary",
      isConfigured: () => false,
    },
    {
      fieldId: F.TestModel,
      renderer: "text",
      section: "models",
      order: 100,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.testModel.label"),
      resolveHelp: (t) =>
        t("managedSiteChannels:editor.advanced.testModel.help"),
      advancedControl: "model-input",
      suggestionSourceFieldId: F.Models,
    },
    {
      fieldId: F.AutoBan,
      renderer: "boolean",
      section: "routing",
      order: 110,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.autoBan.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.autoBan.help"),
    },
    {
      fieldId: F.ModelMapping,
      renderer: "multi-select",
      section: "models",
      order: 200,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.mapping.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.mapping.help"),
      issueLabelResolvers: {
        invalid_value: (t) =>
          t("managedSiteChannels:editor.advanced.mapping.invalid"),
      },
      channelFieldRole: "string-mapping",
      suggestionFieldId: F.Models,
    },
    {
      fieldId: F.Tag,
      renderer: "text",
      section: "metadata",
      order: 300,
      resolveLabel: (t) => t("managedSiteChannels:editor.advanced.tag"),
    },
    {
      fieldId: F.Remark,
      renderer: "textarea",
      section: "metadata",
      order: 310,
      rows: 3,
      resolveLabel: (t) =>
        t("managedSiteChannels:editor.advanced.remark.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.remark.help"),
    },
    {
      resolveReadOnlyHelp: (t) =>
        t("managedSiteChannels:editor.advanced.invalidExisting"),
      fieldId: F.Proxy,
      renderer: "text",
      section: "requests",
      order: 400,
      resolveLabel: (t) => t("managedSiteChannels:editor.advanced.proxy.label"),
      resolveHelp: (t) => t("managedSiteChannels:editor.advanced.proxy.help"),
      issueLabelResolvers: {
        invalid_value: (t) =>
          t("managedSiteChannels:editor.advanced.proxy.invalid"),
      },
    },
  ]

/** Summaries expose configured field labels, never connection values or notes. */
const sectionSummary =
  (section: ManagedResourceFieldPresentation["section"]) =>
  (t: TFunction, values: EditableResourceProjection) => {
    const labels = newApiAdvancedFields
      .filter((field) => {
        if (field.section !== section) return false
        if (field.isConfigured) return field.isConfigured(values)
        const value = values[field.fieldId]
        return Array.isArray(value)
          ? value.length > 0
          : typeof value === "string"
            ? value.trim().length > 0
            : value === true
      })
      .map((field) => field.resolveLabel(t))
    return labels.length
      ? labels.join(" · ")
      : section === "models"
        ? ""
        : t("ui:resourceEditor.optional")
  }

/** Shares the compact, independently collapsible channel layout with other providers. */
export const newApiSections = {
  basic: {
    columns: 2,
    defaultOpen: true,
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.sections.basicConnection"),
  },
  models: { defaultOpen: true, resolveSummary: sectionSummary("models") },
  sync: {
    resolveSummary: sectionSummary("sync"),
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.advanced.groups.detection"),
  },
  routing: { columns: 2 },
  metadata: {
    resolveSummary: sectionSummary("metadata"),
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.advanced.groups.management"),
  },
  requests: {
    resolveSummary: sectionSummary("requests"),
    resolveLabel: (t) =>
      t("managedSiteChannels:editor.advanced.groups.network"),
  },
} satisfies ManagedResourceEditorFieldPolicy["sections"]
