import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  expiry,
  groupNamePolicy,
  issues,
  models,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildRightCodeFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  automaticName: groupNamePolicy("channel", true),
  fields: [
    name,
    {
      fieldId: "channel",
      section: "basic",
      order: 10,
      renderer: RESOURCE_FIELD_TYPES.Select,
      resolveLabel: (t) => t("keyManagement:native.editor.channel"),
      issueLabelResolvers: issues,
    },
    ...quota("quotaUsd", "unlimited_quota"),
    expiry,
    ...(mode === editorModes.Edit ? [enabled("is_active")] : []),
    models("models"),
    {
      fieldId: "allow_wallet",
      section: "spending",
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.Boolean,
      resolveLabel: (t) => t("keyManagement:native.editor.allowWallet"),
      resolveHelp: (t) => t("keyManagement:native.editor.allowWalletHelp"),
      issueLabelResolvers: issues,
    },
  ],
})
