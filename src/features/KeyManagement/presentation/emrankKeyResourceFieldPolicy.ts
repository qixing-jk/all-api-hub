import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  EMRANK_EXPIRATION_MODES,
  emrankKeyFields,
} from "~/services/apiAdapters/emrank/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  expiry,
  issues,
  name,
} from "./nativeKeyResourceFieldPrimitives"

export const buildEmRankFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  // Create has no enabled descriptor; presenting it crashes the dialog.
  fields: [
    name,
    {
      fieldId: emrankKeyFields.Unlimited,
      section: "spending" as const,
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t: TFunction) => t("keyManagement:dialog.unlimitedQuota"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: emrankKeyFields.Quota,
      section: "spending" as const,
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.quotaMToken"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.quotaHelp"),
      visibleWhen: (values: EditableResourceProjection) =>
        values[emrankKeyFields.Unlimited] !== true,
      issueLabelResolvers: issues,
    },
    {
      fieldId: emrankKeyFields.ExpirationMode,
      section: "lifecycle" as const,
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.emrank.expiration"),
      optionLabelResolvers: {
        [EMRANK_EXPIRATION_MODES.Keep]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.keep"),
        [EMRANK_EXPIRATION_MODES.Never]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.never"),
        [EMRANK_EXPIRATION_MODES.Month]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.month"),
        [EMRANK_EXPIRATION_MODES.Day]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.day"),
        [EMRANK_EXPIRATION_MODES.Hour]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.hour"),
        [EMRANK_EXPIRATION_MODES.Custom]: (t: TFunction) =>
          t("keyManagement:native.editor.emrank.expirationOptions.custom"),
      },
      issueLabelResolvers: issues,
    },
    {
      ...expiry,
      fieldId: emrankKeyFields.ExpiresAt,
      visibleWhen: (values: EditableResourceProjection) =>
        values[emrankKeyFields.ExpirationMode] ===
        EMRANK_EXPIRATION_MODES.Custom,
    },
    ...(mode === editorModes.Edit ? [enabled(emrankKeyFields.Enabled)] : []),
  ],
})
