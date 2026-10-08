import type { TFunction } from "i18next"

import type { ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"

/**
 * Presentation rules for the fields Rix API 6.x owns next to the New API
 * projection: its count quota, the IP deny list, the media storage node and
 * whether the key may fail over to other groups.
 */
export const rixApiDeploymentFields = (
  issues: Record<string, (t: TFunction) => string>,
): ResourceFieldPresentation[] => [
  {
    fieldId: "unlimited_count",
    section: "spending",
    order: 20,
    renderer: "boolean",
    resolveLabel: (t) => t("keyManagement:native.editor.unlimitedCount"),
    resolveHelp: (t) => t("keyManagement:native.editor.unlimitedCountHelp"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: "remain_count",
    section: "spending",
    order: 30,
    renderer: "number",
    resolveLabel: (t) => t("keyManagement:native.editor.remainingCount"),
    resolvePlaceholder: (t) =>
      t("keyManagement:native.editor.remainingCountPlaceholder"),
    visibleWhen: (values) => values.unlimited_count !== true,
    issueLabelResolvers: issues,
  },
  {
    fieldId: "group_only",
    section: "basic",
    order: 11,
    renderer: "boolean",
    resolveLabel: (t) => t("keyManagement:native.editor.groupOnly"),
    resolveHelp: (t) => t("keyManagement:native.editor.groupOnlyHelp"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: "exclude_ips",
    section: "advanced",
    order: 30,
    renderer: "textarea",
    resolveLabel: (t) => t("keyManagement:native.editor.excludeIps"),
    resolvePlaceholder: (t) =>
      t("keyManagement:native.editor.excludeIpsPlaceholder"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: "storage_location",
    section: "advanced",
    order: 40,
    renderer: "select",
    resolveLabel: (t) => t("keyManagement:native.editor.storageLocation"),
    resolveHelp: (t) => t("keyManagement:native.editor.storageLocationHelp"),
    optionLabelResolvers: {
      global: (t) => t("keyManagement:native.editor.storageLocationGlobal"),
      none: (t) => t("keyManagement:native.editor.storageLocationNone"),
    },
    resolveNullableOptionLabel: (t) =>
      t("keyManagement:native.editor.storageLocationUnconfigured"),
    issueLabelResolvers: issues,
  },
]
