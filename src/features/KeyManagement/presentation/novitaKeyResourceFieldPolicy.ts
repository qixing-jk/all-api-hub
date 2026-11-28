import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import {
  RESOURCE_FIELD_TYPES,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { issues, name } from "./nativeKeyResourceFieldPrimitives"

export const buildNovitaFields = (
  mode: AccountKeyResourceEditorMode,
  descriptors?: readonly ResourceFieldDescriptor[],
): AccountKeyResourceFieldConfiguration => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  fields: [
    ...(descriptors && !descriptors.some((field) => field.fieldId === "name")
      ? []
      : [name]),
    ...(mode === editorModes.Create
      ? [
          {
            fieldId: "lifecycle",
            section: "basic",
            order: 10,
            renderer: RESOURCE_FIELD_TYPES.Select,
            resolveLabel: (t: TFunction) =>
              t("keyManagement:dialog.expiration"),
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.novita.lifecycleHelp"),
            optionLabelResolvers: {
              permanent: (t: TFunction) =>
                t("keyManagement:native.editor.novita.permanent"),
              "90d": (t: TFunction) =>
                t("keyManagement:native.editor.novita.days90"),
              "30d": (t: TFunction) =>
                t("keyManagement:native.editor.novita.days30"),
              "24h": (t: TFunction) =>
                t("keyManagement:native.editor.novita.hours24"),
            },
            issueLabelResolvers: issues,
          },
        ]
      : []),
    {
      fieldId: "model_mode",
      section: "advanced",
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.novita.modelAccess"),
      optionLabelResolvers: {
        all_enabled: (t: TFunction) =>
          t("keyManagement:native.editor.novita.allEnabled"),
        selected: (t: TFunction) =>
          t("keyManagement:native.editor.novita.selected"),
      },
      issueLabelResolvers: issues,
    },
    {
      fieldId: "excluded_models",
      section: "advanced",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.novita.excludedModels"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.novita.modelChoicesHelp"),
      visibleWhen: (values: EditableResourceProjection) =>
        values.model_mode === "all_enabled",
      issueLabelResolvers: issues,
    },
    {
      fieldId: "allowed_models",
      section: "advanced",
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.MultiSelect,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.novita.allowedModels"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.novita.modelChoicesHelp"),
      visibleWhen: (values: EditableResourceProjection) =>
        values.model_mode === "selected",
      issueLabelResolvers: issues,
    },
    {
      fieldId: "ip_restricted",
      section: "advanced",
      order: 30,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.novita.restrictIps"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: "allowed_ips",
      section: "advanced",
      order: 40,
      renderer: RESOURCE_FIELD_TYPES.Textarea,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.novita.allowedIps"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.novita.allowedIpsHelp"),
      visibleWhen: (values: EditableResourceProjection) =>
        values.ip_restricted === true,
      issueLabelResolvers: issues,
    },
  ],
})
