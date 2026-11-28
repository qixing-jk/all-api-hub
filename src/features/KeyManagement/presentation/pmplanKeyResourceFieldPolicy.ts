import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import type { ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import {
  PMPLAN_KEY_EXPIRY_PRESETS as expiry,
  PMPLAN_KEY_EDITOR_FIELDS as fields,
} from "~/services/apiAdapters/pmplan/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { expiryField, models } from "./nativeKeyResourceFieldPrimitives"

/** Native keys inherit rolling allowances; existing keys edit only restrictions. */
export function buildPmplanKeyFields(
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration {
  const expiration = expiryField(fields.ExpiresAt)
  const modelField = models(fields.Models)
  const presentation: ResourceFieldPresentation[] = [
    {
      fieldId: fields.Expiry,
      section: "basic",
      order: 0,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t) => t("keyManagement:dialog.expiration"),
      optionLabelResolvers: {
        [expiry.SevenDays]: (t) => t("common:datePicker.in7Days"),
        [expiry.ThirtyDays]: (t) =>
          t("keyManagement:native.editor.novita.days30"),
        [expiry.NinetyDays]: (t) =>
          t("keyManagement:native.editor.novita.days90"),
        [expiry.Never]: (t) =>
          t("keyManagement:native.editor.emrank.expirationOptions.never"),
        [expiry.Custom]: (t) =>
          t("keyManagement:native.editor.emrank.expirationOptions.custom"),
      },
      issueLabelResolvers: expiration.issueLabelResolvers,
    },
    {
      ...expiration,
      section: "basic",
      order: 1,
      resolveLabel: (t) =>
        t("keyManagement:native.editor.emrank.expirationOptions.custom"),
      resolveHelp: (t) =>
        t("keyManagement:native.editor.pmplan.customExpiryHelp"),
      visibleWhen: (values) => values[fields.Expiry] === expiry.Custom,
    },
    {
      ...modelField,
      section: "basic",
      resolveHelp: (t) => t("keyManagement:native.editor.pmplan.modelsHelp"),
    },
  ]
  return {
    requireFreshOptions: true,
    automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    fields: presentation.filter(
      (field) =>
        mode === ACCOUNT_KEY_RESOURCE_EDITOR_MODES.Create ||
        field.fieldId === fields.Models,
    ),
  }
}
