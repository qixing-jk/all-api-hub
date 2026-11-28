import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import {
  AIMLAPI_KEY_LIMIT_MODES,
  AIMLAPI_KEY_EDITOR_FIELDS as aimlApiFields,
} from "~/services/apiAdapters/aimlapi/keyResourceFields"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/resourceNative"
import { AIMLAPI_KEY_EDITOR_LIMITS } from "~/services/apiService/aimlapi/constants"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  expiryField,
  issues,
  name,
} from "./nativeKeyResourceFieldPrimitives"

/** AI/ML API: name, model scopes, USD spend limit, allowed models, expiry. */
export const buildAimlApiFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  sections: {
    basic: { defaultOpen: true },
    spending: { defaultOpen: true },
    lifecycle: { defaultOpen: true },
    advanced: { defaultOpen: false },
  },
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
  fields: [
    name,
    {
      fieldId: aimlApiFields.AllowedTools,
      section: "basic",
      order: 6,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.allowedTools"),
      resolveHelp: (t: TFunction) =>
        `${t("keyManagement:native.editor.aimlapi.allowedToolsHelp")} ${t("keyManagement:native.editor.aimlapi.maximum", { maximum: AIMLAPI_KEY_EDITOR_LIMITS.AllowedTools })}`,
      issueLabelResolvers: {
        ...issues,
        out_of_range: (t) =>
          t("keyManagement:native.editor.aimlapi.maximum", {
            maximum: AIMLAPI_KEY_EDITOR_LIMITS.AllowedTools,
          }),
      },
    },
    {
      fieldId: aimlApiFields.Scopes,
      section: "advanced",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.scopes"),
      resolvePlaceholder: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.scopesPlaceholder"),
      issueLabelResolvers: issues,
      optionLabelResolvers: {
        "model:chat": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.chat"),
        "model:responses": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.responses"),
        "model:image": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.image"),
        "model:audio": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.audio"),
        "model:video": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.video"),
        "model:embeddings": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.embeddings"),
        "model:speech": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.speech"),
        "model:ocr": (t) =>
          t("keyManagement:native.editor.aimlapi.endpoint.ocr"),
      },
    },
    {
      fieldId: aimlApiFields.LimitMode,
      section: "spending",
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.spendLimit"),
      issueLabelResolvers: issues,
      optionLabelResolvers: {
        unlimited: (t) =>
          t("keyManagement:native.editor.aimlapi.limit.unlimited"),
        limited: (t) => t("keyManagement:native.editor.aimlapi.limit.limited"),
      },
    },
    {
      fieldId: aimlApiFields.LimitAmount,
      section: "spending",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.spendLimitAmount"),
      resolvePlaceholder: (t: TFunction) =>
        t("keyManagement:dialog.quotaPlaceholder"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[aimlApiFields.LimitMode] !== AIMLAPI_KEY_LIMIT_MODES.Unlimited,
      issueLabelResolvers: issues,
    },
    {
      fieldId: aimlApiFields.LimitRetention,
      section: "spending",
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.spendLimitReset"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[aimlApiFields.LimitMode] !== AIMLAPI_KEY_LIMIT_MODES.Unlimited,
      optionLabelResolvers: {
        day: (t: TFunction) =>
          t("keyManagement:native.editor.aimlapi.reset.day"),
        week: (t: TFunction) =>
          t("keyManagement:native.editor.aimlapi.reset.week"),
        month: (t: TFunction) =>
          t("keyManagement:native.editor.aimlapi.reset.month"),
        never: (t: TFunction) =>
          t("keyManagement:native.editor.aimlapi.reset.never"),
      },
      issueLabelResolvers: issues,
    },
    {
      fieldId: aimlApiFields.AllowedModels,
      section: "basic",
      order: 5,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.allowedModels"),
      resolveHelp: (t: TFunction) =>
        `${t("keyManagement:native.editor.aimlapi.allowedModelsHelp")} ${t("keyManagement:native.editor.aimlapi.maximum", { maximum: AIMLAPI_KEY_EDITOR_LIMITS.AllowedModels })}`,
      resolvePlaceholder: (t: TFunction) =>
        t("keyManagement:native.editor.aimlapi.allowedModelsPlaceholder"),
      issueLabelResolvers: {
        ...issues,
        out_of_range: (t: TFunction) =>
          t("keyManagement:native.editor.aimlapi.maximum", {
            maximum: AIMLAPI_KEY_EDITOR_LIMITS.AllowedModels,
          }),
      },
    },
    {
      ...expiryField(aimlApiFields.ExpiresAt),
      ...(mode === editorModes.Edit
        ? {
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.aimlapi.expiryImmutable"),
            resolveReadOnlyValue: (t: TFunction, value: string) =>
              value
                ? formatLocaleDateTime(value)
                : t("keyManagement:keyDetails.neverExpires"),
          }
        : {}),
      // The update route ignores `expires_at`; the descriptor marks it read-only
      // in edit mode so the dialog never promises an unsavable change.
    },
    ...(mode === editorModes.Edit ? [enabled(aimlApiFields.Enabled)] : []),
  ],
})
