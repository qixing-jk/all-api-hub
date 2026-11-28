import type { TFunction } from "i18next"

import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { RELAYFOR_KEY_FIELDS as relayForFields } from "~/services/apiAdapters/relayfor/keyFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  expiryField,
  ips,
  issues,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildRelayForFields =
  (): AccountKeyResourceFieldConfiguration => ({
    sections: {
      basic: { columns: 2 as const, defaultOpen: true },
      limits: { columns: 2 as const, defaultOpen: false },
      advanced: { columns: 2 as const, defaultOpen: true },
    },
    automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
    fields: [
      name,
      ...(
        [
          [
            relayForFields.Budget5h,
            (t: TFunction) => t("keyManagement:native.editor.budget5h"),
          ],
          [
            relayForFields.BudgetDay,
            (t: TFunction) => t("keyManagement:native.editor.budgetDay"),
          ],
          [
            relayForFields.BudgetWeek,
            (t: TFunction) => t("keyManagement:native.editor.budgetWeek"),
          ],
          [
            relayForFields.BudgetMonth,
            (t: TFunction) => t("keyManagement:native.editor.budgetMonth"),
          ],
          [
            relayForFields.RequestsPerMinute,
            (t: TFunction) => t("keyManagement:native.editor.keyRpm"),
          ],
          [
            relayForFields.ConcurrentRequests,
            (t: TFunction) => t("keyManagement:native.editor.keyConcurrency"),
          ],
        ] as const
      ).map(([fieldId, resolveLabel], order) => ({
        fieldId,
        resolveLabel,
        section: "limits",
        width: "half" as const,
        order,
        renderer: RESOURCE_FIELD_TYPES.Number,
        resolveHelp: (t: TFunction) =>
          fieldId === relayForFields.Budget5h
            ? t("keyManagement:native.editor.budgetResetHelp")
            : fieldId.startsWith("budget_")
              ? ""
              : t("keyManagement:native.editor.keyRateHelp"),
        issueLabelResolvers: issues,
      })),
      {
        ...quota(relayForFields.QuotaUsd, relayForFields.UnlimitedQuota)[0]!,
        section: "basic",
        order: 10,
        resolveLabel: (t: TFunction) =>
          t("keyManagement:native.editor.keyUnlimitedQuota"),
        resolveHelp: (t: TFunction) =>
          t("keyManagement:native.editor.keyUnlimitedQuotaHelp"),
      },
      {
        ...quota(relayForFields.QuotaUsd, relayForFields.UnlimitedQuota)[1]!,
        section: "basic",
        order: 20,
        width: "half",
        resolveLabel: (t: TFunction) =>
          t("keyManagement:native.editor.independentQuotaUsd"),
        resolveHelp: (t: TFunction) =>
          t("keyManagement:native.editor.followAccountQuotaHelp"),
      },
      {
        ...expiryField(relayForFields.ExpiredAt),
        section: "basic",
        order: 30,
        width: "half",
      },
      {
        fieldId: relayForFields.ModelLimits,
        width: "half",
        rows: 2,
        section: "advanced" as const,
        order: 10,
        renderer: RESOURCE_FIELD_TYPES.Textarea,
        resolveLabel: (t: TFunction) =>
          t("keyManagement:native.editor.modelAllowlist"),
        resolveHelp: (t: TFunction) =>
          t("keyManagement:native.editor.allowlistHelp"),
        issueLabelResolvers: issues,
      },
      {
        ...ips(relayForFields.IpLimits),
        width: "half",
        rows: 2,
        resolveLabel: (t: TFunction) =>
          t("keyManagement:native.editor.ipCidrAllowlist"),
        resolveHelp: (t: TFunction) =>
          t("keyManagement:native.editor.allowlistHelp"),
      },
    ],
  })
