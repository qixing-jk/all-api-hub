import type { TFunction } from "i18next"

import type { ResourceFieldPresentation } from "~/features/ResourceEditor/resourceFieldPolicy"
import {
  LAOZHANG_BILLING_TYPES as billing,
  LAOZHANG_KEY_FIELD_IDS as field,
  LAOZHANG_AUTO_GROUP,
  LAOZHANG_RETRY_BILLING_MODES as retryBilling,
} from "~/services/apiAdapters/newApi/laozhangKeyResourceFields"

/** Ordinary-account LaoZhang controls, rendered by the shared native editor. */
export const laozhangDeploymentFields = (
  issues: Record<string, (t: TFunction) => string>,
): ResourceFieldPresentation[] => [
  {
    fieldId: field.BillingType,
    section: "basic",
    order: 40,
    renderer: "select",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.billingType"),
    issueLabelResolvers: issues,
    optionLabelResolvers: {
      [billing.Usage]: (t) =>
        t("keyManagement:native.editor.laozhang.billingUsage"),
      [billing.Request]: (t) =>
        t("keyManagement:native.editor.laozhang.billingRequest"),
      [billing.Hybrid]: (t) =>
        t("keyManagement:native.editor.laozhang.billingHybrid"),
      [billing.UsagePriority]: (t) =>
        t("keyManagement:native.editor.laozhang.billingUsagePriority"),
      [billing.RequestPriority]: (t) =>
        t("keyManagement:native.editor.laozhang.billingRequestPriority"),
    },
  },
  {
    fieldId: field.FallbackGroups,
    section: "basic",
    order: 50,
    renderer: "multi-select",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.fallbackGroups"),
    issueLabelResolvers: issues,
    resolveHelp: (t) => t("keyManagement:native.editor.laozhang.fallbackHelp"),
    visibleWhen: (values) => values.group !== LAOZHANG_AUTO_GROUP,
  },
  {
    fieldId: field.Remark,
    section: "basic",
    order: 60,
    renderer: "textarea",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.remark"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: field.ActivateOnFirstUse,
    section: "lifecycle",
    order: 70,
    renderer: "boolean",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.activateOnFirstUse"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: field.ValidDuration,
    section: "lifecycle",
    order: 80,
    renderer: "number",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.validDuration"),
    issueLabelResolvers: issues,
    resolveHelp: (t) =>
      t("keyManagement:native.editor.laozhang.activationHelp"),
  },
  {
    fieldId: field.RateLimitEnabled,
    section: "advanced",
    order: 90,
    renderer: "boolean",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.rateLimitEnabled"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: field.RateLimitDuration,
    section: "advanced",
    order: 100,
    renderer: "number",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.rateLimitDuration"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.RateLimitEnabled] === true,
  },
  {
    fieldId: field.RateLimitNum,
    section: "advanced",
    order: 110,
    renderer: "number",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.rateLimitNum"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.RateLimitEnabled] === true,
  },
  {
    fieldId: field.RateLimitMessage,
    section: "advanced",
    order: 120,
    renderer: "textarea",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.rateLimitMessage"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.RateLimitEnabled] === true,
  },
  {
    fieldId: field.RetryBilling,
    section: "advanced",
    order: 130,
    renderer: "select",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.retryBilling"),
    issueLabelResolvers: issues,
    optionLabelResolvers: {
      [retryBilling.Auto]: (t) =>
        t("keyManagement:native.editor.laozhang.retryAuto"),
      [retryBilling.On]: (t) =>
        t("keyManagement:native.editor.laozhang.retryOn"),
      [retryBilling.Off]: (t) =>
        t("keyManagement:native.editor.laozhang.retryOff"),
    },
  },
  {
    fieldId: field.DiscordProxyUrl,
    section: "advanced",
    order: 140,
    renderer: "textarea",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.discordProxy"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: field.TranslationEnabled,
    section: "advanced",
    order: 150,
    renderer: "boolean",
    resolveLabel: (t) =>
      t("keyManagement:native.editor.laozhang.mjTranslation"),
    issueLabelResolvers: issues,
  },
  {
    fieldId: field.TranslationBaseUrl,
    section: "advanced",
    order: 160,
    renderer: "textarea",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.mjBaseUrl"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.TranslationEnabled] === true,
  },
  {
    fieldId: field.TranslationApiKey,
    section: "advanced",
    order: 170,
    renderer: "secret",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.mjApiKey"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.TranslationEnabled] === true,
  },
  {
    fieldId: field.TranslationModel,
    section: "advanced",
    order: 180,
    renderer: "textarea",
    resolveLabel: (t) => t("keyManagement:native.editor.laozhang.mjModel"),
    issueLabelResolvers: issues,
    visibleWhen: (values) => values[field.TranslationEnabled] === true,
  },
]
