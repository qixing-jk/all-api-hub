import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  expiry,
  group,
  groupNamePolicy,
  ips,
  issues,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildSub2ApiFields = (
  mode: AccountKeyResourceEditorMode,
): AccountKeyResourceFieldConfiguration => ({
  automaticName: groupNamePolicy("group_id", true),
  fields: [
    name,
    group("group_id"),
    ...quota("quota", "unlimited", true),
    mode === editorModes.Edit
      ? expiry
      : {
          fieldId: "expires_in_days",
          section: "lifecycle",
          order: 0,
          renderer: RESOURCE_FIELD_TYPES.Number,
          resolveLabel: (t) => t("keyManagement:native.editor.expiryDays"),
          resolveHelp: (t) => t("keyManagement:dialog.expirationPlaceholder"),
          issueLabelResolvers: issues,
        },
    ...(mode === editorModes.Edit ? [enabled("enabled")] : []),
    ips("ip_whitelist"),
  ],
})
