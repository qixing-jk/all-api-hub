import type { TFunction } from "i18next"

import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"
import { vercelKeyFields } from "~/services/apiAdapters/vercelAiGateway/keyEditor"
import {
  VERCEL_KEY_SPEND_ATTRIBUTIONS as attributions,
  VERCEL_BUDGET_REFRESH_PERIODS as budgetPeriods,
} from "~/services/apiService/vercelAiGateway/keys"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { expiry, issues, name } from "./nativeKeyResourceFieldPrimitives"

/**
 * The native AI Gateway create dialog: required name, optional expiry and spend
 * attribution (User default). Existing keys edit their budget and attribution;
 * immutable identity and expiry remain read-only.
 */
export const buildVercelAiGatewayFields = (
  descriptors?: readonly ResourceFieldDescriptor[],
): AccountKeyResourceFieldConfiguration => {
  const fields: ResourceFieldPresentation[] = [
    name,
    {
      ...expiry,
      fieldId: vercelKeyFields.ExpiresAt,
      section: "advanced",
    },
    {
      fieldId: vercelKeyFields.SpendAttribution,
      section: "spending" as const,
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.spendAttribution"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.spendAttributionHelp"),
      optionLabelResolvers: {
        [attributions.User]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.attribution.user"),
        [attributions.Team]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.attribution.team"),
      },
      issueLabelResolvers: issues,
    },
    {
      fieldId: vercelKeyFields.BudgetEnabled,
      section: "spending" as const,
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.budgetEnabled"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.budgetHelp"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: vercelKeyFields.BudgetLimit,
      section: "spending" as const,
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.budgetLimit"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[vercelKeyFields.BudgetEnabled] === true,
      issueLabelResolvers: issues,
    },
    {
      fieldId: vercelKeyFields.BudgetPeriod,
      section: "spending" as const,
      order: 30,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.budgetPeriod"),
      optionLabelResolvers: {
        [budgetPeriods.None]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.period.none"),
        [budgetPeriods.Daily]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.period.daily"),
        [budgetPeriods.Weekly]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.period.weekly"),
        [budgetPeriods.Monthly]: (t: TFunction) =>
          t("keyManagement:native.editor.vercelAiGateway.period.monthly"),
      },
      visibleWhen: (values: EditableResourceProjection) =>
        values[vercelKeyFields.BudgetEnabled] === true,
      issueLabelResolvers: issues,
    },
    {
      fieldId: vercelKeyFields.BudgetAlerts,
      multiSelectLayout: "cards",
      section: "spending" as const,
      order: 40,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.vercelAiGateway.budgetAlerts"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[vercelKeyFields.BudgetEnabled] === true,
      issueLabelResolvers: issues,
    },
  ]
  return {
    automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
    fields: fields.filter(
      (field) =>
        !descriptors ||
        descriptors.some((descriptor) => descriptor.fieldId === field.fieldId),
    ),
  }
}
