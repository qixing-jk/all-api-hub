import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import {
  RESOURCE_FIELD_TYPES,
  RESOURCE_SECRET_EDIT_INTENT_KINDS,
} from "~/services/apiAdapters/contracts/resourceNative"
import { DAYA_KEY_EDITOR_FIELDS as dayaFields } from "~/services/apiAdapters/daya/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  group,
  ips,
  issues,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

// Daya group order controls routing; window budgets are native USD limits.
export const buildDayaFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  sections: {
    basic: { defaultOpen: true },
    spending: { defaultOpen: true },
    lifecycle: { defaultOpen: true },
    advanced: {
      defaultOpen: false,
      resolveSummary: (t, values) => {
        const customKey = values[dayaFields.CustomKey]
        return [
          typeof values[dayaFields.IpWhitelist] === "string" &&
            String(values[dayaFields.IpWhitelist]).trim() &&
            t("keyManagement:native.editor.daya.ipWhitelist"),
          typeof values[dayaFields.IpBlacklist] === "string" &&
            String(values[dayaFields.IpBlacklist]).trim() &&
            t("keyManagement:native.editor.daya.ipBlacklist"),
          customKey &&
            typeof customKey === "object" &&
            "kind" in customKey &&
            customKey.kind === RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace &&
            t("keyManagement:native.editor.daya.customKey"),
        ]
          .filter(Boolean)
          .join(" · ")
      },
    },
  },
  requireFreshOptions: true,
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  fields: [
    name,
    {
      ...group(dayaFields.Groups, true),
      ordered: true,
      multiSelectLayout: "cards",
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.daya.groupOrderHelp"),
    },
    {
      fieldId: dayaFields.AllowFast,
      section: "spending",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.daya.allowFast"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.daya.allowFastHelp"),
      issueLabelResolvers: issues,
    },
    ...(mode === editorModes.Create
      ? ([
          {
            fieldId: dayaFields.CustomKey,
            section: "advanced",
            order: 0,
            renderer: RESOURCE_FIELD_TYPES.Secret,
            resolveLabel: (t: TFunction) =>
              t("keyManagement:native.editor.daya.customKey"),
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.daya.customKeyHelp"),
            issueLabelResolvers: issues,
          },
        ] satisfies ResourceFieldPresentation[])
      : []),
    {
      ...ips(dayaFields.IpWhitelist),
      rows: 3,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.daya.ipWhitelist"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.allowlistHelp"),
    },
    {
      ...ips(dayaFields.IpBlacklist),
      order: 21,
      rows: 3,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.daya.ipBlacklist"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.allowlistHelp"),
    },
    {
      fieldId: dayaFields.RateLimit5h,
      section: "spending",
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) => t("keyManagement:native.editor.budget5h"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.daya.budgetHelp"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: dayaFields.RateLimit1d,
      section: "spending",
      order: 21,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.budgetDay"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: dayaFields.RateLimit7d,
      section: "spending",
      order: 22,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.daya.budget7d"),
      issueLabelResolvers: issues,
    },
    ...quota(dayaFields.Quota, dayaFields.Unlimited, true),
    ...(mode === editorModes.Edit
      ? ([
          { ...enabled(dayaFields.Enabled), section: "basic", order: 30 },
        ] satisfies ResourceFieldPresentation[])
      : []),
    {
      fieldId:
        mode === editorModes.Edit
          ? dayaFields.ExpiresAt
          : dayaFields.ExpiresInDays,
      section: "lifecycle",
      order: 0,
      renderer:
        mode === editorModes.Edit
          ? RESOURCE_FIELD_TYPES.DateTime
          : RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        mode === editorModes.Edit
          ? t("keyManagement:dialog.expiration")
          : t("keyManagement:native.editor.expiryDays"),
      resolveHelp: (t: TFunction) =>
        mode === editorModes.Edit
          ? t("keyManagement:dialog.expirationPlaceholder")
          : "",
      issueLabelResolvers: issues,
    },
  ],
})
