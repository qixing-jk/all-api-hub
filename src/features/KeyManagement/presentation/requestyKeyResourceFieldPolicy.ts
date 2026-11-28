import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { type ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { REQUESTY_KEY_FIELDS as requestyFields } from "~/services/apiAdapters/requesty/keys/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { expiryField, issues, name } from "./nativeKeyResourceFieldPrimitives"

export const buildRequestyFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
  fields: [
    // Requesty has no name-update endpoint, so the name is create-only.
    ...(mode === editorModes.Create
      ? ([
          name,
          {
            fieldId: requestyFields.ManagePermission,
            section: "advanced",
            order: 10,
            renderer: RESOURCE_FIELD_TYPES.Boolean,
            resolveLabel: (t: TFunction) =>
              t("keyManagement:native.editor.requestyManagePermission"),
            resolveHelp: (t: TFunction) =>
              t("keyManagement:native.editor.requestyManagePermissionHelp"),
            issueLabelResolvers: issues,
          },
        ] as ResourceFieldPresentation[])
      : []),
    {
      fieldId: requestyFields.MonthlyLimit,
      section: "spending",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t) =>
        t("keyManagement:native.editor.requestyMonthlyLimit"),
      resolvePlaceholder: (t) =>
        t("keyManagement:native.editor.requestyMonthlyLimitPlaceholder"),
      issueLabelResolvers: issues,
    },
    ...(mode === editorModes.Edit
      ? [expiryField(requestyFields.ExpiresAt)]
      : []),
  ],
})
