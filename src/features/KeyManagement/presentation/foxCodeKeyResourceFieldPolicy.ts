import type { TFunction } from "i18next"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { FOXCODE_KEY_EDITOR_FIELDS as foxCodeFields } from "~/services/apiAdapters/foxcode/keyEditorFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  groupNamePolicy,
  issues,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildFoxCodeFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  requireFreshOptions: true,
  automaticName: groupNamePolicy(
    foxCodeFields.Channel,
    true,
    DEFAULT_AUTO_PROVISION_KEY_NAME,
  ),
  fields: [
    name,
    {
      fieldId: foxCodeFields.Description,
      section: "basic",
      order: 5,
      renderer: RESOURCE_FIELD_TYPES.Textarea,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.description"),
      issueLabelResolvers: issues,
    },
    {
      fieldId: foxCodeFields.Channel,
      section: "basic",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t: TFunction) => t("keyManagement:native.editor.channel"),
      issueLabelResolvers: issues,
    },
    ...quota(foxCodeFields.Quota, foxCodeFields.Unlimited, true),
    ...(mode === editorModes.Edit
      ? [{ ...enabled(foxCodeFields.Enabled), section: "basic", order: 30 }]
      : []),
  ],
})
